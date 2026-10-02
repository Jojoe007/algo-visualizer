import { describe, expect, it } from 'vitest';
import { execute } from '../sandbox/execute';
import { Player } from '../core/player';
import { randomArray, randomGrid, defaultGrid, defaultGraph, negativeCycleGraph, randomGraph } from '../core/inputs';
import type { GraphSpec, GridSpec, Step, TreeNodeDTO, TreeOp } from '../core/trace';
import { BUILTINS, CASE_NAMES, TEMPLATES } from '../algorithms/registry';
import { computeMetrics } from '../core/metrics';

const src = (id: string) => BUILTINS.find((b) => b.id === id)!.source;
const finalState = (steps: Step[]) => new Player(steps).stateAt(steps.length - 1);

describe('sorting', () => {
  const sorters = [src('insertion-sort'), ...TEMPLATES.array.presets.map((p) => p.source)];
  it.each(sorters.map((s, i) => [i, s]))('sorter #%i sorts random arrays', (_, source) => {
    for (let t = 0; t < 20; t++) {
      const input = randomArray(1 + Math.floor(Math.random() * 20));
      const { steps, error } = execute(source as string, 'array', input);
      expect(error).toBeUndefined();
      const s = finalState(steps);
      expect(s.array!.values).toEqual([...input].sort((a, b) => a - b));
      expect(s.array!.marks.every((m) => m === 'sorted')).toBe(true);
    }
  });
});

function bfsDistance(g: GridSpec): number {
  const walls = new Set(g.walls);
  const dist = new Map([[g.start[0] * g.cols + g.start[1], 0]]);
  const q = [g.start];
  while (q.length) {
    const [r, c] = q.shift()!;
    const d = dist.get(r * g.cols + c)!;
    if (r === g.end[0] && c === g.end[1]) return d;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr, nc = c + dc, id = nr * g.cols + nc;
      if (nr < 0 || nc < 0 || nr >= g.rows || nc >= g.cols || walls.has(id) || dist.has(id)) continue;
      dist.set(id, d + 1);
      q.push([nr, nc]);
    }
  }
  return Infinity;
}

describe('A*', () => {
  it('finds optimal paths (matches BFS distance) on random grids', () => {
    for (let t = 0; t < 40; t++) {
      const grid = randomGrid(defaultGrid(), 0.3);
      const { steps, error } = execute(src('astar'), 'grid', grid);
      expect(error).toBeUndefined();
      const pathStep = steps.find((s) => s.kind === 'grid.set' && s.state === 'path');
      const expected = bfsDistance(grid);
      if (expected === Infinity) expect(pathStep).toBeUndefined();
      else {
        expect(pathStep).toBeDefined();
        const cells = (pathStep as { cells: [number, number][] }).cells;
        expect(cells.length - 1).toBe(expected);
        // path is contiguous and avoids walls
        for (let i = 1; i < cells.length; i++) {
          const [a, b] = [cells[i - 1], cells[i]];
          expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])).toBe(1);
          expect(grid.walls.includes(b[0] * grid.cols + b[1])).toBe(false);
        }
      }
    }
  });
});

function checkBPlus(root: TreeNodeDTO | null, order: number, expected: Set<number>) {
  const minKeys = Math.ceil(order / 2) - 1;
  const leafDepths = new Set<number>();
  const leaves: TreeNodeDTO[] = [];
  const walk = (n: TreeNodeDTO, depth: number, lo: number, hi: number, isRoot: boolean): number[] => {
    const keys = n.keys.map(Number);
    expect(keys.length).toBeLessThanOrEqual(order - 1);
    if (!isRoot) expect(keys.length).toBeGreaterThanOrEqual(minKeys);
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
    if (n.children.length === 0) {
      leafDepths.add(depth);
      leaves.push(n);
      for (const k of keys) expect(k >= lo && k < hi).toBe(true);
      return keys;
    }
    expect(n.children.length).toBe(keys.length + 1);
    const bounds = [lo, ...keys, hi];
    return n.children.flatMap((c, i) => walk(c!, depth + 1, bounds[i], bounds[i + 1], false));
  };
  const all = root ? walk(root, 0, -Infinity, Infinity, true) : [];
  expect(leafDepths.size).toBeLessThanOrEqual(1);
  expect(all).toEqual([...expected].sort((a, b) => a - b));
  // leaf links chain left → right
  for (let i = 0; i < leaves.length - 1; i++) expect(leaves[i].next).toBe(leaves[i + 1].id);
  if (leaves.length) expect(leaves[leaves.length - 1].next).toBeUndefined();
}

