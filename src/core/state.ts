// Reducer: (state, step) → state. Renderers draw VizState; they never look at raw steps.

import type { CellInfo, GraphSpec, GridCellState, GridSpec, Step, TreeNodeDTO } from './trace';

export type ArrayActivity = 'read' | 'compare' | 'swap' | 'write';

export interface ArrayState {
  values: unknown[];
  ids: number[]; // stable identity per element so swaps animate as moves
  marks: (string | null)[];
  active: number[]; // transient: indices touched by the current step
  activity: ArrayActivity | null;
  nextId: number;
}

export interface GridState {
  spec: GridSpec;
  cells: Record<number, GridCellState>;
  info: Record<number, CellInfo>;
  current: number | null;
  changed: number[]; // transient
}

export interface GraphState {
  spec: GraphSpec;
  nodes: Record<string, { state: string | null; info?: CellInfo }>;
  edges: Record<string, string | null>; // key `${from}->${to}`
  activeEdge: string | null; // transient
  activeNode: string | null; // transient
}

export const edgeKey = (from: string, to: string) => `${from}->${to}`;

export interface TreeState {
  root: TreeNodeDTO | null;
  highlight: number[];
}

export interface VizState {
  array?: ArrayState;
  grid?: GridState;
  tree?: TreeState;
  graph?: GraphState;
  line?: number;
  vars: Record<string, unknown>;
  logs: string[];
  caption: string;
  section?: string;
}

export const initialState = (): VizState => ({ vars: {}, logs: [], caption: '' });

const fmt = (v: unknown) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
const cellStr = ([r, c]: [number, number]) => `(${r}, ${c})`;
const infoStr = (info?: CellInfo) =>
  info ? ' ' + Object.entries(info).map(([k, v]) => `${k}=${v}`).join(' ') : '';

function rangeLabel(indices: number[]) {
  if (indices.length === 0) return 'nothing';
  const sorted = [...indices].sort((a, b) => a - b);
  const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 2) return `a[${sorted[0]}..${sorted[sorted.length - 1]}]`;
  return sorted.map((i) => `a[${i}]`).join(', ');
}

