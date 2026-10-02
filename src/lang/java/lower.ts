// Java AST → Core IR. Resolves names and static types, and maps the Java standard library
// (ArrayList, HashMap, Math, System.out, ...) onto language-neutral Builtin ops.
// Problems become diagnostics: lowering keeps going so one run reports every issue.

import { isNumeric, T, type BuiltinOp, type Comment, type Declarator, type Expr, type Fn, type Global, type Loc, type Program, type Stmt, type Type } from '../../ir/core';
import { HOST_TYPES, isViz } from '../../ir/host';
import type { Diagnostic } from '../types';
import type { JClass, JDeclarator, JExpr, JField, JMethod, JStmt, JType } from './ast';
import { charCode } from './lexer';

const INT_NAMES = new Set(['int', 'long', 'short', 'byte', 'Integer', 'Long', 'Short', 'Byte']);
const DOUBLE_NAMES = new Set(['double', 'float', 'Double', 'Float', 'Number']);
const SEQ_NAMES = new Set(['List', 'ArrayList', 'LinkedList', 'Stack', 'Vector', 'Queue', 'Deque', 'ArrayDeque', 'Collection', 'Iterable']);
const MAP_NAMES = new Set(['Map', 'HashMap', 'LinkedHashMap', 'TreeMap']);
const SET_NAMES = new Set(['Set', 'HashSet', 'LinkedHashSet', 'TreeSet']);
const SORTED_NAMES = new Set(['TreeMap', 'TreeSet', 'PriorityQueue']);

// JS words a Java identifier may collide with; renamed with a trailing underscore.
const JS_RESERVED = new Set(['arguments', 'await', 'delete', 'eval', 'export', 'function', 'in', 'let', 'typeof', 'undefined', 'var', 'with', 'yield', 'async', 'of', 'NaN', 'Infinity']);

const STRING_METHODS: Record<string, Type> = {
  substring: T.string, trim: T.string, toUpperCase: T.string, toLowerCase: T.string, repeat: T.string, concat: T.string,
  indexOf: T.int, lastIndexOf: T.int, startsWith: T.boolean, endsWith: T.boolean, split: { kind: 'array', of: T.string },
};

const MATH_INT_RESULT = new Set(['abs', 'max', 'min']);

const arrayOf = (of: Type, dims = 1): Type => (dims <= 0 ? of : arrayOf({ kind: 'array', of }, dims - 1));
const elemOf = (t: Type): Type => (t.kind === 'array' || t.kind === 'seq' || t.kind === 'set' ? t.of : T.any);
const isIntLike = (t: Type) => t.kind === 'int' || t.kind === 'char';
const isStatic = (m: { modifiers: string[] }) => m.modifiers.includes('static');
const defaultFill = (t: Type) => (isNumeric(t) ? 0 : t.kind === 'boolean' ? false : null);

export function jsName(name: string) {
  return JS_RESERVED.has(name) || name.startsWith('__') ? `${name}_` : name;
}

interface Binding {
  type: Type;
  js: string;
}

interface FnSig {
  params: Type[];
  returnType: Type;
}

export class Lowerer {
  diagnostics: Diagnostic[] = [];
  private scopes: Map<string, Binding>[] = [];
  private globals = new Map<string, Binding>();
  private functions = new Map<string, FnSig>();
  private className = '';

  // ---------- diagnostics ----------

  private error(message: string, loc: Loc): Expr {
    this.diagnostics.push({ severity: 'error', message, line: loc.line, column: loc.column });
    return { kind: 'Invalid', type: T.any, loc };
  }
  private warn(message: string, loc: Loc) {
    this.diagnostics.push({ severity: 'warning', message, line: loc.line, column: loc.column });
  }

  // ---------- program ----------

