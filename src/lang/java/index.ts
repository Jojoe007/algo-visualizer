// Java front end: source → tokens → Java AST → Core IR.

import type { Frontend } from '../types';
import { JavaSyntaxError, tokenize } from './lexer';
import { Lowerer } from './lower';
import { Parser } from './parser';

export const javaFrontend: Frontend = {
  parse(source) {
    try {
      const { tokens, comments } = tokenize(source);
      const cls = new Parser(tokens).parseClass();
      const lowerer = new Lowerer();
      const program = lowerer.lowerClass(cls, comments);
      return { program, diagnostics: lowerer.diagnostics };
    } catch (e) {
      if (!(e instanceof JavaSyntaxError)) throw e;
      return { program: null, diagnostics: [{ severity: 'error', message: e.message, line: e.line, column: e.column }] };
    }
  },
};
