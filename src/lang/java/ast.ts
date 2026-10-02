// Java syntax tree for the supported subset. Purely syntactic: names are unresolved and
// expressions are untyped. lower.ts resolves both while translating to Core IR.

import type { Loc } from '../../ir/core';

export interface JType {
  name: string; // 'int', 'String', 'List', 'var', ...
  args: JType[];
  dims: number;
  loc: Loc;
}

type At<T> = T & { loc: Loc };

export type JExpr = At<
  | { kind: 'Literal'; litType: 'int' | 'long' | 'double' | 'char' | 'string' | 'boolean' | 'null'; raw: string }
  | { kind: 'Name'; name: string }
  | { kind: 'Field'; object: JExpr; name: string }
  | { kind: 'Index'; object: JExpr; index: JExpr }
  | { kind: 'Call'; object?: JExpr; name: string; args: JExpr[] }
  | { kind: 'New'; type: JType; args: JExpr[] }
  | { kind: 'NewArray'; elem: JType; dims: JExpr[]; extraDims: number; init?: JExpr }
  | { kind: 'ArrayInit'; elements: JExpr[] }
  | { kind: 'Unary'; op: string; operand: JExpr }
  | { kind: 'Update'; op: '++' | '--'; prefix: boolean; operand: JExpr }
  | { kind: 'Binary'; op: string; left: JExpr; right: JExpr }
  | { kind: 'Assign'; op: string; target: JExpr; value: JExpr }
  | { kind: 'Cond'; test: JExpr; then: JExpr; else: JExpr }
  | { kind: 'Cast'; type: JType; expr: JExpr }
>;

export interface JDeclarator {
  name: string;
  dims: number;
  init?: JExpr;
  loc: Loc;
}

export type JStmt = At<
  | { kind: 'LocalVar'; type: JType; final: boolean; decls: JDeclarator[] }
  | { kind: 'ExprStmt'; expr: JExpr }
  | { kind: 'If'; test: JExpr; then: JStmt; else?: JStmt }
  | { kind: 'While'; test: JExpr; body: JStmt }
  | { kind: 'DoWhile'; body: JStmt; test: JExpr }
  | { kind: 'For'; init: JStmt | JExpr[] | null; test?: JExpr; update: JExpr[]; body: JStmt }
  | { kind: 'ForEach'; type: JType; name: string; iterable: JExpr; body: JStmt }
  | { kind: 'Return'; value?: JExpr }
  | { kind: 'Break' }
  | { kind: 'Continue' }
  | { kind: 'Block'; body: JStmt[]; endLine: number }
  | { kind: 'Switch'; disc: JExpr; cases: { labels: JExpr[]; body: JStmt[]; loc: Loc }[]; endLine: number }
  | { kind: 'Empty' }
>;

export interface JMethod {
  kind: 'Method';
  modifiers: string[];
  returnType: JType;
  name: string;
  params: { type: JType; name: string; loc: Loc }[];
  body: JStmt & { kind: 'Block' };
  loc: Loc;
}

export interface JField {
  kind: 'Field';
  modifiers: string[];
  type: JType;
  decls: JDeclarator[];
  loc: Loc;
}

export interface JClass {
  name: string;
  members: (JMethod | JField)[];
  loc: Loc;
}