  lowerClass(cls: JClass, comments: Comment[]): Program {
    this.className = cls.name;
    const methods = cls.members.filter((m): m is JMethod => m.kind === 'Method');

    for (const m of cls.members) {
      if (isStatic(m)) continue;
      const name = m.kind === 'Method' ? m.name : m.decls[0].name;
      this.warn(`'${name}' is not static; it is converted as a static ${m.kind === 'Method' ? 'method' : 'field'}`, m.loc);
    }
    for (const m of methods) {
      if (this.functions.has(m.name)) this.error(`Overloaded method '${m.name}' is not supported yet (JavaScript has one function per name)`, m.loc);
      this.functions.set(m.name, { params: m.params.map((p) => this.resolve(p.type)), returnType: this.resolve(m.returnType) });
    }
    if (!this.functions.has('run')) {
      this.warn('Define `static void run(<input>, Viz viz)` — the visualizer calls it with your input', cls.loc);
    }

    // Fields first, so methods can use fields declared below them; items keep source order.
    const globals = new Map<JField, Global>();
    for (const m of cls.members) {
      if (m.kind !== 'Field') continue;
      this.scopes = [this.globals];
      globals.set(m, { kind: 'Global', decl: this.varDecl(m.type, m.decls, m.modifiers.includes('final'), m.loc), loc: m.loc });
    }
    const items = cls.members.map((m) => (m.kind === 'Field' ? globals.get(m)! : this.method(m)));
    return { items, comments };
  }

  private method(m: JMethod): Fn {
    this.scopes = [this.globals, new Map()];
    const params = m.params.map((p) => {
      const type = this.resolve(p.type);
      return { name: this.declare(p.name, type), type };
    });
    const body = this.block(m.body, false) as Stmt & { kind: 'Block' };
    return { kind: 'Fn', name: jsName(m.name), params, returnType: this.resolve(m.returnType), body, loc: m.loc };
  }

  // ---------- types and scopes ----------

  resolve(t: JType): Type {
    return arrayOf(this.baseType(t), t.dims);
  }

  private baseType(t: JType): Type {
    const arg = (i: number) => (t.args[i] ? this.resolve(t.args[i]) : T.any);
    if (SORTED_NAMES.has(t.name)) {
      this.error(`${t.name} is not supported yet (it keeps elements sorted)`, t.loc);
      return T.any;
    }
    if (INT_NAMES.has(t.name)) return T.int;
    if (DOUBLE_NAMES.has(t.name)) return T.double;
    switch (t.name) {
      case 'boolean':
      case 'Boolean':
        return T.boolean;
      case 'char':
      case 'Character':
        return T.char;
      case 'String':
      case 'CharSequence':
        return T.string;
      case 'void':
        return T.void;
      case 'var':
      case 'Object':
        return T.any;
    }
    if (SEQ_NAMES.has(t.name)) return { kind: 'seq', of: arg(0), origin: t.name };
    if (MAP_NAMES.has(t.name)) return { kind: 'map', key: arg(0), value: arg(1) };
    if (SET_NAMES.has(t.name)) return { kind: 'set', of: arg(0) };
    if (HOST_TYPES[t.name]) return { kind: 'host', name: t.name };
    return T.any;
  }

  private declare(name: string, type: Type): string {
    const js = jsName(name);
    this.scopes[this.scopes.length - 1].set(name, { type, js });
    return js;
  }