/** Applies one step in place. Callers clone when they need immutability. */
export function applyStep(s: VizState, step: Step) {
  if (s.array) {
    s.array.active = [];
    s.array.activity = null;
  }
  if (s.grid) s.grid.changed = [];
  if (s.graph) {
    s.graph.activeEdge = null;
    s.graph.activeNode = null;
  }
  if (step.line !== undefined) s.line = step.line;
  if (step.vars) s.vars = step.vars;

  switch (step.kind) {
    case 'array.init': {
      const n = step.values.length;
      s.array = {
        values: [...step.values],
        ids: Array.from({ length: n }, (_, i) => i),
        marks: Array(n).fill(null),
        active: [],
        activity: null,
        nextId: n,
      };
      s.caption = `Input: ${n} elements`;
      break;
    }
    case 'array.read':
    case 'array.compare': {
      const a = s.array!;
      const idx = step.kind === 'array.read' ? step.indices : [step.i, step.j];
      a.active = idx;
      a.activity = idx.length > 1 ? 'compare' : 'read';
      s.caption =
        idx.length > 1
          ? `Compare a[${idx[0]}] = ${fmt(a.values[idx[0]])} with a[${idx[1]}] = ${fmt(a.values[idx[1]])}`
          : `Read a[${idx[0]}] = ${fmt(a.values[idx[0]])}`;
      break;
    }
    case 'array.write': {
      const a = s.array!;
      while (a.values.length <= step.index) {
        a.values.push(undefined);
        a.ids.push(a.nextId++);
        a.marks.push(null);
      }
      a.values[step.index] = step.value;
      a.active = [step.index];
      a.activity = 'write';
      s.caption = `Write a[${step.index}] = ${fmt(step.value)}`;
      break;
    }
    case 'array.swap': {
      const a = s.array!;
      const { i, j } = step;
      s.caption = `Swap a[${i}] = ${fmt(a.values[i])} ↔ a[${j}] = ${fmt(a.values[j])}`;
      [a.values[i], a.values[j]] = [a.values[j], a.values[i]];
      [a.ids[i], a.ids[j]] = [a.ids[j], a.ids[i]];
      a.active = [i, j];
      a.activity = 'swap';
      break;
    }
    case 'array.resize': {
      const a = s.array!;
      while (a.values.length < step.length) {
        a.values.push(undefined);
        a.ids.push(a.nextId++);
        a.marks.push(null);
      }
      a.values.length = a.ids.length = a.marks.length = step.length;
      s.caption = `Length → ${step.length}`;
      break;
    }
    case 'array.mark': {
      const a = s.array!;
      for (const i of step.indices) if (i >= 0 && i < a.marks.length) a.marks[i] = step.mark;
      s.caption = step.mark ? `Mark ${rangeLabel(step.indices)} as ${step.mark}` : `Unmark ${rangeLabel(step.indices)}`;
      break;
    }
    case 'grid.init':
      s.grid = { spec: step.grid, cells: {}, info: {}, current: null, changed: [] };
      s.caption = `Grid ${step.grid.rows}×${step.grid.cols} — start ${cellStr(step.grid.start)}, goal ${cellStr(step.grid.end)}`;
      break;
    case 'grid.expand': {
      const g = s.grid!;
      g.current = step.cell[0] * g.spec.cols + step.cell[1];
      s.caption = `Expand neighbors of ${cellStr(step.cell)}`;
      break;
    }
    case 'grid.set': {
      const g = s.grid!;
      for (const cell of step.cells) {
        const id = cell[0] * g.spec.cols + cell[1];
        g.cells[id] = step.state;
        if (step.info) g.info[id] = step.info;
        g.changed.push(id);
      }
      const last = step.cells[step.cells.length - 1];
      if (step.state === 'closed' && last) g.current = last[0] * g.spec.cols + last[1];
      if (step.state === 'path') g.current = null;
      s.caption =
        step.state === 'open'
          ? `Add ${cellStr(step.cells[0])} to open set${infoStr(step.info)}`
          : step.state === 'closed'
            ? `Visit ${cellStr(step.cells[0])}${infoStr(step.info)}`
            : `Path: ${step.cells.length} cells`;
      break;
    }
    case 'graph.init':
      s.graph = { spec: step.graph, nodes: {}, edges: {}, activeEdge: null, activeNode: null };
      s.caption = `Graph: ${step.graph.nodes.length} nodes, ${step.graph.edges.length} edges — source ${step.graph.source}`;
      break;
    case 'graph.edge': {
      const g = s.graph!;
      const key = edgeKey(step.from, step.to);
      const w = g.spec.edges.find((e) => e.from === step.from && e.to === step.to)?.w;
      const label = `${step.from} → ${step.to}${w === undefined ? '' : ` (w = ${w})`}`;
      if (step.state === 'active') {
        g.activeEdge = key;
        s.caption = `Examine edge ${label}`;
      } else {
        g.edges[key] = step.state;
        g.activeEdge = key;
        s.caption = step.state ? `Mark edge ${label} as ${step.state}` : `Clear edge ${label}`;
      }
      break;
    }
    case 'graph.node': {
      const g = s.graph!;
      const prev = g.nodes[step.id];
      g.nodes[step.id] = { state: step.state, info: step.info ?? prev?.info };
      g.activeNode = step.id;
      s.caption = `Node ${step.id}${step.state ? ` → ${step.state}` : ''}${infoStr(step.info)}`;
      break;
    }
    case 'tree.snapshot':
      s.tree = { root: step.root, highlight: step.highlight };
      s.caption = step.note ?? 'Tree updated';
      break;
    case 'log':
      s.logs = [...s.logs, step.text];
      s.caption = step.text;
      break;
    case 'section':
      s.section = step.title;
      s.logs = [...s.logs, `▶ ${step.title}`];
      s.caption = `▶ ${step.title}`;
      break;
  }
}
