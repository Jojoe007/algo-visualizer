// Recursive-descent parser for the Java subset the converter supports.
// Unsupported syntax fails with a JavaSyntaxError that names the construct and its line.

import type { Loc } from '../../ir/core';
import type { JClass, JDeclarator, JExpr, JField, JMethod, JStmt, JType } from './ast';
import { JavaSyntaxError, type Token } from './lexer';

const PRIMITIVES = new Set(['int', 'long', 'short', 'byte', 'double', 'float', 'char', 'boolean', 'void']);
const MODIFIERS = new Set(['public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized', 'native', 'transient', 'volatile', 'strictfp']);
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>=']);

// Binary operator precedence (higher binds tighter).
const BINARY_PREC: Record<string, number> = {
  '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6,
  '<': 7, '>': 7, '<=': 7, '>=': 7, instanceof: 7,
  '<<': 8, '>>': 8, '>>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
};

export class Parser {
  private pos = 0;
  private tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  // ---------- token helpers ----------

  private get tok() {
    return this.tokens[this.pos];
  }
  private peek(n = 1) {
    return this.tokens[Math.min(this.pos + n, this.tokens.length - 1)];
  }
  private loc(t = this.tok): Loc {
    return { line: t.line, column: t.column };
  }
  private is(value: string, t = this.tok) {
    return (t.type === 'op' || t.type === 'keyword') && t.value === value;
  }
  private eat(value: string) {
    if (!this.is(value)) return false;
    this.pos++;
    return true;
  }
  private expect(value: string) {
    if (!this.eat(value)) this.fail(`Expected '${value}' but found '${this.tok.value}'`);
  }
  private ident(): string {
    if (this.tok.type !== 'ident') this.fail(`Expected a name but found '${this.tok.value}'`);
    return this.tokens[this.pos++].value;
  }
  private fail(message: string, t = this.tok): never {
    throw new JavaSyntaxError(message, t.line, t.column);
  }
  private unsupported(what: string, t = this.tok): never {
    this.fail(`${what} ${what.endsWith('s') ? 'are' : 'is'} not supported yet`, t);
  }

  /** In type arguments, `>>` closes two lists: split off one `>`. */
  private closeAngle() {
    const t = this.tok;
    if (t.type === 'op' && t.value.startsWith('>') && t.value.length > 1 && !t.value.includes('=')) {
      this.tokens.splice(this.pos, 1, { ...t, value: '>' }, { ...t, value: t.value.slice(1), column: t.column + 1 });
    }
    this.expect('>');
  }

  /** Run `fn` and roll back; true if it succeeded and `after` holds. */
  private lookahead(fn: () => void, after: () => boolean): boolean {
    const saved = this.pos;
    try {
      fn();
      return after();
    } catch {
      return false;
    } finally {
      this.pos = saved;
    }
  }

  // ---------- compilation unit ----------

  parseClass(): JClass {
    while (this.is('package') || this.is('import')) {
      while (!this.is(';')) this.pos++;
      this.pos++;
    }
    this.modifiers();
    if (this.is('interface') || this.is('enum') || this.tok.value === 'record') this.unsupported(`${this.tok.value[0].toUpperCase()}${this.tok.value.slice(1)}s`);
    if (!this.is('class')) this.fail('Expected a class, e.g. `class Algo { static void run(int[] a, Viz viz) { ... } }`');
    const loc = this.loc();
    this.pos++;
    const name = this.ident();
    if (this.is('<')) this.unsupported('Generic classes');
    if (this.is('extends') || this.is('implements')) this.unsupported('Inheritance');
    this.expect('{');
    const members: (JMethod | JField)[] = [];
    while (!this.eat('}')) {
      if (this.is(';')) {
        this.pos++;
        continue;
      }
      members.push(this.member());
    }
    if (this.tok.type !== 'eof') this.unsupported('Multiple top-level classes');
    return { name, members, loc };
  }

  private modifiers(): string[] {
    const mods: string[] = [];
    for (;;) {
      if (this.is('@')) this.unsupported('Annotations');
      if (!MODIFIERS.has(this.tok.value) || this.tok.type !== 'keyword') return mods;
      mods.push(this.tokens[this.pos++].value);
    }
  }