  private lookup(name: string): Binding | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const b = this.scopes[i].get(name);
      if (b) return b;
    }
    return undefined;
  }

  private vizInScope(): Binding | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      for (const b of this.scopes[i].values()) if (isViz(b.type)) return b;
    }
    return undefined;
  }

  private withScope<R>(fn: () => R): R {
    this.scopes.push(new Map());
    try {
      return fn();
    } finally {
      this.scopes.pop();
    }
  }

  // ---------- statements ----------

  private block(b: JStmt & { kind: 'Block' }, scoped = true): Stmt {
    const lower = () => b.body.map((s) => this.stmt(s));
    return { kind: 'Block', body: scoped ? this.withScope(lower) : lower(), endLine: b.endLine, loc: b.loc };
  }

  private varDecl(jt: JType, decls: JDeclarator[], constant: boolean, loc: Loc): Stmt & { kind: 'VarDecl' } {
    const out: Declarator[] = decls.map((d) => {
      let type = arrayOf(this.resolve(jt), d.dims);
      const init = d.init && this.expr(d.init, type);
      if (jt.name === 'var' && init) type = init.type;
      return { name: this.declare(d.name, type), type, init };
    });
    return { kind: 'VarDecl', decls: out, constant, loc };
  }

  private stmt(s: JStmt): Stmt {
    const loc = s.loc;
    switch (s.kind) {
      case 'LocalVar':
        return this.varDecl(s.type, s.decls, s.final, loc);
      case 'ExprStmt':
        return { kind: 'ExprStmt', expr: this.expr(s.expr), loc };
      case 'If':
        return { kind: 'If', test: this.expr(s.test), then: this.nested(s.then), else: s.else && this.nested(s.else), loc };
      case 'While':
        return { kind: 'While', test: this.expr(s.test), body: this.nested(s.body), loc };
      case 'DoWhile':
        return { kind: 'DoWhile', body: this.nested(s.body), test: this.expr(s.test), loc };
      case 'For':
        return this.withScope(() => {
          const init = s.init === null ? null : Array.isArray(s.init) ? s.init.map((e) => this.expr(e)) : this.stmt(s.init);
          const test = s.test && this.expr(s.test);
          const update = s.update.map((e) => this.expr(e));
          return { kind: 'For', init, test, update, body: this.nested(s.body), loc } as Stmt;
        });
      case 'ForEach':
        return this.withScope(() => {
          const iterable = this.iterable(this.expr(s.iterable));
          const type = s.type.name === 'var' ? elemOf(iterable.type) : this.resolve(s.type);
          const name = this.declare(s.name, type);
          return { kind: 'ForOf', name, type, iterable, body: this.nested(s.body), loc } as Stmt;
        });
      case 'Return':
        return { kind: 'Return', value: s.value && this.expr(s.value), loc };
      case 'Break':
      case 'Continue':
      case 'Empty':
        return { kind: s.kind, loc };
      case 'Block':
        return this.block(s);
      case 'Switch': {
        const disc = this.expr(s.disc);
        const cases = this.withScope(() =>
          s.cases.map((c) => ({ tests: c.labels.map((l) => this.expr(l)), body: c.body.map((b) => this.stmt(b)), loc: c.loc })),
        );
        return { kind: 'Switch', disc, cases, endLine: s.endLine, loc };
      }
    }
  }

  /** A loop or branch body gets its own scope even when it is a single statement. */
  private nested(s: JStmt): Stmt {
    return s.kind === 'Block' ? this.block(s) : this.withScope(() => this.stmt(s));
  }

  private iterable(e: Expr): Expr {
    const k = e.type.kind;
    if (k === 'array' || k === 'seq' || k === 'set' || k === 'any' || e.kind === 'Invalid') return e;
    if (k === 'map') return this.error('Iterate over map.keySet() or map.values() instead of the map itself', e.loc);
    return this.error(`Cannot iterate over a ${k}`, e.loc);
  }

  // ---------- expressions ----------

  expr(e: JExpr, expected?: Type): Expr {
    const loc = e.loc;
    switch (e.kind) {
      case 'Literal':
        return this.literal(e.litType, e.raw, loc);
      case 'Name': {
        const b = this.lookup(e.name);
        if (b) return { kind: 'Var', name: b.js, type: b.type, loc };
        if (e.name === this.className || /^[A-Z]/.test(e.name)) return this.error(`'${e.name}' is a class, not a value`, loc);
        return this.error(`Unknown variable '${e.name}'`, loc);
      }
      case 'Field':
        return this.field(e.object, e.name, loc);
      case 'Index': {
        const object = this.expr(e.object);
        const index = this.expr(e.index);
        if (object.type.kind === 'string') return this.error('Strings are not indexable — use s.charAt(i)', loc);
        if (object.type.kind === 'seq' || object.type.kind === 'map') return this.error('Use .get(i) on collections', loc);
        return { kind: 'Index', object, index, type: elemOf(object.type), loc };
      }
      case 'Call':
        return this.call(e.object, e.name, e.args, loc);
      case 'New':
        return this.newObject(e.type, e.args, loc);
      case 'NewArray': {
        const type = arrayOf(this.resolve(e.elem), e.dims.length + e.extraDims);
        if (e.init) return this.expr(e.init, type);
        const fill = e.extraDims > 0 ? null : defaultFill(this.resolve(e.elem));
        return { kind: 'NewArray', dims: e.dims.map((d) => this.expr(d)), fill, type, loc };
      }
      case 'ArrayInit': {
        const type = expected?.kind === 'array' ? expected : arrayOf(T.any);
        return { kind: 'ArrayLit', elements: e.elements.map((x) => this.expr(x, elemOf(type))), type, loc };
      }
      case 'Unary': {
        const operand = this.expr(e.operand);
        const type = e.op === '!' ? T.boolean : operand.type.kind === 'char' ? T.int : operand.type;
        return { kind: 'Unary', op: e.op, operand, type, loc };
      }
      case 'Update': {
        const target = this.lvalue(this.expr(e.operand));
        return { kind: 'Update', op: e.op, prefix: e.prefix, target, type: target.type, loc };
      }
      case 'Binary':
        return this.binary(e.op, this.expr(e.left), this.expr(e.right), loc);
      case 'Assign': {
        const target = this.lvalue(this.expr(e.target));
        let value = this.expr(e.value, target.type);
        if (target.type.kind === 'string' && e.op === '+=') value = this.stringify(value);
        const truncate = isIntLike(target.type) && e.op !== '=' && (e.op === '/=' || !isIntLike(value.type));
        return { kind: 'Assign', op: e.op, target, value, truncate, type: target.type, loc };
      }
      case 'Cond': {
        const then = this.expr(e.then, expected);
        const other = this.expr(e.else, expected);
        const type = then.type.kind === 'double' || other.type.kind === 'double' ? T.double : then.type.kind === 'null' ? other.type : then.type;
        return { kind: 'Cond', test: this.expr(e.test), then, else: other, type, loc };
      }
      case 'Cast': {
        const inner = this.expr(e.expr);
        return { kind: 'Convert', expr: inner, from: inner.type, type: this.resolve(e.type), loc };
      }
    }
  }

  private literal(litType: string, raw: string, loc: Loc): Expr {
    switch (litType) {
      case 'int':
      case 'long':
        return { kind: 'Literal', value: /^0[0-7]+$/.test(raw) ? parseInt(raw, 8) : Number(raw), type: T.int, loc };
      case 'double':
        return { kind: 'Literal', value: parseFloat(raw), type: T.double, loc };
      case 'char':
        return { kind: 'Literal', value: charCode(raw), type: T.char, loc };
      case 'string':
        return { kind: 'Literal', value: raw.replace(/\\(u+[0-9a-fA-F]{4}|[0-7]{1,3}|.)/g, (m) => String.fromCharCode(charCode(m))), type: T.string, loc };
      case 'boolean':
        return { kind: 'Literal', value: raw === 'true', type: T.boolean, loc };
      default:
        return { kind: 'Literal', value: null, type: T.null, loc };
    }
  }

  private lvalue(e: Expr): Expr {
    if (e.kind === 'Var' || e.kind === 'Index' || e.kind === 'Field' || e.kind === 'Invalid') return e;
    return this.error('Invalid assignment target', e.loc);
  }

  private binary(op: string, left: Expr, right: Expr, loc: Loc): Expr {
    if (op === '+' && (left.type.kind === 'string' || right.type.kind === 'string')) {
      return { kind: 'Binary', op, left: this.stringify(left), right: this.stringify(right), type: T.string, loc };
    }
    if (['==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(op)) return { kind: 'Binary', op, left, right, type: T.boolean, loc };
    if (left.type.kind === 'boolean' && ['&', '|', '^'].includes(op)) return { kind: 'Binary', op, left, right, type: T.boolean, loc };
    const int = isIntLike(left.type) && isIntLike(right.type);
    const type = int ? T.int : left.type.kind === 'any' || right.type.kind === 'any' ? T.any : T.double;
    return { kind: 'Binary', op, left, right, int, type, loc };
  }

  /** Values that print differently in Java and JS: a char is a number in the IR. */
  private stringify(e: Expr): Expr {
    return e.type.kind === 'char' ? { kind: 'Convert', expr: e, from: T.char, type: T.string, loc: e.loc } : e;
  }

  /** Converts an argument for a host (visualizer) API: chars to strings, maps to plain records. */
  private hostValue(e: Expr): Expr {
    if (e.kind === 'NewMap' && e.entries?.every(([k]) => k.kind === 'Literal' && typeof k.value === 'string')) {
      return { kind: 'Record', entries: e.entries.map(([k, v]) => [String((k as { value: string }).value), this.hostValue(v)]), type: T.any, loc: e.loc };
    }
    if (e.type.kind === 'map') return { kind: 'Convert', expr: e, from: e.type, type: T.any, loc: e.loc };
    return this.stringify(e);
  }

  private builtin(op: BuiltinOp, args: Expr[], type: Type, loc: Loc, name?: string): Expr {
    return { kind: 'Builtin', op, args, type, loc, name };
  }

  // ---------- member access ----------

  /** A dotted name that refers to a class rather than a variable (Math, Integer, Algo, ...). */
  private staticClass(e: JExpr): string | undefined {
    if (e.kind === 'Name' && !this.lookup(e.name)) return e.name;
    if (e.kind === 'Field' && e.object.kind === 'Name' && e.object.name === 'System' && !this.lookup('System')) return `System.${e.name}`;
    return undefined;
  }

  private field(objectExpr: JExpr, name: string, loc: Loc): Expr {
    const cls = this.staticClass(objectExpr);
    if (cls) {
      const lit = (value: number, type: Type = T.int): Expr => ({ kind: 'Literal', value, type, loc });
      const key = `${cls}.${name}`;
      switch (key) {
        case 'Integer.MAX_VALUE':
          return lit(2147483647);
        case 'Integer.MIN_VALUE':
          return lit(-2147483648);
        case 'Long.MAX_VALUE':
          this.warn('Long.MAX_VALUE is converted to Number.MAX_SAFE_INTEGER (JavaScript numbers are 64-bit floats)', loc);
          return lit(Number.MAX_SAFE_INTEGER);
        case 'Long.MIN_VALUE':
          this.warn('Long.MIN_VALUE is converted to Number.MIN_SAFE_INTEGER (JavaScript numbers are 64-bit floats)', loc);
          return lit(Number.MIN_SAFE_INTEGER);
        case 'Double.POSITIVE_INFINITY':
          return lit(Infinity, T.double);
        case 'Double.NEGATIVE_INFINITY':
          return lit(-Infinity, T.double);
        case 'Double.MAX_VALUE':
          return lit(Number.MAX_VALUE, T.double);
        case 'Double.MIN_VALUE':
          return lit(Number.MIN_VALUE, T.double);
        case 'Math.PI':
          return lit(Math.PI, T.double);
        case 'Math.E':
          return lit(Math.E, T.double);
      }
      if (cls === this.className) {
        const g = this.globals.get(name);
        if (g) return { kind: 'Var', name: g.js, type: g.type, loc };
        return this.error(`Unknown static field '${name}'`, loc);
      }
      return this.error(`'${key}' is not supported yet`, loc);
    }

    const object = this.expr(objectExpr);
    const t = object.type;
    if (name === 'length' && t.kind === 'array') return this.builtin('array.length', [object], T.int, loc);
    if (t.kind === 'host') {
      const type = HOST_TYPES[t.name]?.fields[name];
      if (!type) this.warn(`'${name}' is not a known field of ${t.name}`, loc);
      return { kind: 'Field', object, name, type: type ?? T.any, loc };
    }
    if (t.kind === 'any' || object.kind === 'Invalid') return { kind: 'Field', object, name, type: T.any, loc };
    return this.error(`Unknown field '${name}' on a ${t.kind}`, loc);
  }

  private call(objectExpr: JExpr | undefined, name: string, jargs: JExpr[], loc: Loc): Expr {
    if (!objectExpr) return this.userCall(name, jargs, loc);
    const cls = this.staticClass(objectExpr);
    if (cls) return this.staticCall(cls, name, jargs, loc);
    const receiver = this.expr(objectExpr);
    const args = jargs.map((a) => this.expr(a));
    return this.methodCall(receiver, name, args, loc);
  }

  private userCall(name: string, jargs: JExpr[], loc: Loc): Expr {
    const sig = this.functions.get(name);
    if (!sig) return this.error(`Unknown method '${name}'`, loc);
    if (sig.params.length !== jargs.length) this.error(`'${name}' expects ${sig.params.length} argument(s), got ${jargs.length}`, loc);
    return { kind: 'Call', callee: jsName(name), args: jargs.map((a) => this.expr(a)), type: sig.returnType, loc };
  }

  private staticCall(cls: string, name: string, jargs: JExpr[], loc: Loc): Expr {
    if (cls === this.className) return this.userCall(name, jargs, loc);
    const args = jargs.map((a) => this.expr(a));
    const key = `${cls}.${name}`;
    const unsupported = () => this.error(`'${key}' is not supported yet`, loc);

    switch (cls) {
      case 'System.out':
      case 'System.err':
        if (name === 'println' || name === 'print') {
          const viz = this.vizInScope();
          if (!viz) return this.error('System.out.println() needs a Viz parameter in this method — output goes to viz.log()', loc);
          return this.builtin('print', [{ kind: 'Var', name: viz.js, type: viz.type, loc }, ...args.map((a) => this.hostValue(a))], T.void, loc);
        }
        return unsupported();
      case 'Math':
        if (name === 'floorMod') return this.builtin('math.floorMod', args, T.int, loc);
        if (name === 'floorDiv') {
          const quotient: Expr = { kind: 'Binary', op: '/', left: args[0], right: args[1], type: T.double, loc };
          return this.builtin('math', [quotient], T.int, loc, 'floor');
        }
        if (MATH_INT_RESULT.has(name)) return this.builtin('math', args, args.every((a) => isIntLike(a.type)) ? T.int : T.double, loc, name);
        return this.builtin('math', args, name === 'round' ? T.int : T.double, loc, name);
      case 'Arrays':
        switch (name) {
          case 'fill':
            return this.builtin('array.fill', args, T.void, loc);
          case 'sort':
            return this.builtin('array.sort', args, T.void, loc);
          case 'toString':
            return this.builtin('array.toString', args, T.string, loc);
          case 'copyOf':
            return this.builtin('array.copy', args, args[0]?.type ?? T.any, loc);
          case 'asList':
            return { kind: 'ArrayLit', elements: args, type: { kind: 'seq', of: args[0]?.type ?? T.any, origin: 'List' }, loc };
        }
        return unsupported();
      case 'Integer':
      case 'Long':
        switch (name) {
          case 'parseInt':
          case 'parseLong':
            return this.builtin('string.parseInt', args, T.int, loc);
          case 'valueOf':
            return args[0]?.type.kind === 'string' ? this.builtin('string.parseInt', args, T.int, loc) : args[0];
          case 'max':
          case 'min':
          case 'abs':
            return this.builtin('math', args, T.int, loc, name);
          case 'compare':
            return this.builtin('compare', args, T.int, loc);
          case 'toString':
            return this.builtin('string.of', args, T.string, loc);
        }
        return unsupported();
      case 'String':
        if (name === 'valueOf') return this.builtin('string.of', args.map((a) => this.stringify(a)), T.string, loc);
        return unsupported();
      case 'List':
        if (name === 'of') return { kind: 'ArrayLit', elements: args, type: { kind: 'seq', of: args[0]?.type ?? T.any, origin: 'List' }, loc };
        return unsupported();
      case 'Set':
        if (name === 'of') {
          const from: Expr = { kind: 'ArrayLit', elements: args, type: arrayOf(args[0]?.type ?? T.any), loc };
          return { kind: 'NewSet', from, type: { kind: 'set', of: args[0]?.type ?? T.any }, loc };
        }
        return unsupported();
      case 'Map':
        if (name === 'of') {
          const entries: [Expr, Expr][] = [];
          for (let i = 0; i + 1 < args.length; i += 2) entries.push([args[i], args[i + 1]]);
          return { kind: 'NewMap', entries, type: { kind: 'map', key: args[0]?.type ?? T.any, value: args[1]?.type ?? T.any }, loc };
        }
        return unsupported();
      case 'Collections':
        if (name === 'reverse') return this.builtin('seq.reverse', args, T.void, loc);
        if (name === 'swap') return this.builtin('seq.swap', args, T.void, loc);
        if (name === 'sort') return this.builtin('array.sort', args, T.void, loc);
        return unsupported();
    }
    return this.error(`Unknown class or variable '${cls}'`, loc);
  }

  private methodCall(receiver: Expr, name: string, args: Expr[], loc: Loc): Expr {
    const t = receiver.type;
    const b = (op: BuiltinOp, type: Type, rest = args) => this.builtin(op, [receiver, ...rest], type, loc);
    const unknown = (what: string) => this.error(`'${name}()' is not supported on ${what} yet`, loc);

    if (name === 'equals' && args.length === 1) return { kind: 'Binary', op: '==', left: receiver, right: args[0], type: T.boolean, loc };

    switch (t.kind) {
      case 'string':
        switch (name) {
          case 'length':
            return b('string.length', T.int);
          case 'charAt':
            return b('string.charAt', T.char);
          case 'isEmpty':
            return b('string.isEmpty', T.boolean);
          case 'contains':
            return b('string.contains', T.boolean);
          case 'compareTo':
            return b('string.compare', T.int);
          case 'toCharArray':
            return b('string.toChars', arrayOf(T.char));
        }
        if (STRING_METHODS[name]) return { kind: 'HostCall', object: receiver, method: name, args, type: STRING_METHODS[name], loc };
        return unknown('strings');
      case 'array':
        if (name === 'clone') return b('array.copy', t);
        return unknown('arrays');
      case 'seq':
        return this.seqCall(receiver, t, name, args, loc) ?? unknown(t.origin);
      case 'map':
        switch (name) {
          case 'get':
            return b('map.get', t.value);
          case 'getOrDefault':
            return b('map.getOrDefault', t.value);
          case 'put':
            return b('map.put', T.void);
          case 'containsKey':
            return b('map.has', T.boolean);
          case 'remove':
            return b('map.remove', T.void);
          case 'size':
            return b('map.size', T.int);
          case 'isEmpty':
            return b('map.isEmpty', T.boolean);
          case 'keySet':
            return b('map.keys', { kind: 'seq', of: t.key, origin: 'keySet' });
          case 'values':
            return b('map.values', { kind: 'seq', of: t.value, origin: 'values' });
        }
        return unknown('maps');
      case 'set':
        switch (name) {
          case 'add':
            return b('set.add', T.void);
          case 'contains':
            return b('set.has', T.boolean);
          case 'remove':
            return b('set.remove', T.void);
          case 'size':
            return b('set.size', T.int);
          case 'isEmpty':
            return b('set.isEmpty', T.boolean);
        }
        return unknown('sets');
      case 'host': {
        const type = HOST_TYPES[t.name]?.methods[name];
        if (!type) return this.error(`'${name}' is not part of the ${t.name} API`, loc);
        const hostArgs = isViz(t) ? args.map((a) => this.hostValue(a)) : args;
        return { kind: 'HostCall', object: receiver, method: name, args: hostArgs, type, loc };
      }
      case 'any':
        return { kind: 'HostCall', object: receiver, method: name, args, type: T.any, loc };
    }
    if (receiver.kind === 'Invalid') return receiver;
    return this.error(`Cannot call '${name}()' on a ${t.kind}`, loc);
  }

  /** Java's List / Stack / Queue / Deque methods; push/pop/peek depend on the declared class. */
  private seqCall(receiver: Expr, t: Type & { kind: 'seq' }, name: string, args: Expr[], loc: Loc): Expr | undefined {
    const stack = t.origin === 'Stack';
    const b = (op: BuiltinOp, type: Type) => this.builtin(op, [receiver, ...args], type, loc);
    switch (name) {
      case 'size':
        return b('seq.size', T.int);
      case 'isEmpty':
      case 'empty':
        return b('seq.isEmpty', T.boolean);
      case 'get':
        return b('seq.get', t.of);
      case 'set':
        return b('seq.set', T.void);
      case 'contains':
        return b('seq.contains', T.boolean);
      case 'indexOf':
        return b('seq.indexOf', T.int);
      case 'clear':
        return b('seq.clear', T.void);
      case 'add':
        return args.length === 2 ? b('seq.insert', T.void) : b('seq.pushBack', T.void);
      case 'addLast':
      case 'offer':
      case 'offerLast':
        return b('seq.pushBack', T.void);
      case 'addFirst':
      case 'offerFirst':
        return b('seq.pushFront', T.void);
      case 'push':
        return b(stack ? 'seq.pushBack' : 'seq.pushFront', T.void);
      case 'pop':
        return b(stack ? 'seq.popBack' : 'seq.popFront', t.of);
      case 'peek':
        return b(stack ? 'seq.peekBack' : 'seq.peekFront', t.of);
      case 'poll':
      case 'pollFirst':
      case 'removeFirst':
        return b('seq.popFront', t.of);
      case 'pollLast':
      case 'removeLast':
        return b('seq.popBack', t.of);
      case 'peekFirst':
      case 'getFirst':
      case 'element':
        return b('seq.peekFront', t.of);
      case 'peekLast':
      case 'getLast':
        return b('seq.peekBack', t.of);
      case 'remove':
        if (args.length === 0) return b('seq.popFront', t.of);
        if (isIntLike(args[0].type)) return b('seq.removeAt', t.of);
        this.error('remove(Object) is not supported yet — use remove(indexOf(x))', loc);
        return { kind: 'Invalid', type: T.any, loc };
    }
    return undefined;
  }

  private newObject(jt: JType, jargs: JExpr[], loc: Loc): Expr {
    const type = this.resolve(jt);
    const args = jargs.map((a) => this.expr(a));
    // new ArrayList<>(capacity) has no copy source.
    const from = args[0] && !isIntLike(args[0].type) ? args[0] : undefined;
    if (type.kind === 'seq') return { kind: 'NewSeq', from, type, loc };
    if (type.kind === 'map') return { kind: 'NewMap', from, type, loc };
    if (type.kind === 'set') return { kind: 'NewSet', from, type, loc };
    if (SORTED_NAMES.has(jt.name)) return { kind: 'Invalid', type: T.any, loc };
    return this.error(`Creating '${jt.name}' objects is not supported yet (only static methods, arrays and collections)`, loc);
  }
}
