// The trace is the contract between "running code" and "drawing it".
// Built-in algorithms and user code both produce Step[]; renderers only ever see VizState.

export type Cell = [number, number];

export interface TreeNodeDTO {
  id: number;
  keys: string[];
  children: (TreeNodeDTO | null)[];
  next?: number; // id of right sibling (B+ tree leaf links)
}

export type GridCellState = 'open' | 'closed' | 'path';

export interface GridSpec {
  rows: number;
  cols: number;
  walls: number[]; // flattened ids: r * cols + c
  start: Cell;
  end: Cell;
}

export interface GraphEdge {
  from: string;
  to: string;
  w: number;
}

export interface GraphSpec {
  nodes: { id: string; x: number; y: number }[]; // x/y in a 800×440 canvas
  edges: GraphEdge[]; // directed
  source: string;
}

export interface TreeOp {
  op: 'insert' | 'delete' | 'search';
  key: number;
}

export interface TreeInput {
  order?: number;
  ops: TreeOp[];
}

export type StepBody =
  | { kind: 'array.init'; values: unknown[] }
  | { kind: 'array.read'; indices: number[] }
  | { kind: 'array.compare'; i: number; j: number }
  | { kind: 'array.write'; index: number; value: unknown; prev: unknown }
  | { kind: 'array.swap'; i: number; j: number }
  | { kind: 'array.resize'; length: number }
  | { kind: 'array.mark'; indices: number[]; mark: string | null }
  | { kind: 'grid.init'; grid: GridSpec }
  | { kind: 'grid.expand'; cell: Cell }
  | { kind: 'grid.set'; cells: Cell[]; state: GridCellState; info?: CellInfo }
  | { kind: 'graph.init'; graph: GraphSpec }
  | { kind: 'graph.edge'; from: string; to: string; state: string | null } // 'active' is transient
  | { kind: 'graph.node'; id: string; state: string | null; info?: CellInfo }
  | { kind: 'tree.snapshot'; root: TreeNodeDTO | null; highlight: number[]; note?: string }
  | { kind: 'log'; text: string }
  | { kind: 'section'; title: string };

export type CellInfo = Record<string, number | string>;

export type Step = StepBody & {
  line?: number; // source line active when the step was emitted
  vars?: Record<string, unknown>; // latest viz.vars() snapshot, attached when it changed
};

export type StepKind = Step['kind'];

export interface RunError {
  message: string;
  line?: number;
  column?: number;
  phase: 'syntax' | 'runtime' | 'limit' | 'timeout';
}

export interface RunResult {
  steps: Step[];
  error?: RunError;
}