  private member(): JMethod | JField {
    const loc = this.loc();
    const modifiers = this.modifiers();
    if (this.is('class') || this.is('interface') || this.is('enum')) this.unsupported('Nested classes');
    if (this.is('{')) this.unsupported('Initializer blocks');
    if (this.is('<')) this.unsupported('Generic methods');
    if (this.tok.type === 'ident' && this.is('(', this.peek())) this.unsupported('Constructors');
    const type = this.type();
    const name = this.ident();
    if (this.eat('(')) {
      const params: JMethod['params'] = [];
      while (!this.eat(')')) {
        if (params.length) this.expect(',');
        this.modifiers();
        const ploc = this.loc();
        const ptype = this.type();
        if (this.is('...')) this.unsupported('Varargs');
        const pname = this.ident();
        ptype.dims += this.dims();
        params.push({ type: ptype, name: pname, loc: ploc });
      }
      if (this.eat('throws')) {
        do this.type();
        while (this.eat(','));
      }
      if (!this.is('{')) this.unsupported('Abstract methods');
      return { kind: 'Method', modifiers, returnType: type, name, params, body: this.block(), loc };
    }
    this.pos--; // re-read the name as the first declarator
    const decls = this.declarators();
    this.expect(';');
    return { kind: 'Field', modifiers, type, decls, loc };
  }

  // ---------- types ----------

  private dims(): number {
    let n = 0;
    while (this.is('[') && this.is(']', this.peek())) {
      this.pos += 2;
      n++;
    }
    return n;
  }

  type(): JType {
    const loc = this.loc();
    const t = this.tok;
    if (t.type !== 'ident' && !(t.type === 'keyword' && PRIMITIVES.has(t.value))) this.fail(`Expected a type but found '${t.value}'`);
    this.pos++;
    let name = t.value;
    while (this.is('.') && this.peek().type === 'ident') {
      this.pos++;
      name = this.ident(); // java.util.List → List, Map.Entry → Entry
    }
    const args: JType[] = [];
    if (this.eat('<')) {
      if (!this.is('>')) {
        do {
          if (this.is('?')) this.unsupported('Wildcard generics');
          args.push(this.type());
        } while (this.eat(','));
      }
      this.closeAngle();
    }
    return { name, args, dims: this.dims(), loc };
  }

  // ---------- statements ----------

  block(): JStmt & { kind: 'Block' } {
    const loc = this.loc();
    this.expect('{');
    const body: JStmt[] = [];
    while (!this.is('}')) {
      if (this.tok.type === 'eof') this.fail("Missing '}'");
      body.push(this.statement());
    }
    const endLine = this.tok.line;
    this.pos++;
    return { kind: 'Block', body, endLine, loc };
  }

  private isLocalVarDecl(): boolean {
    if (this.tok.type === 'keyword' && PRIMITIVES.has(this.tok.value)) return true;
    if (this.tok.type !== 'ident') return false;
    return this.lookahead(() => this.type(), () => this.tok.type === 'ident');
  }

  private declarators(): JDeclarator[] {
    const decls: JDeclarator[] = [];
    do {
      const loc = this.loc();
      const name = this.ident();
      const dims = this.dims();
      let init: JExpr | undefined;
      if (this.eat('=')) init = this.is('{') ? this.arrayInit() : this.expr();
      decls.push({ name, dims, init, loc });
    } while (this.eat(','));
    return decls;
  }

  private localVar(final: boolean): JStmt {
    const loc = this.loc();
    const type = this.type();
    return { kind: 'LocalVar', type, final, decls: this.declarators(), loc };
  }

  statement(): JStmt {
    const loc = this.loc();
    const t = this.tok;
    if (this.is('{')) return this.block();
    if (this.eat(';')) return { kind: 'Empty', loc };

    if (this.is('final')) {
      this.pos++;
      const s = this.localVar(true);
      this.expect(';');
      return s;
    }
    if (this.is('class') || this.is('interface') || this.is('enum')) this.unsupported('Local classes');
    if (this.is('try') || this.is('throw')) this.unsupported('Exceptions');
    if (this.is('synchronized') || this.is('assert')) this.unsupported(`'${t.value}' statements`);
    if (t.type === 'ident' && this.is(':', this.peek())) this.unsupported('Labeled statements');

    if (this.eat('if')) {
      const test = this.parenExpr();
      const then = this.statement();
      return { kind: 'If', test, then, else: this.eat('else') ? this.statement() : undefined, loc };
    }
    if (this.eat('while')) {
      const test = this.parenExpr();
      return { kind: 'While', test, body: this.statement(), loc };
    }
    if (this.eat('do')) {
      const body = this.statement();
      this.expect('while');
      const test = this.parenExpr();
      this.expect(';');
      return { kind: 'DoWhile', body, test, loc };
    }
    if (this.eat('for')) return this.forStatement(loc);
    if (this.eat('return')) {
      const value = this.is(';') ? undefined : this.expr();
      this.expect(';');
      return { kind: 'Return', value, loc };
    }
    if (this.is('break') || this.is('continue')) {
      this.pos++;
      if (this.tok.type === 'ident') this.unsupported('Labeled break/continue');
      this.expect(';');
      return { kind: t.value === 'break' ? 'Break' : 'Continue', loc };
    }
    if (this.eat('switch')) return this.switchStatement(loc);

    if (this.isLocalVarDecl()) {
      const s = this.localVar(false);
      this.expect(';');
      return s;
    }
    const expr = this.expr();
    this.expect(';');
    return { kind: 'ExprStmt', expr, loc };
  }

