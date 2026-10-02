// Parses user code and inserts `__line(n);` before every statement (and at the top of every
// loop body) so the player can highlight the executing line and runaway loops can be stopped.

import { parse } from 'acorn';
import { generate } from 'astring';

export class UserSyntaxError extends Error {
  line?: number;
  column?: number;
  constructor(message: string, line?: number, column?: number) {
    super(message);
    this.line = line;
    this.column = column;
  }
}

// acorn's ESTree types are loose enough that a minimal structural type is simpler here.
interface N {
  type: string;
  loc?: { start: { line: number; column: number } };
  [key: string]: unknown;
}

const LOOPS = new Set(['WhileStatement', 'DoWhileStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement']);
const SKIP_KEYS = new Set(['loc', 'start', 'end', 'range']);

const lineCall = (line: number): N => ({
  type: 'ExpressionStatement',
  expression: {
    type: 'CallExpression',
    callee: { type: 'Identifier', name: '__line' },
    arguments: [{ type: 'Literal', value: line, raw: String(line) }],
    optional: false,
  },
});

const asBlock = (node: N): N => (node.type === 'BlockStatement' ? node : { type: 'BlockStatement', body: [node] });

function instrumentList(stmts: N[]): N[] {
  return stmts.flatMap((s) => {
    if (s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration' || s.type === 'EmptyStatement' || !s.loc) {
      return [s];
    }
    return [lineCall(s.loc.start.line), s];
  });
}

function walk(node: N) {
  if (LOOPS.has(node.type)) node.body = asBlock(node.body as N);
  if (node.type === 'IfStatement') {
    node.consequent = asBlock(node.consequent as N);
    const alt = node.alternate as N | null;
    if (alt && alt.type !== 'IfStatement') node.alternate = asBlock(alt);
  }

  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) if (c && typeof c === 'object' && typeof (c as N).type === 'string') walk(c as N);
    } else if (child && typeof child === 'object' && typeof (child as N).type === 'string') {
      walk(child as N);
    }
  }

  if (node.type === 'Program' || node.type === 'BlockStatement' || node.type === 'StaticBlock') {
    node.body = instrumentList(node.body as N[]);
  } else if (node.type === 'SwitchCase') {
    node.consequent = instrumentList(node.consequent as N[]);
  }
  // Re-highlight the loop header on every iteration; also guarantees empty loops hit the limit.
  if (LOOPS.has(node.type) && node.loc) (node.body as N & { body: N[] }).body.unshift(lineCall(node.loc.start.line));
}

export function instrument(code: string): string {
  let ast: N;
  try {
    // 'module' parses in strict mode, matching how the code is executed.
    ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true }) as unknown as N;
  } catch (e) {
    const err = e as SyntaxError & { loc?: { line: number; column: number } };
    throw new UserSyntaxError(err.message.replace(/\s*\(\d+:\d+\)$/, ''), err.loc?.line, err.loc?.column);
  }
  if ((ast.body as N[]).some((s) => s.type.startsWith('Import') || s.type.startsWith('Export'))) {
    throw new UserSyntaxError('import/export is not supported — write plain functions.', 1, 0);
  }
  walk(ast);
  return generate(ast as never);
}
