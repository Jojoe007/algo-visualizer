// Tracer + the `viz` API handed to every algorithm (built-in or user-written).
// Runs inside the sandbox worker (and directly in tests) — must not touch the DOM.

import type { Cell, GraphEdge, GraphSpec, GridSpec, Step, StepBody, TreeInput, TreeNodeDTO } from './trace';

export type Template = 'array' | 'grid' | 'tree' | 'graph';

export const LIMITS = { maxSteps: 100_000, maxLineHits: 2_000_000 };

export class LimitError extends Error {}

export class Tracer {
  steps: Step[] = [];
  line?: number;
  private lineHits = 0;
  private pendingVars?: Record<string, unknown>;
  private limits: typeof LIMITS;

  constructor(limits: typeof LIMITS = LIMITS) {
    this.limits = limits;
  }

  emit(body: StepBody) {
    if (this.steps.length >= this.limits.maxSteps) {
      throw new LimitError(`Step limit reached (${this.limits.maxSteps.toLocaleString()} steps). Try a smaller input.`);
    }
    const step = body as Step;
    if (this.line !== undefined) step.line = this.line;
    if (this.pendingVars) {
      step.vars = this.pendingVars;
      this.pendingVars = undefined;
    }
    this.steps.push(step);
  }

  last(): Step | undefined {
    return this.steps[this.steps.length - 1];
  }

  hitLine(n: number) {
    this.line = n;
    if (++this.lineHits > this.limits.maxLineHits) {
      throw new LimitError('Execution limit reached — is there an infinite loop?');
    }
  }

  setVars(values: Record<string, unknown>) {
    const snap: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values ?? {})) snap[k] = formatValue(v);
    this.pendingVars = snap;
  }

  /** Flush vars set after the final visual step so they aren't lost. */
  finish() {
    const last = this.last();
    if (this.pendingVars && last) last.vars = { ...last.vars, ...this.pendingVars };
    this.pendingVars = undefined;
  }

  // Consecutive reads on the same line collapse into one step (e.g. `a[j-1] > a[j]` → one compare).
  read(index: number) {
    const last = this.last();
    if (last?.kind === 'array.read' && last.line === this.line && last.indices.length < 2 && !this.pendingVars) {
      if (!last.indices.includes(index)) last.indices.push(index);
      return;
    }
    this.emit({ kind: 'array.read', indices: [index] });
  }

  // Two adjacent writes that exchange values collapse into a swap (e.g. `[a[i], a[j]] = [a[j], a[i]]`).
  write(index: number, value: unknown, prev: unknown) {
    const last = this.last();
    if (
      last?.kind === 'array.write' &&
      last.index !== index &&
      Object.is(last.value, prev) &&
      Object.is(value, last.prev) &&
      !this.pendingVars
    ) {
      const { line, vars } = last;
      this.steps[this.steps.length - 1] = { kind: 'array.swap', i: last.index, j: index, line, vars };
      return;
    }
    this.emit({ kind: 'array.write', index, value: formatScalar(value), prev: formatScalar(prev) });
  }
}

// ---------- value formatting (keeps steps structured-clone safe) ----------

function formatScalar(v: unknown): unknown {
  return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || v == null ? v : formatValue(v);
}

export function formatValue(v: unknown, depth = 0): string | number | boolean | null {
  if (v === null || v === undefined) return v === null ? null : 'undefined';
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return depth === 0 ? v : JSON.stringify(v);
  if (typeof v === 'function') return 'ƒ';
  if (depth > 1) return Array.isArray(v) ? '[…]' : '{…}';
  if (Array.isArray(v)) {
    const items = v.slice(0, 12).map((x) => String(formatValue(x, depth + 1)));
    return `[${items.join(', ')}${v.length > 12 ? ', …' : ''}]`;
  }
  if (v instanceof Map) return `Map(${v.size})`;
  if (v instanceof Set) return `Set(${v.size})`;
  try {
    const entries = Object.entries(v as object).slice(0, 6);
    return `{${entries.map(([k, x]) => `${k}: ${formatValue(x, depth + 1)}`).join(', ')}}`;
  } catch {
    return String(v);
  }
}

// ---------- traced inputs ----------

const isIndex = (p: string | symbol): boolean => typeof p === 'string' && /^(0|[1-9]\d*)$/.test(p);

function tracedArray(tracer: Tracer, target: unknown[]) {
  return new Proxy(target, {
    get(t, p, r) {
      if (isIndex(p) && +String(p) < t.length) tracer.read(+String(p));
      return Reflect.get(t, p, r);
    },
    set(t, p, v, r) {
      if (isIndex(p)) {
        const i = +String(p);
        const prev = t[i];
        Reflect.set(t, p, v, r);
        tracer.write(i, v, prev);
        return true;
      }
      if (p === 'length') {
        const old = t.length;
        Reflect.set(t, p, v, r);
        if (t.length !== old) tracer.emit({ kind: 'array.resize', length: t.length });
        return true;
      }
      return Reflect.set(t, p, v, r);
    },
  });
}

