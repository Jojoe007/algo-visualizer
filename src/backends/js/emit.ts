// Core IR → JavaScript source for the sandbox (`function run(input, viz)`).
// Output is line-aligned: a statement from source line L is written on output line L, so the
// sandbox's `__line(n)` step lines, error lines and comments all point at the original source.

import type { BuiltinOp, Comment, Expr, Fn, Global, Program, Stmt, Type } from '../../ir/core';

interface Out {
  code: string;
  prec: number;
}

// JS operator precedence (higher binds tighter).
const P = { assign: 2, cond: 3, or: 4, and: 5, eq: 9, add: 12, mul: 13, unary: 15, postfix: 17, member: 18, primary: 20 };

const BINARY_PREC: Record<string, number> = {
  '||': 4, '&&': 5, '|': 6, '^': 7, '&': 8, '===': 9, '!==': 9, '==': 9, '!=': 9,
  '<': 10, '>': 10, '<=': 10, '>=': 10, '<<': 11, '>>': 11, '>>>': 11,
  '+': 12, '-': 12, '*': 13, '/': 13, '%': 13,
};

const out = (code: string, prec: number): Out => ({ code, prec });
const wrap = (o: Out, min: number) => (o.prec < min ? `(${o.code})` : o.code);
const isIdent = (s: string) => /^[A-Za-z_$][\w$]*$/.test(s);
const isNullLiteral = (e: Expr) => e.kind === 'Literal' && e.value === null;

function quote(s: string) {
  return `'${JSON.stringify(s).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'")}'`;
}

function numberLiteral(n: number): Out {
  if (Number.isNaN(n)) return out('NaN', P.primary);
  const text = n === Infinity ? 'Infinity' : n === -Infinity ? '-Infinity' : String(n);
  return out(text, n < 0 || Object.is(n, -0) ? P.unary : P.primary);
}

/** A char is a number at runtime; printable ones are written as 'c'.charCodeAt(0) for readability. */
function charLiteral(code: number): Out {
  const c = String.fromCharCode(code);
  return code >= 32 && code < 127 ? out(`${quote(c)}.charCodeAt(0)`, P.member) : numberLiteral(code);
}

const isNumericSortable = (t: Type) => {
  const elem = t.kind === 'array' || t.kind === 'seq' ? t.of : t;
  return elem.kind === 'int' || elem.kind === 'double' || elem.kind === 'char';
};

class JsEmitter {
  private lines: string[] = [''];
  private depth = 0;
  private comments: Comment[];
  private nextComment = 0;
  lineMap: number[] = [0];

  constructor(comments: Comment[]) {
    this.comments = [...comments].sort((a, b) => a.loc.line - b.loc.line);
  }

  // ---------- line-aligned output ----------

