// Source languages the app understands. JavaScript runs as-is; every other language has a
// front end that lowers to Core IR, which the JS back end turns into sandbox-ready code.

import { emitJs } from '../backends/js/emit';
import type { Template } from '../core/tracer';
import { javaFrontend } from './java';
import type { ConvertResult, Frontend, LanguageId } from './types';
import javaBubbleSort from './java/examples/BubbleSort.java?raw';
import javaBfs from './java/examples/Bfs.java?raw';
import javaDijkstra from './java/examples/Dijkstra.java?raw';

export interface LanguageExample {
  name: string;
  template: Template;
  source: string;
}

export interface LanguageDef {
  label: string;
  monacoLanguage: string;
  frontend?: Frontend;
  examples: LanguageExample[];
  /** How `run` is declared in this language for each template. */
  entryPoint: Record<Template, string>;
}

export const LANGUAGES: Record<LanguageId, LanguageDef> = {
  javascript: {
    label: 'JavaScript',
    monacoLanguage: 'javascript',
    examples: [],
    entryPoint: { array: 'function run(a, viz)', grid: 'function run(grid, viz)', graph: 'function run(graph, viz)', tree: 'function run(input, viz)' },
  },
  java: {
    label: 'Java',
    monacoLanguage: 'java',
    frontend: javaFrontend,
    examples: [
      { name: 'Bubble sort', template: 'array', source: javaBubbleSort },
      { name: 'Breadth-first search', template: 'grid', source: javaBfs },
      { name: 'Dijkstra', template: 'graph', source: javaDijkstra },
    ],
    entryPoint: {
      array: 'static void run(int[] a, Viz viz)',
      grid: 'static void run(Grid grid, Viz viz)',
      graph: 'static void run(Graph graph, Viz viz)',
      tree: 'static void run(TreeInput input, Viz viz)',
    },
  },
};

const identityMap = (code: string) => Array.from({ length: code.split('\n').length + 1 }, (_, i) => i);

/** Translate source in any supported language into JavaScript the sandbox can run. */
export function toJavaScript(lang: LanguageId, source: string): ConvertResult {
  const { frontend } = LANGUAGES[lang];
  if (!frontend) return { code: source, lineMap: identityMap(source), diagnostics: [] };
  const { program, diagnostics } = frontend.parse(source);
  if (!program) return { code: '', lineMap: [0], diagnostics };
  return { ...emitJs(program), diagnostics };
}
