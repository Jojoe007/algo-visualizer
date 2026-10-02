// Bundle Monaco locally (no CDN) and teach it the `viz` API for autocompletion.

import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    return label === 'typescript' || label === 'javascript' ? new TsWorker() : new EditorWorker();
  },
};

const VIZ_DTS = `
type Cell = [row: number, col: number];

interface Viz {
  /** Array: swap a[i] and a[j] (animated). */
  swap(i: number, j: number): void;
  /** Array: highlight a comparison. Returns -1 | 0 | 1. */
  compare(i: number, j: number): -1 | 0 | 1;
  /** Array: persistently color indices, e.g. 'sorted', 'pivot', 'done'. */
  mark(indices: number | number[], mark?: string): void;
  unmark(indices: number | number[]): void;
  /** Grid: add a cell to the open set / frontier, with optional info (e.g. { g, h, f }). */
  open(cell: Cell, info?: Record<string, number | string>): void;
  /** Grid: mark a cell as visited (closed). */
  visit(cell: Cell, info?: Record<string, number | string>): void;
  /** Grid: draw the final path. */
  path(cells: Cell[]): void;
  /** Graph: color a node ('source' | 'updated' | 'done' | 'error' | 'unreachable' | null) with info like { d }. */
  node(id: string, state?: string | null, info?: Record<string, unknown>): void;
  /** Graph: color an edge ('active' | 'tree' | 'cycle' | null). 'active' lasts one step. */
  edge(from: string, to: string, state?: string | null): void;
  /** Tree: snapshot a tree of {value,left,right} or {keys,children,next} nodes. */
  tree(root: object | null, opts?: { highlight?: object | object[]; note?: string }): void;
  /** Show variables in the inspector. */
  vars(values: Record<string, unknown>): void;
  log(...args: unknown[]): void;
  /** Start a named section; the player can jump between sections. */
  section(title: string): void;
}

interface GraphEdge { readonly from: string; readonly to: string; readonly w: number }

interface Graph {
  readonly nodes: readonly string[];
  /** Directed weighted edges. Reading an edge highlights it. */
  readonly edges: readonly GraphEdge[];
  readonly source: string;
  outgoing(id: string): GraphEdge[];
  incoming(id: string): GraphEdge[];
}

interface Grid {
  readonly rows: number;
  readonly cols: number;
  readonly start: Cell;
  readonly end: Cell;
  /** Walkable 4-neighbors (traced: highlights the expanded cell). */
  neighbors(cell: Cell): Cell[];
  isWall(r: number, c: number): boolean;
  inBounds(r: number, c: number): boolean;
  /** Unique number for a cell: r * cols + c. */
  id(cell: Cell): number;
  cost(a: Cell, b: Cell): number;
}
`;

monaco.typescript.javascriptDefaults.addExtraLib(VIZ_DTS, 'ts:viz.d.ts');
monaco.typescript.javascriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ES2020,
  allowNonTsExtensions: true,
  checkJs: false,
});

loader.config({ monaco });