function toCell(cell: unknown, fn: string): Cell {
  if (!Array.isArray(cell) || cell.length < 2 || typeof cell[0] !== 'number' || typeof cell[1] !== 'number') {
    throw new TypeError(`viz.${fn}() expects a cell like [row, col]`);
  }
  return [cell[0], cell[1]];
}

function tracedGrid(tracer: Tracer, spec: GridSpec) {
  const walls = new Set(spec.walls);
  const { rows, cols } = spec;
  const inBounds = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols;
  const isWall = (r: number, c: number) => !inBounds(r, c) || walls.has(r * cols + c);
  return Object.freeze({
    rows,
    cols,
    start: Object.freeze([...spec.start]) as Readonly<Cell>,
    end: Object.freeze([...spec.end]) as Readonly<Cell>,
    inBounds,
    isWall,
    id: (cell: Cell) => cell[0] * cols + cell[1],
    cost: () => 1,
    neighbors(cell: Cell): Cell[] {
      const [r, c] = toCell(cell, 'neighbors');
      const last = tracer.last();
      const justVisited =
        last?.kind === 'grid.set' && last.state === 'closed' && last.cells.length === 1 &&
        last.cells[0][0] === r && last.cells[0][1] === c;
      if (!justVisited) tracer.emit({ kind: 'grid.expand', cell: [r, c] });
      const out: Cell[] = [];
      for (const [dr, dc] of [[-1, 0], [0, 1], [1, 0], [0, -1]]) {
        if (!isWall(r + dr, c + dc)) out.push([r + dr, c + dc]);
      }
      return out;
    },
  });
}

function tracedGraph(tracer: Tracer, spec: GraphSpec) {
  const edges = spec.edges.map((e) => Object.freeze({ ...e }));
  // Reading graph.edges[i] (including for…of) highlights that edge as "being examined".
  const tracedEdges = new Proxy(Object.freeze(edges), {
    get(t, p, r) {
      if (isIndex(p) && +String(p) < t.length) {
        const e = t[+String(p)];
        tracer.emit({ kind: 'graph.edge', from: e.from, to: e.to, state: 'active' });
      }
      return Reflect.get(t, p, r);
    },
  });
  return Object.freeze({
    nodes: Object.freeze(spec.nodes.map((n) => n.id)),
    edges: tracedEdges as readonly Readonly<GraphEdge>[],
    source: spec.source,
    outgoing: (id: string) => edges.filter((e) => e.from === id),
    incoming: (id: string) => edges.filter((e) => e.to === id),
  });
}

const formatInfo = (info?: Record<string, unknown>) =>
  info && Object.fromEntries(Object.entries(info).map(([k, v]) => [k, formatValue(v, 1) as number | string]));

// ---------- tree serialization (works for B+ nodes {keys, children, next} and binary {value, left, right}) ----------

type AnyNode = Record<string, unknown>;

function makeTreeSerializer() {
  const ids = new WeakMap<object, number>();
  let nextId = 1;
  const idOf = (n: object) => {
    let id = ids.get(n);
    if (id === undefined) ids.set(n, (id = nextId++));
    return id;
  };

  function serialize(root: unknown): TreeNodeDTO | null {
    const seen = new Set<object>();
    let count = 0;
    const walk = (node: unknown, depth: number): TreeNodeDTO | null => {
      if (!node || typeof node !== 'object') return null;
      if (seen.has(node) || depth > 40 || ++count > 2000) throw new Error('viz.tree(): tree too large or has a cycle');
      seen.add(node);
      const n = node as AnyNode;
      const keys = Array.isArray(n.keys)
        ? n.keys.map((k) => String(formatValue(k, 1)))
        : [String(formatValue(n.value ?? n.key ?? n.val ?? '', 1))];
      let kids: unknown[] = [];
      if (Array.isArray(n.children)) kids = n.children;
      else if (n.left || n.right) kids = [n.left ?? null, n.right ?? null];
      const dto: TreeNodeDTO = { id: idOf(n), keys, children: kids.map((k) => walk(k, depth + 1)) };
      if (n.next && typeof n.next === 'object') dto.next = idOf(n.next);
      return dto;
    };
    return walk(root, 0);
  }

  return { serialize, idOf };
}

// ---------- the public `viz` API ----------

export interface Runtime {
  tracer: Tracer;
  viz: ReturnType<typeof createViz>;
  input: unknown;
}

