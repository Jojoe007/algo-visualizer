// Java tokenizer. Comments are collected separately so the JS back end can keep them in place.

import type { Comment } from '../../ir/core';

export type TokenType = 'ident' | 'keyword' | 'int' | 'long' | 'double' | 'string' | 'char' | 'op' | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export class JavaSyntaxError extends Error {
  line: number;
  column: number;
  constructor(message: string, line: number, column: number) {
    super(message);
    this.line = line;
    this.column = column;
  }
}

const KEYWORDS = new Set(
  ('abstract assert boolean break byte case catch char class const continue default do double else enum extends final ' +
    'finally float for goto if implements import instanceof int interface long native new package private protected public ' +
    'return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null')
    .split(' '),
);

// Longest first, so `>>>=` wins over `>>` and `>`.
const OPERATORS = [
  '>>>=', '<<=', '>>=', '>>>', '...', '->', '::', '++', '--', '&&', '||', '==', '!=', '<=', '>=',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>',
  '{', '}', '(', ')', '[', ']', ';', ',', '.', '@', '=', '>', '<', '!', '~', '?', ':', '+', '-', '*', '/', '&', '|', '^', '%',
];

const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_$]/.test(c);
const isDigit = (c: string) => c >= '0' && c <= '9';

const ESCAPES: Record<string, number> = { n: 10, t: 9, r: 13, b: 8, f: 12, s: 32, '0': 0, "'": 39, '"': 34, '\\': 92 };

/** Char code of a Java char literal body such as `a`, `\n` or `A`. */
export function charCode(body: string): number {
  if (!body.startsWith('\\')) return body.charCodeAt(0);
  if (body[1] === 'u') return parseInt(body.replace(/^\\u+/, ''), 16);
  if (/^\\[0-7]{1,3}$/.test(body)) return parseInt(body.slice(1), 8);
  return ESCAPES[body[1]] ?? body.charCodeAt(1);
}

export function tokenize(src: string): { tokens: Token[]; comments: Comment[] } {
  const tokens: Token[] = [];
  const comments: Comment[] = [];
  let i = 0, line = 1, col = 0;

  const advance = (n: number) => {
    for (let k = 0; k < n; k++, i++) {
      if (src[i] === '\n') {
        line++;
        col = 0;
      } else col++;
    }
  };
  const fail = (msg: string): never => {
    throw new JavaSyntaxError(msg, line, col);
  };

  while (i < src.length) {
    const c = src[i];
    if (c === '\n' || c === ' ' || c === '\t' || c === '\r') {
      advance(1);
      continue;
    }
    const start = { line, column: col };

    if (src.startsWith('//', i)) {
      const end = src.indexOf('\n', i);
      const text = src.slice(i, end === -1 ? src.length : end);
      comments.push({ text, loc: start, endLine: line });
      advance(text.length);
      continue;
    }
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) fail('Unterminated comment');
      const text = src.slice(i, end + 2);
      advance(text.length);
      comments.push({ text, loc: start, endLine: line });
      continue;
    }

    if (isIdentStart(c)) {
      let j = i;
      while (j < src.length && isIdentPart(src[j])) j++;
      const word = src.slice(i, j);
      tokens.push({ type: KEYWORDS.has(word) ? 'keyword' : 'ident', value: word, ...start });
      advance(j - i);
      continue;
    }

    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      const m = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*)?\.?[\d_]*(?:[eE][+-]?\d+)?)([lLfFdD]?)/.exec(src.slice(i))!;
      const [text, body, suffix] = m;
      const isFloat = /[fFdD]/.test(suffix) || (!/^0[xXbB]/.test(body) && /[.eE]/.test(body));
      tokens.push({ type: isFloat ? 'double' : /[lL]/.test(suffix) ? 'long' : 'int', value: body.replace(/_/g, ''), ...start });
      advance(text.length);
      continue;
    }

    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\n') break;
        j += src[j] === '\\' ? 2 : 1;
      }
      if (src[j] !== c) fail(c === '"' ? 'Unterminated string' : 'Unterminated char literal');
      tokens.push({ type: c === '"' ? 'string' : 'char', value: src.slice(i + 1, j), ...start });
      advance(j + 1 - i);
      continue;
    }

    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (!op) fail(`Unexpected character '${c}'`);
    tokens.push({ type: 'op', value: op!, ...start });
    advance(op!.length);
  }
  tokens.push({ type: 'eof', value: '<end of file>', line, column: col });
  return { tokens, comments };
}
