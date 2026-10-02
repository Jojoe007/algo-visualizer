// Contracts shared by every source language. A front end turns source text into Core IR;
// toJavaScript (lang/registry.ts) is the single entry point the rest of the app calls.

import type { Program } from '../ir/core';

export type LanguageId = 'javascript' | 'java';

export interface Diagnostic {
  severity: 'error' | 'warning';
  message: string;
  line: number;
  column?: number;
}

export interface ConvertResult {
  code: string;
  /** lineMap[jsLine] = source line (1-based; index 0 unused). Identity when emission stays line-aligned. */
  lineMap: number[];
  diagnostics: Diagnostic[];
}

export interface Frontend {
  parse(source: string): { program: Program | null; diagnostics: Diagnostic[] };
}

export const hasErrors = (diagnostics: Diagnostic[]) => diagnostics.some((d) => d.severity === 'error');