function createViz(tracer: Tracer, getArray: () => unknown[] | undefined) {
  const tree = makeTreeSerializer();
  const arr = (fn: string) => {
    const a = getArray();
    if (!a) throw new Error(`viz.${fn}() is only available in the Array template`);
    return a;
  };
  const indexList = (x: unknown): number[] => (Array.isArray(x) ? x : [x]).map(Number);

  return {
    /** Swap a[i] and a[j] of the input array (animated as a swap). */
    swap(i: number, j: number) {
      const a = arr('swap');
      [a[i], a[j]] = [a[j], a[i]];
      tracer.emit({ kind: 'array.swap', i, j });
    },
    /** Highlight a comparison of a[i] and a[j]; returns a[i] - a[j] for numbers. */
    compare(i: number, j: number) {
      const a = arr('compare');
      tracer.emit({ kind: 'array.compare', i, j });
      const x = a[i] as number, y = a[j] as number;
      return x < y ? -1 : x > y ? 1 : 0;
    },
    /** Persistently color indices, e.g. viz.mark([0,1,2], 'sorted'). */
    mark(indices: number | number[], mark = 'done') {
      tracer.emit({ kind: 'array.mark', indices: indexList(indices), mark: String(mark) });
    },
    unmark(indices: number | number[]) {
      tracer.emit({ kind: 'array.mark', indices: indexList(indices), mark: null });
    },

    /** Grid: mark cells as in the open set / frontier. */
    open(cell: Cell, info?: Record<string, number | string>) {
      tracer.emit({ kind: 'grid.set', cells: [toCell(cell, 'open')], state: 'open', info: info && { ...info } });
    },
    /** Grid: mark a cell as visited / closed (also becomes the "current" cell). */
    visit(cell: Cell, info?: Record<string, number | string>) {
      tracer.emit({ kind: 'grid.set', cells: [toCell(cell, 'visit')], state: 'closed', info: info && { ...info } });
    },
    /** Grid: draw the final path. */
    path(cells: Cell[]) {
      tracer.emit({ kind: 'grid.set', cells: (cells ?? []).map((c) => toCell(c, 'path')), state: 'path' });
    },

    /** Graph: color a node ('source' | 'updated' | 'done' | 'error' | 'unreachable' | null) and attach info like { d }. */
    node(id: string, state: string | null = 'updated', info?: Record<string, unknown>) {
      tracer.emit({ kind: 'graph.node', id: String(id), state: state === null ? null : String(state), info: formatInfo(info) });
    },
    /** Graph: color an edge ('active' | 'tree' | 'cycle' | null). 'active' only lasts one step. */
    edge(from: string, to: string, state: string | null = 'active') {
      tracer.emit({ kind: 'graph.edge', from: String(from), to: String(to), state: state === null ? null : String(state) });
    },

    /** Snapshot a tree. Nodes can be {keys, children, next} or {value, left, right}. */
    tree(root: unknown, opts: { highlight?: unknown; note?: string } = {}) {
      const hl = opts.highlight == null ? [] : Array.isArray(opts.highlight) ? opts.highlight : [opts.highlight];
      tracer.emit({
        kind: 'tree.snapshot',
        root: tree.serialize(root),
        highlight: hl.filter((n): n is object => !!n && typeof n === 'object').map(tree.idOf),
        note: opts.note === undefined ? undefined : String(opts.note),
      });
    },

    /** Show variables in the inspector (attached to the next step). */
    vars(values: Record<string, unknown>) {
      tracer.setVars(values);
    },
    log(...args: unknown[]) {
      tracer.emit({ kind: 'log', text: args.map((a) => String(formatValue(a))).join(' ') });
    },
    /** Start a named section (the player can jump between sections). */
    section(title: string) {
      tracer.emit({ kind: 'section', title: String(title) });
    },
  };
}

export type Viz = ReturnType<typeof createViz>;

export function createRuntime(template: Template, rawInput: unknown, limits = LIMITS): Runtime {
  const tracer = new Tracer(limits);
  let arrayTarget: unknown[] | undefined;
  const viz = createViz(tracer, () => arrayTarget);
  let input: unknown;

  if (template === 'array') {
    arrayTarget = [...(rawInput as unknown[])];
    tracer.emit({ kind: 'array.init', values: [...arrayTarget] });
    input = tracedArray(tracer, arrayTarget);
  } else if (template === 'grid') {
    const spec = rawInput as GridSpec;
    tracer.emit({ kind: 'grid.init', grid: structuredClone(spec) });
    input = tracedGrid(tracer, spec);
  } else if (template === 'graph') {
    const spec = rawInput as GraphSpec;
    tracer.emit({ kind: 'graph.init', graph: structuredClone(spec) });
    input = tracedGraph(tracer, spec);
  } else {
    const t = rawInput as TreeInput;
    tracer.emit({ kind: 'tree.snapshot', root: null, highlight: [], note: 'Empty tree' });
    input = Object.freeze({ order: t.order, ops: Object.freeze(t.ops.map((o) => Object.freeze({ ...o }))) });
  }
  return { tracer, viz, input };
}
