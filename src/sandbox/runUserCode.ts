// Main-thread entry: runs code in a fresh worker so a hung run can always be killed.

import type { RunResult } from '../core/trace';
import type { Template } from '../core/tracer';
import type { RunRequest } from './worker';

export const TIMEOUT_MS = 3000;

export function runUserCode(code: string, template: Template, input: unknown, timeoutMs = TIMEOUT_MS): Promise<RunResult> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const done = (result: RunResult) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(
      () => done({ steps: [], error: { phase: 'timeout', message: `Stopped after ${timeoutMs / 1000}s — the code took too long (infinite loop?).` } }),
      timeoutMs,
    );
    worker.onmessage = (e: MessageEvent<RunResult>) => done(e.data);
    worker.onerror = (e) => {
      e.preventDefault();
      done({ steps: [], error: { phase: 'runtime', message: e.message || 'Worker crashed' } });
    };
    worker.postMessage({ code, template, input } satisfies RunRequest);
  });
}