  private get current() {
    return this.lines.length;
  }
  private write(text: string) {
    this.lines[this.lines.length - 1] += text;
  }
  private newLineAt(line: number) {
    while (this.lines.length < line) this.lines.push('');
    this.lines[this.lines.length - 1] = '  '.repeat(this.depth);
  }
  private separate() {
    const last = this.lines[this.lines.length - 1];
    if (last.trim() && !/[\s([]$/.test(last)) this.write(' ');
  }

  /** Position output at source line `line`, writing pending comments first. */
  private moveTo(line: number) {
    if (line > this.current) {
      this.flushComments(line);
      if (line > this.current) this.newLineAt(line);
      else this.separate();
    } else this.separate();
    this.lineMap[this.current] ??= line;
  }

  /** Emit comments that start before `line`; comments on the current line trail it. */
  private flushComments(line: number) {
    while (this.nextComment < this.comments.length && this.comments[this.nextComment].loc.line < line) {
      const c = this.comments[this.nextComment++];
      if (c.loc.line > this.current) this.newLineAt(c.loc.line);
      else this.separate();
      const [first, ...rest] = c.text.split('\n');
      this.write(first);
      const margin = ' '.repeat(c.loc.column);
      for (const l of rest) this.lines.push('  '.repeat(this.depth) + (l.startsWith(margin) ? l.slice(margin.length) : l.trimStart()));
    }
  }

  finish(): string {
    this.flushComments(Infinity);
    for (let i = 1; i <= this.current; i++) this.lineMap[i] ??= i;
    return this.lines.map((l) => l.trimEnd()).join('\n').replace(/\n+$/, '') + '\n';
  }

  // ---------- program and statements ----------

  program(p: Program) {
    for (const item of p.items) {
      if (item.kind === 'Fn') this.fn(item);
      else this.global(item);
    }
  }

  private fn(f: Fn) {
    this.moveTo(f.loc.line);
    this.write(`function ${f.name}(${f.params.map((p) => p.name).join(', ')}) `);
    this.block(f.body);
  }

  private global(g: Global) {
    this.stmt(g.decl);
  }

  private block(b: Stmt & { kind: 'Block' }) {
    this.write('{');
    this.depth++;
    for (const s of b.body) this.stmt(s);
    this.depth--;
    this.moveTo(b.endLine);
    this.write('}');
  }

  /** Body of if/loops: a block stays inline; a single statement is indented one level. */
  private body(s: Stmt) {
    if (s.kind === 'Block') return this.block(s);
    this.depth++;
    this.stmt(s);
    this.depth--;
  }

  private varDecl(s: Stmt & { kind: 'VarDecl' }) {
    const keyword = s.constant && s.decls.every((d) => d.init) ? 'const' : 'let';
    return `${keyword} ${s.decls.map((d) => (d.init ? `${d.name} = ${this.arg(d.init)}` : d.name)).join(', ')}`;
  }

  private stmt(s: Stmt) {
    this.moveTo(s.loc.line);
    switch (s.kind) {
      case 'VarDecl':
        return this.write(`${this.varDecl(s)};`);
      case 'ExprStmt':
        return this.write(`${this.expr(s.expr).code};`);
      case 'If':
        this.write(`if (${this.expr(s.test).code}) `);
        this.body(s.then);
        if (s.else) {
          this.write(' else ');
          if (s.else.kind === 'If') this.stmt(s.else);
          else this.body(s.else);
        }
        return;
      case 'While':
        this.write(`while (${this.expr(s.test).code}) `);
        return this.body(s.body);
      case 'DoWhile':
        this.write('do ');
        this.body(s.body);
        return this.write(` while (${this.expr(s.test).code});`);
      case 'For': {
        const init = s.init === null ? '' : Array.isArray(s.init) ? s.init.map((e) => this.expr(e).code).join(', ') : this.varDecl(s.init as Stmt & { kind: 'VarDecl' });
        const test = s.test ? this.expr(s.test).code : '';
        this.write(`for (${init}; ${test}; ${s.update.map((e) => this.expr(e).code).join(', ')}) `);
        return this.body(s.body);
      }
      case 'ForOf':
        this.write(`for (let ${s.name} of ${this.expr(s.iterable).code}) `);
        return this.body(s.body);
      case 'Return':
        return this.write(s.value ? `return ${this.expr(s.value).code};` : 'return;');
      case 'Break':
        return this.write('break;');
      case 'Continue':
        return this.write('continue;');
      case 'Block':
        return this.block(s);
      case 'Switch':
        this.write(`switch (${this.expr(s.disc).code}) {`);
        this.depth++;
        for (const c of s.cases) {
          this.moveTo(c.loc.line);
          this.write(c.tests.length ? c.tests.map((t) => `case ${this.expr(t).code}:`).join(' ') : 'default:');
          this.depth++;
          for (const b of c.body) this.stmt(b);
          this.depth--;
        }
        this.depth--;
        this.moveTo(s.endLine);
        return this.write('}');
      case 'Empty':
        return this.write(';');
    }
  }

  // ---------- expressions ----------

  /** An expression in a comma-separated position (argument, element, initializer). */
  private arg(e: Expr) {
    return wrap(this.expr(e), P.assign);
  }
  private args(es: Expr[]) {
    return es.map((e) => this.arg(e)).join(', ');
  }
  private member(e: Expr) {
    return wrap(this.expr(e), P.member);
  }

  expr(e: Expr): Out {
    switch (e.kind) {
      case 'Literal':
        if (e.value === null) return out('null', P.primary);
        if (typeof e.value === 'string') return out(quote(e.value), P.primary);
        if (typeof e.value === 'boolean') return out(String(e.value), P.primary);
        return e.type.kind === 'char' ? charLiteral(e.value) : numberLiteral(e.value);
      case 'Var':
        return out(e.name, P.primary);
      case 'Unary': {
        const operand = wrap(this.expr(e.operand), P.unary);
        const gap = (e.op === '-' || e.op === '+') && operand.startsWith(e.op) ? ' ' : '';
        return out(`${e.op}${gap}${operand}`, P.unary);
      }
      case 'Update': {
        const target = this.member(e.target);
        return e.prefix ? out(`${e.op}${target}`, P.unary) : out(`${target}${e.op}`, P.postfix);
      }
      case 'Binary':
        return this.binary(e);
      case 'Assign': {
        const target = this.member(e.target);
        if (e.truncate) {
          const op = e.op.slice(0, -1);
          return out(`${target} = Math.trunc(${target} ${op} ${wrap(this.expr(e.value), BINARY_PREC[op] + 1)})`, P.assign);
        }
        return out(`${target} ${e.op} ${wrap(this.expr(e.value), P.assign)}`, P.assign);
      }
      case 'Cond':
        return out(`${wrap(this.expr(e.test), P.or)} ? ${this.arg(e.then)} : ${this.arg(e.else)}`, P.cond);
      case 'Call':
        return out(`${e.callee}(${this.args(e.args)})`, P.member);
      case 'HostCall':
        return out(`${this.member(e.object)}.${e.method}(${this.args(e.args)})`, P.member);
      case 'Builtin':
        return this.builtin(e.op, e.args, e.name);
      case 'Index':
        return out(`${this.member(e.object)}[${this.expr(e.index).code}]`, P.member);
      case 'Field':
        return out(`${this.member(e.object)}.${e.name}`, P.member);
      case 'NewArray':
        return out(this.newArray(e.dims, e.fill), P.member);
      case 'ArrayLit':
        return out(`[${this.args(e.elements)}]`, P.primary);
      case 'NewSeq':
        return out(e.from ? `[...${this.member(e.from)}]` : '[]', P.primary);
      case 'NewMap':
        if (e.entries) return out(`new Map([${e.entries.map(([k, v]) => `[${this.arg(k)}, ${this.arg(v)}]`).join(', ')}])`, P.member);
        return out(e.from ? `new Map(${this.arg(e.from)})` : 'new Map()', P.member);
      case 'NewSet':
        return out(e.from ? `new Set(${this.arg(e.from)})` : 'new Set()', P.member);
      case 'Record':
        return out(`{ ${e.entries.map(([k, v]) => this.recordEntry(k, v)).join(', ')} }`, P.primary);
      case 'Convert':
        return this.convert(e.expr, e.from, e.type);
      case 'Invalid':
        return out('undefined /* unsupported */', P.primary);
    }
  }

  private recordEntry(key: string, value: Expr) {
    if (value.kind === 'Var' && value.name === key) return key;
    return `${isIdent(key) ? key : quote(key)}: ${this.arg(value)}`;
  }

  private binary(e: Expr & { kind: 'Binary' }): Out {
    let op = e.op;
    if (op === '==' || op === '!=') {
      // Java `x == null` must also catch JS `undefined` (e.g. a missing Map key).
      if (!isNullLiteral(e.left) && !isNullLiteral(e.right)) op += '=';
    }
    const prec = BINARY_PREC[op];
    const code = `${wrap(this.expr(e.left), prec)} ${op} ${wrap(this.expr(e.right), prec + 1)}`;
    if (e.int && op === '/') return out(`Math.trunc(${code})`, P.member);
    return out(code, prec);
  }

  private newArray(dims: Expr[], fill: number | boolean | null): string {
    const [first, ...rest] = dims.map((d) => this.arg(d));
    if (!rest.length) return `new Array(${first}).fill(${String(fill)})`;
    return `Array.from({ length: ${first} }, () => ${this.newArray(dims.slice(1), fill)})`;
  }

  private convert(inner: Expr, from: Type, to: Type): Out {
    const x = this.expr(inner);
    if ((to.kind === 'int' || to.kind === 'char') && (from.kind === 'double' || from.kind === 'any')) return out(`Math.trunc(${x.code})`, P.member);
    if (to.kind === 'string' && from.kind === 'char') return out(`String.fromCharCode(${x.code})`, P.member);
    if (from.kind === 'map') return out(`Object.fromEntries(${x.code})`, P.member);
    return x;
  }

  private builtin(op: BuiltinOp, args: Expr[], name?: string): Out {
    const a = (i: number) => this.arg(args[i]);
    const recv = () => this.member(args[0]);
    const m = (code: string) => out(code, P.member);
    switch (op) {
      case 'print':
        return m(`${recv()}.log(${this.args(args.slice(1))})`);
      case 'math':
        return m(`Math.${name}(${this.args(args)})`);
      case 'math.floorMod': {
        const [x, y] = [wrap(this.expr(args[0]), P.mul), wrap(this.expr(args[1]), P.mul + 1)];
        return out(`((${x} % ${y}) + ${y}) % ${y}`, P.mul);
      }
      case 'array.length':
      case 'string.length':
      case 'seq.size':
        return m(`${recv()}.length`);
      case 'array.fill':
        return m(`${recv()}.fill(${a(1)})`);
      case 'array.sort':
        return m(isNumericSortable(args[0].type) ? `${recv()}.sort((x, y) => x - y)` : `${recv()}.sort()`);
      case 'array.toString':
        return out(`'[' + ${recv()}.join(', ') + ']'`, P.add);
      case 'array.copy':
        return args.length > 1 ? m(`${recv()}.slice(0, ${a(1)})`) : out(`[...${recv()}]`, P.primary);
      case 'string.charAt':
        return m(`${recv()}.charCodeAt(${a(1)})`);
      case 'string.isEmpty':
      case 'seq.isEmpty':
        return out(`${recv()}.length === 0`, P.eq);
      case 'string.contains':
        return m(`${recv()}.includes(${a(1)})`);
      case 'string.compare':
      case 'compare': {
        const [x, y] = [wrap(this.expr(args[0]), P.eq), wrap(this.expr(args[1]), P.eq)];
        return out(`${x} < ${y} ? -1 : ${x} > ${y} ? 1 : 0`, P.cond);
      }
      case 'string.toChars':
        return m(`Array.from(${a(0)}, (c) => c.charCodeAt(0))`);
      case 'string.of':
        return m(`String(${a(0)})`);
      case 'string.parseInt':
        return m(`parseInt(${a(0)}, 10)`);
      case 'seq.get':
        return m(`${recv()}[${a(1)}]`);
      case 'seq.set':
        return out(`${recv()}[${a(1)}] = ${a(2)}`, P.assign);
      case 'seq.insert':
        return m(`${recv()}.splice(${a(1)}, 0, ${a(2)})`);
      case 'seq.removeAt':
        return m(`${recv()}.splice(${a(1)}, 1)[0]`);
      case 'seq.contains':
        return m(`${recv()}.includes(${a(1)})`);
      case 'seq.indexOf':
        return m(`${recv()}.indexOf(${a(1)})`);
      case 'seq.clear':
        return out(`${recv()}.length = 0`, P.assign);
      case 'seq.pushBack':
        return m(`${recv()}.push(${a(1)})`);
      case 'seq.pushFront':
        return m(`${recv()}.unshift(${a(1)})`);
      case 'seq.popBack':
        return m(`${recv()}.pop()`);
      case 'seq.popFront':
        return m(`${recv()}.shift()`);
      case 'seq.peekBack':
        return m(`${recv()}.at(-1)`);
      case 'seq.peekFront':
        return m(`${recv()}[0]`);
      case 'seq.reverse':
        return m(`${recv()}.reverse()`);
      case 'seq.swap': {
        const [l, i, j] = [recv(), a(1), a(2)];
        return out(`[${l}[${i}], ${l}[${j}]] = [${l}[${j}], ${l}[${i}]]`, P.assign);
      }
      case 'map.get':
        return m(`${recv()}.get(${a(1)})`);
      case 'map.getOrDefault':
        return out(`${recv()}.has(${a(1)}) ? ${recv()}.get(${a(1)}) : ${a(2)}`, P.cond);
      case 'map.put':
        return m(`${recv()}.set(${a(1)}, ${a(2)})`);
      case 'map.has':
      case 'set.has':
        return m(`${recv()}.has(${a(1)})`);
      case 'map.remove':
      case 'set.remove':
        return m(`${recv()}.delete(${a(1)})`);
      case 'map.size':
      case 'set.size':
        return m(`${recv()}.size`);
      case 'map.isEmpty':
      case 'set.isEmpty':
        return out(`${recv()}.size === 0`, P.eq);
      case 'map.keys':
        return out(`[...${recv()}.keys()]`, P.primary);
      case 'map.values':
        return out(`[...${recv()}.values()]`, P.primary);
      case 'set.add':
        return m(`${recv()}.add(${a(1)})`);
    }
  }
}

export function emitJs(program: Program): { code: string; lineMap: number[] } {
  const emitter = new JsEmitter(program.comments);
  emitter.program(program);
  const code = emitter.finish();
  return { code, lineMap: emitter.lineMap };
}
