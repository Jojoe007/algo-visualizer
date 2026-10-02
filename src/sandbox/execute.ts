// Environment-agnostic core of the sandbox: instrument → run → trace.
// Called inside the Web Worker (see worker.ts) and directly from unit tests.

import { createRuntime, LIMITS, LimitError, type Template } from '../core/tracer';
import type { RunResult } from '../core/trace';
import { instrument, UserSyntaxError } from './instrument';

// Shadowed inside user code. Defense in depth only — the real isolation is the worker
// (no DOM, terminated on timeout); this is the user's own code in their own browser.
const BLOCKED = ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'postMessage', 'self', 'globalThis', 'window', 'document', 'close'];

export function execute(code: string, template: Template, input: unknown, limits = LIMITS): RunResult {
  let js: string;
  try {
    js = instrument(code);
  } catch (e) {
    const err = e as UserSyntaxError;
    return { steps: [], error: { phase: 'syntax', message: `SyntaxError: ${err.message}`, line: err.line, column: err.column } };
  }

  const rt = createRuntime(template, input, limits);
  try {
    const factory = new Function(
      '__line',
      ...BLOCKED,
      `"use strict";\n${js}\n;return typeof run === "function" ? run : undefined;`,
    );
    const run = factory((n: number) => rt.tracer.hitLine(n), ...BLOCKED.map(() => undefined));
    if (typeof run !== 'function') {
      return { steps: rt.tracer.steps, error: { phase: 'runtime', message: 'Define a function `run(input, viz)` — it is called with your input.' } };
    }
    rt.tracer.line = undefined;
    run(rt.input, rt.viz);
    rt.tracer.finish();
    return { steps: rt.tracer.steps };
  } catch (e) {
    rt.tracer.finish();
    const message = e instanceof LimitError ? e.message : e instanceof Error ? `${e.name}: ${e.message}` : `Thrown: ${String(e)}`;
    return {
      steps: rt.tracer.steps,
      error: { phase: e instanceof LimitError ? 'limit' : 'runtime', message, line: rt.tracer.line },
    };
  }
}