  private parenExpr(): JExpr {
    this.expect('(');
    const e = this.expr();
    this.expect(')');
    return e;
  }

  private forStatement(loc: Loc): JStmt {
    this.expect('(');
    const final = this.eat('final');
    if (final || this.isLocalVarDecl()) {
      // for (T x : xs) or for (T x = ..., y = ...; ...)
      const isForEach = this.lookahead(() => {
        this.type();
        this.ident();
      }, () => this.is(':'));
      if (isForEach) {
        const type = this.type();
        const name = this.ident();
        this.expect(':');
        const iterable = this.expr();
        this.expect(')');
        return { kind: 'ForEach', type, name, iterable, body: this.statement(), loc };
      }
    }
    let init: JStmt | JExpr[] | null = null;
    if (!this.is(';')) init = final || this.isLocalVarDecl() ? this.localVar(final) : this.exprList();
    this.expect(';');
    const test = this.is(';') ? undefined : this.expr();
    this.expect(';');
    const update = this.is(')') ? [] : this.exprList();
    this.expect(')');
    return { kind: 'For', init, test, update, body: this.statement(), loc };
  }

  private exprList(): JExpr[] {
    const list = [this.expr()];
    while (this.eat(',')) list.push(this.expr());
    return list;
  }

  private switchStatement(loc: Loc): JStmt {
    const disc = this.parenExpr();
    this.expect('{');
    const cases: { labels: JExpr[]; body: JStmt[]; loc: Loc }[] = [];
    while (!this.is('}')) {
      const cloc = this.loc();
      const labels: JExpr[] = [];
      if (this.eat('default')) {
        /* default: no labels */
      } else {
        this.expect('case');
        labels.push(...this.exprList());
      }
      if (this.is('->')) this.unsupported('Arrow-style switch cases');
      this.expect(':');
      const body: JStmt[] = [];
      while (!this.is('case') && !this.is('default') && !this.is('}')) body.push(this.statement());
      cases.push({ labels, body, loc: cloc });
    }
    const endLine = this.tok.line;
    this.pos++;
    return { kind: 'Switch', disc, cases, endLine, loc };
  }

  // ---------- expressions ----------

  expr(): JExpr {
    const loc = this.loc();
    const left = this.conditional();
    if (this.tok.type === 'op' && ASSIGN_OPS.has(this.tok.value)) {
      const op = this.tokens[this.pos++].value;
      return { kind: 'Assign', op, target: left, value: this.expr(), loc };
    }
    if (this.is('->')) this.unsupported('Lambdas');
    return left;
  }

  private conditional(): JExpr {
    const loc = this.loc();
    const test = this.binary(1);
    if (!this.eat('?')) return test;
    const then = this.expr();
    this.expect(':');
    return { kind: 'Cond', test, then, else: this.conditional(), loc };
  }

  private binary(minPrec: number): JExpr {
    let left = this.unary();
    for (;;) {
      const t = this.tok;
      const prec = (t.type === 'op' || t.type === 'keyword') ? BINARY_PREC[t.value] : undefined;
      if (prec === undefined || prec < minPrec) return left;
      if (t.value === 'instanceof') this.unsupported('instanceof');
      this.pos++;
      left = { kind: 'Binary', op: t.value, left, right: this.binary(prec + 1), loc: left.loc };
    }
  }

  private isCast(): boolean {
    if (!this.is('(')) return false;
    const next = this.peek();
    if (next.type === 'keyword' && PRIMITIVES.has(next.value)) return true;
    if (next.type !== 'ident') return false;
    // (Type) operand — only when a non-operator follows the closing paren.
    return this.lookahead(() => {
      this.pos++;
      this.type();
      this.expect(')');
    }, () => ['ident', 'int', 'long', 'double', 'string', 'char'].includes(this.tok.type) || this.is('(') || this.is('!') || this.is('~') || this.is('this') || this.is('new') || this.is('true') || this.is('false') || this.is('null'));
  }

  private unary(): JExpr {
    const loc = this.loc();
    const t = this.tok;
    if (this.is('++') || this.is('--')) {
      this.pos++;
      return { kind: 'Update', op: t.value as '++' | '--', prefix: true, operand: this.unary(), loc };
    }
    if (this.is('+') || this.is('-') || this.is('!') || this.is('~')) {
      this.pos++;
      return { kind: 'Unary', op: t.value, operand: this.unary(), loc };
    }
    if (this.isCast()) {
      this.pos++;
      const type = this.type();
      this.expect(')');
      return { kind: 'Cast', type, expr: this.unary(), loc };
    }
    let e = this.postfix(this.primary());
    while (this.is('++') || this.is('--')) {
      e = { kind: 'Update', op: this.tokens[this.pos++].value as '++' | '--', prefix: false, operand: e, loc };
    }
    return e;
  }