describe('B+ tree', () => {
  it.each([3, 4, 5, 6])('keeps invariants under random insert/delete/search (order %i)', (order) => {
    for (let t = 0; t < 15; t++) {
      const model = new Set<number>();
      const ops: TreeOp[] = [];
      for (let k = 0; k < 60; k++) {
        const key = Math.floor(Math.random() * 40);
        const r = Math.random();
        ops.push({ op: r < 0.55 ? 'insert' : r < 0.85 ? 'delete' : 'search', key });
      }
      const { steps, error } = execute(src('bplus-tree'), 'tree', { order, ops });
      expect(error).toBeUndefined();
      for (const o of ops) o.op === 'insert' ? model.add(o.key) : o.op === 'delete' && model.delete(o.key);
      checkBPlus(finalState(steps).tree!.root, order, model);
    }
  });

  it('reports search hits and misses', () => {
    const ops: TreeOp[] = [1, 2, 3, 4, 5, 6, 7].map((key) => ({ op: 'insert', key }));
    ops.push({ op: 'search', key: 6 }, { op: 'search', key: 42 });
    const { steps } = execute(src('bplus-tree'), 'tree', { order: 3, ops });
    const notes = steps.flatMap((s) => (s.kind === 'tree.snapshot' && s.note ? [s.note] : []));
    expect(notes).toContain('Found 6');
    expect(notes).toContain('42 not found');
  });
});

/** Reference Bellman-Ford: distances, or null if a negative cycle is reachable. */
function referenceBF(g: GraphSpec): Record<string, number> | null {
  const d: Record<string, number> = Object.fromEntries(g.nodes.map((n) => [n.id, Infinity]));
  d[g.source] = 0;
  for (let i = 0; i < g.nodes.length - 1; i++) for (const e of g.edges) if (d[e.from] + e.w < d[e.to]) d[e.to] = d[e.from] + e.w;
  return g.edges.some((e) => d[e.from] + e.w < d[e.to]) ? null : d;
}

describe('Bellman-Ford', () => {
  const finalDistances = (g: GraphSpec) => {
    const { steps, error } = execute(src('bellman-ford'), 'graph', g);
    expect(error).toBeUndefined();
    const s = finalState(steps);
    const cycle = Object.values(s.graph!.edges).includes('cycle');
    if (cycle) return null;
    return Object.fromEntries(g.nodes.map((n) => {
      const d = s.graph!.nodes[n.id]?.info?.d;
      return [n.id, d === 'Infinity' ? Infinity : Number(d)];
    }));
  };

  it('matches a reference implementation on the example and random graphs', () => {
    expect(finalDistances(defaultGraph())).toEqual({ A: 0, B: 2, C: 7, D: 4, E: -2, F: 5 });
    for (let t = 0; t < 60; t++) {
      const g = randomGraph(4 + Math.floor(Math.random() * 5));
      expect(finalDistances(g)).toEqual(referenceBF(g));
    }
  });

  it('detects a negative cycle', () => {
    expect(finalDistances(negativeCycleGraph())).toBeNull();
  });

  it('highlights edges automatically when graph.edges is read', () => {
    const r = execute('function run(g, viz) {\n  for (const e of g.edges) {}\n}', 'graph', defaultGraph());
    expect(r.steps.filter((s) => s.kind === 'graph.edge' && s.state === 'active')).toHaveLength(defaultGraph().edges.length);
  });
});

describe('best / average / worst cases', () => {
  const metricFor = (id: string, c: 'best' | 'average' | 'worst', n: number) => {
    const def = BUILTINS.find((b) => b.id === id)!;
    const { steps, error } = execute(def.source, def.template, def.caseStudy!.cases[c].input(n));
    expect(error).toBeUndefined();
    return computeMetrics(steps);
  };

  it('insertion sort: n−1 comparisons best, n(n−1)/2 swaps worst', () => {
    const n = 20;
    expect(metricFor('insertion-sort', 'best', n)).toMatchObject({ comparisons: n - 1, swaps: 0 });
    expect(metricFor('insertion-sort', 'worst', n)).toMatchObject({ comparisons: (n * (n - 1)) / 2, swaps: (n * (n - 1)) / 2 });
  });

  it('quick sort: median pivots ≈ n log n, reversed input = n(n−1)/2 comparisons', () => {
    const n = 31; // 2^5 − 1: perfectly balanced
    const best = metricFor('quick-sort', 'best', n).comparisons;
    expect(metricFor('quick-sort', 'worst', n).comparisons).toBe((n * (n - 1)) / 2);
    expect(best).toBeLessThanOrEqual(n * Math.log2(n + 1)); // 31·5 = 155
    for (let t = 0; t < 10; t++) expect(best).toBeLessThanOrEqual(metricFor('quick-sort', 'average', n).comparisons);
  });

  it('A*: open grid expands only the path; the trap expands far more', () => {
    const best = metricFor('astar', 'best', 9);
    const g = BUILTINS.find((b) => b.id === 'astar')!.caseStudy!.cases.best.input(9) as GridSpec;
    expect(best.expanded).toBe(g.end[1] - g.start[1]); // path length (goal itself not expanded)
    expect(metricFor('astar', 'worst', 9).expanded).toBeGreaterThan(best.expanded * 3);
  });

  it('Bellman-Ford: 2 passes best, n−1 passes worst', () => {
    const n = 8;
    expect(metricFor('bellman-ford', 'best', n).passes).toBe(2);
    expect(metricFor('bellman-ford', 'worst', n).passes).toBe(n - 1);
  });

  it('every case of every algorithm runs at every chart size', () => {
    for (const def of BUILTINS.filter((b) => b.caseStudy)) {
      for (const c of CASE_NAMES) for (const n of def.caseStudy!.sizes) {
        expect(execute(def.source, def.template, def.caseStudy!.cases[c].input(n)).error, `${def.id} ${c} n=${n}`).toBeUndefined();
      }
    }
  });
});

