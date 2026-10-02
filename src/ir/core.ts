// Core IR: the language-neutral program every front end lowers to (see lang/*) and every
// back end consumes (backends/js today; a bytecode compiler for machine simulation later).
// Semantics are explicit: types are resolved, integer division is flagged, and library calls are
// named `Builtin` ops rather than source-language method names. Every node keeps its source `loc`.

export interface Loc {
  line: number;
  column: number;
}

export type Type =
  | { kind: 'int' | 'double' | 'boolean' | 'char' | 'string' | 'void' | 'null' | 'any' }
  | { kind: 'array'; of: Type }
  /** Ordered sequence (list, stack, queue, deque). `origin` is the source-language class, for messages. */
  | { kind: 'seq'; of: Type; origin: string }
  | { kind: 'map'; key: Type; value: Type }
  | { kind: 'set'; of: Type }
  /** An object provided by the visualizer runtime (Viz, Grid, Graph, ...); see ir/host.ts. */
  | { kind: 'host'; name: string };

export const T = {
  int: { kind: 'int' },
  double: { kind: 'double' },
  boolean: { kind: 'boolean' },
  char: { kind: 'char' },
  string: { kind: 'string' },
  void: { kind: 'void' },
  null: { kind: 'null' },
  any: { kind: 'any' },
} as const satisfies Record<string, Type>;

export const isNumeric = (t: Type) => t.kind === 'int' || t.kind === 'double' || t.kind === 'char';

/** Library operations a back end must implement. `args[0]` is the receiver for collection ops. */
export type BuiltinOp =
  | 'print' // args[0] is the Viz object that receives the output
  | 'math' // Math.<name>(...args); the function name is in `name`
  | 'math.floorMod'
  | 'array.length'
  | 'array.fill'
  | 'array.sort'
  | 'array.toString'
  | 'array.copy'
  | 'string.length'
  | 'string.charAt'
  | 'string.isEmpty'
  | 'string.contains'
  | 'string.compare'
  | 'string.toChars'
  | 'string.of'
  | 'string.parseInt'
  | 'compare'
  | 'seq.size'
  | 'seq.isEmpty'
  | 'seq.get'
  | 'seq.set'
  | 'seq.insert'
  | 'seq.removeAt'
  | 'seq.contains'
  | 'seq.indexOf'
  | 'seq.clear'
  | 'seq.pushBack'
  | 'seq.pushFront'
  | 'seq.popBack'
  | 'seq.popFront'
  | 'seq.peekBack'
  | 'seq.peekFront'
  | 'seq.reverse'
  | 'seq.swap'
  | 'map.get'
  | 'map.getOrDefault'
  | 'map.put'
  | 'map.has'
  | 'map.remove'
  | 'map.size'
  | 'map.isEmpty'
  | 'map.keys'
  | 'map.values'
  | 'set.add'
  | 'set.has'
  | 'set.remove'
  | 'set.size'
  | 'set.isEmpty';

interface Node {
  loc: Loc;
}

interface ExprBase extends Node {
  type: Type;
}

export type Expr =
  | (ExprBase & { kind: 'Literal'; value: number | string | boolean | null })
  | (ExprBase & { kind: 'Var'; name: string })
  | (ExprBase & { kind: 'Unary'; op: string; operand: Expr })
  | (ExprBase & { kind: 'Update'; op: '++' | '--'; prefix: boolean; target: Expr })
  /** `int` marks integer arithmetic: '/' truncates toward zero. */
  | (ExprBase & { kind: 'Binary'; op: string; left: Expr; right: Expr; int?: boolean })
  /** `truncate`: the target is an integer, so the result of `target op value` truncates. */
  | (ExprBase & { kind: 'Assign'; op: string; target: Expr; value: Expr; truncate?: boolean })
  | (ExprBase & { kind: 'Cond'; test: Expr; then: Expr; else: Expr })
  | (ExprBase & { kind: 'Call'; callee: string; args: Expr[] })
  | (ExprBase & { kind: 'HostCall'; object: Expr; method: string; args: Expr[] })
  | (ExprBase & { kind: 'Builtin'; op: BuiltinOp; name?: string; args: Expr[] })
  | (ExprBase & { kind: 'Index'; object: Expr; index: Expr })
  | (ExprBase & { kind: 'Field'; object: Expr; name: string })
  /** Multi-dimensional array; `dims` are the sized dimensions, innermost cells start as `fill`. */
  | (ExprBase & { kind: 'NewArray'; dims: Expr[]; fill: number | boolean | null })
  | (ExprBase & { kind: 'ArrayLit'; elements: Expr[] })
  | (ExprBase & { kind: 'NewSeq'; from?: Expr })
  | (ExprBase & { kind: 'NewMap'; from?: Expr; entries?: [Expr, Expr][] })
  | (ExprBase & { kind: 'NewSet'; from?: Expr })
  /** A record literal with fixed string keys, e.g. the info object passed to viz.vars. */
  | (ExprBase & { kind: 'Record'; entries: [string, Expr][] })
  /** Value conversion: numeric casts, char → string, map → record. `from` is the operand's type. */
  | (ExprBase & { kind: 'Convert'; expr: Expr; from: Type })
  /** Placeholder for a construct the front end reported as unsupported. */
  | (ExprBase & { kind: 'Invalid' });

export interface Declarator {
  name: string;
  type: Type;
  init?: Expr;
}

export type Stmt =
  | (Node & { kind: 'VarDecl'; decls: Declarator[]; constant: boolean })
  | (Node & { kind: 'ExprStmt'; expr: Expr })
  | (Node & { kind: 'If'; test: Expr; then: Stmt; else?: Stmt })
  | (Node & { kind: 'While'; test: Expr; body: Stmt })
  | (Node & { kind: 'DoWhile'; body: Stmt; test: Expr })
  | (Node & { kind: 'For'; init: Stmt | Expr[] | null; test?: Expr; update: Expr[]; body: Stmt })
  | (Node & { kind: 'ForOf'; name: string; type: Type; iterable: Expr; body: Stmt })
  | (Node & { kind: 'Return'; value?: Expr })
  | (Node & { kind: 'Break' })
  | (Node & { kind: 'Continue' })
  | (Node & { kind: 'Block'; body: Stmt[]; endLine: number })
  | (Node & { kind: 'Switch'; disc: Expr; cases: SwitchCase[]; endLine: number })
  | (Node & { kind: 'Empty' });

export interface SwitchCase extends Node {
  tests: Expr[]; // empty = default
  body: Stmt[];
}

export interface Fn extends Node {
  kind: 'Fn';
  name: string;
  params: { name: string; type: Type }[];
  returnType: Type;
  body: Stmt & { kind: 'Block' };
}

/** A program-level variable (e.g. a Java static field). */
export interface Global extends Node {
  kind: 'Global';
  decl: Stmt & { kind: 'VarDecl' };
}

/** Source comments, kept so a back end that emits source text can preserve them. */
export interface Comment extends Node {
  text: string;
  endLine: number;
}

export interface Program {
  items: (Fn | Global)[];
  comments: Comment[];
}