  private args(): JExpr[] {
    this.expect('(');
    const args: JExpr[] = [];
    while (!this.eat(')')) {
      if (args.length) this.expect(',');
      args.push(this.expr());
    }
    return args;
  }

  private postfix(e: JExpr): JExpr {
    for (;;) {
      if (this.eat('.')) {
        if (this.is('<')) this.unsupported('Explicit generic method calls');
        if (this.is('class')) this.unsupported('Class literals');
        const name = this.ident();
        e = this.is('(') ? { kind: 'Call', object: e, name, args: this.args(), loc: e.loc } : { kind: 'Field', object: e, name, loc: e.loc };
      } else if (this.eat('[')) {
        const index = this.expr();
        this.expect(']');
        e = { kind: 'Index', object: e, index, loc: e.loc };
      } else if (this.is('::')) {
        this.unsupported('Method references', this.tok);
      } else {
        return e;
      }
    }
  }

  private arrayInit(): JExpr {
    const loc = this.loc();
    this.expect('{');
    const elements: JExpr[] = [];
    while (!this.eat('}')) {
      if (elements.length) {
        this.expect(',');
        if (this.eat('}')) break; // trailing comma
      }
      elements.push(this.is('{') ? this.arrayInit() : this.expr());
    }
    return { kind: 'ArrayInit', elements, loc };
  }

  private isLambdaAhead(): boolean {
    // `(` ... matching `)` followed by `->`
    let depth = 0;
    for (let k = this.pos; k < this.tokens.length; k++) {
      const t = this.tokens[k];
      if (this.is('(', t)) depth++;
      else if (this.is(')', t) && --depth === 0) return this.is('->', this.tokens[k + 1]);
    }
    return false;
  }

  private primary(): JExpr {
    const loc = this.loc();
    const t = this.tok;
    switch (t.type) {
      case 'int':
      case 'long':
      case 'double':
      case 'string':
      case 'char':
        this.pos++;
        return { kind: 'Literal', litType: t.type, raw: t.value, loc };
      case 'ident':
        this.pos++;
        if (this.is('->')) this.unsupported('Lambdas');
        if (this.is('(')) return { kind: 'Call', name: t.value, args: this.args(), loc };
        return { kind: 'Name', name: t.value, loc };
      case 'eof':
        this.fail('Unexpected end of file');
    }
    if (this.is('true') || this.is('false')) {
      this.pos++;
      return { kind: 'Literal', litType: 'boolean', raw: t.value, loc };
    }
    if (this.eat('null')) return { kind: 'Literal', litType: 'null', raw: 'null', loc };
    if (this.is('(')) {
      if (this.isLambdaAhead()) this.unsupported('Lambdas');
      return this.parenExpr();
    }
    if (this.is('this') || this.is('super')) this.unsupported(`'${t.value}' (instance members)`);
    if (this.eat('new')) return this.newExpr(loc);
    if (this.is('switch')) this.unsupported('Switch expressions');
    this.fail(`Unexpected '${t.value}'`);
  }

  private newExpr(loc: Loc): JExpr {
    const tloc = this.loc();
    const t = this.tok;
    if (t.type !== 'ident' && !(t.type === 'keyword' && PRIMITIVES.has(t.value))) this.fail(`Expected a type after 'new'`);
    this.pos++;
    let name = t.value;
    while (this.is('.') && this.peek().type === 'ident') {
      this.pos++;
      name = this.ident();
    }
    const args: JType[] = [];
    if (this.eat('<')) {
      if (!this.is('>')) {
        do args.push(this.type());
        while (this.eat(','));
      }
      this.closeAngle();
    }
    const elem: JType = { name, args, dims: 0, loc: tloc };
    if (this.is('[')) {
      const dims: JExpr[] = [];
      let extraDims = 0;
      while (this.eat('[')) {
        if (this.eat(']')) extraDims++;
        else {
          if (extraDims) this.fail('Array dimension after an empty []');
          dims.push(this.expr());
          this.expect(']');
        }
      }
      const init = !dims.length && this.is('{') ? this.arrayInit() : undefined;
      if (!dims.length && !init) this.fail('Array creation needs a size or an initializer');
      return { kind: 'NewArray', elem, dims, extraDims, init, loc };
    }
    const callArgs = this.args();
    if (this.is('{')) this.unsupported('Anonymous classes');
    return { kind: 'New', type: elem, args: callArgs, loc };
  }
}