describe('player', () => {
  it('random access equals sequential replay', () => {
    const { steps } = execute(src('insertion-sort'), 'array', randomArray(25));
    const p = new Player(steps, 16);
    const forward = steps.map((_, i) => JSON.stringify(p.stateAt(i)));
    const q = new Player(steps, 16);
    for (let n = 0; n < 200; n++) {
      const i = Math.floor(Math.random() * steps.length);
      expect(JSON.stringify(q.stateAt(i))).toBe(forward[i]);
    }
    for (let i = steps.length - 1; i >= 0; i--) expect(JSON.stringify(q.stateAt(i))).toBe(forward[i]);
  });
});

describe('sandbox', () => {
  it('stops infinite loops', () => {
    const r = execute('function run(a, viz) { while (true) {} }', 'array', [1, 2]);
    expect(r.error?.phase).toBe('limit');
    expect(r.error?.line).toBe(1);
  });

  it('stops runaway step emission', () => {
    const r = execute('function run(a, viz) {\n  for (;;) viz.swap(0, 1);\n}', 'array', [1, 2], { maxSteps: 500, maxLineHits: 1e9 });
    expect(r.error?.phase).toBe('limit');
    expect(r.steps.length).toBe(500);
  });

  it('reports runtime errors with the failing line', () => {
    const code = 'function run(a, viz) {\n  const x = 1;\n  undefinedFn(x);\n}';
    const r = execute(code, 'array', [1]);
    expect(r.error).toMatchObject({ phase: 'runtime', line: 3 });
    expect(r.error!.message).toMatch(/ReferenceError/);
  });

  it('reports syntax errors with position', () => {
    const r = execute('function run(a, viz) {\n  let = ;\n}', 'array', [1]);
    expect(r.error).toMatchObject({ phase: 'syntax', line: 2 });
  });

  it('requires a run function', () => {
    expect(execute('const x = 1;', 'array', [1]).error?.message).toMatch(/run\(input, viz\)/);
  });

  it('auto-traces reads as compares and destructuring swaps as swaps', () => {
    const r = execute('function run(a, viz) {\n  if (a[0] > a[1]) [a[0], a[1]] = [a[1], a[0]];\n}', 'array', [5, 3]);
    expect(r.error).toBeUndefined();
    const kinds = r.steps.map((s) => s.kind);
    expect(kinds).toEqual(['array.init', 'array.read', 'array.read', 'array.swap']);
    expect(r.steps[1]).toMatchObject({ indices: [0, 1], line: 2 });
    expect(finalState(r.steps).array!.values).toEqual([3, 5]);
  });

  it('attaches line numbers and vars to steps', () => {
    const r = execute('function run(a, viz) {\n  viz.vars({ n: a.length });\n  viz.swap(0, 1);\n}', 'array', [1, 2]);
    expect(r.steps[1]).toMatchObject({ kind: 'array.swap', line: 3, vars: { n: 2 } });
  });

  it('runs every Playground preset without errors', () => {
    const inputs = { array: randomArray(), grid: defaultGrid(), graph: defaultGraph(), tree: { ops: [5, 3, 8, 1, 4].map((key) => ({ op: 'insert', key })) } };
    for (const [template, t] of Object.entries(TEMPLATES)) {
      for (const p of t.presets) {
        const input = template === 'tree' && p.name.startsWith('B+') ? { order: 4, ...inputs.tree } : inputs[template as keyof typeof inputs];
        expect(execute(p.source, template as never, input).error, p.name).toBeUndefined();
      }
    }
  });
});
