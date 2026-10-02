import { execute } from './execute';
import type { Template } from '../core/tracer';

export interface RunRequest {
  code: string;
  template: Template;
  input: unknown;
}

self.onmessage = (e: MessageEvent<RunRequest>) => {
  const { code, template, input } = e.data;
  self.postMessage(execute(code, template, input));
};
