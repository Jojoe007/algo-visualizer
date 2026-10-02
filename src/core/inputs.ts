import type { GraphSpec, GridSpec, TreeInput } from './trace';
import type { Template } from './tracer';

export const randomArray = (n = 14, min = 5, max = 99) =>
  Array.from({ length: n }, () => min + Math.floor(Math.random() * (max - min + 1)));

export function defaultGrid(): GridSpec {
  const rows = 15, cols = 25;
  const walls: number[] = [];
  for (let r = 0; r <= 10; r++) walls.push(r * cols + 8);
  for (let r = 4; r < rows; r++) walls.push(r * cols + 16);
  return { rows, cols, walls, start: [7, 3], end: [7, 21] };
}

export function randomGrid(base: GridSpec, density = 0.28): GridSpec {
  const { rows, cols, start, end } = base;
  const walls: number[] = [];
  for (let id = 0; id < rows * cols; id++) {
    if (id === start[0] * cols + start[1] || id === end[0] * cols + end[1]) continue;
    if (Math.random() < density) walls.push(id);
  }
  return { ...base, walls };
}

export const defaultTreeInput = (order?: number): TreeInput => ({
  order,
  ops: [10, 20, 5, 6, 12, 30, 7, 17, 3, 1, 25, 28].map((key) => ({ op: 'insert', key })),
});

const LAYOUT: Record<string, [number, number]> = {
  A: [80, 220], B: [270, 80], C: [270, 360], D: [510, 80], E: [510, 360], F: [720, 220],
};
const node = (id: string) => ({ id, x: LAYOUT[id][0], y: LAYOUT[id][1] });
const edge = (from: string, to: string, w: number) => ({ from, to, w });

/** Has negative edges but no negative cycle. */
export function defaultGraph(): GraphSpec {
  return {
    nodes: 'ABCDEF'.split('').map(node),
    edges: [
      edge('A', 'B', 6), edge('A', 'C', 7), edge('B', 'C', 8), edge('B', 'D', 5), edge('B', 'E', -4),
      edge('C', 'D', -3), edge('C', 'E', 9), edge('D', 'B', -2), edge('D', 'F', 3), edge('E', 'F', 7),
    ],
    source: 'A',
  };
}

/** Adds E → D (2), creating the negative cycle B → E → D → B (-4 + 2 - 2 = -4). */
export function negativeCycleGraph(): GraphSpec {
  const g = defaultGraph();
  return { ...g, edges: [...g.edges, edge('E', 'D', 2)] };
}

export function randomGraph(n = 7): GraphSpec {
  const ids = 'ABCDEFGH'.slice(0, n).split('');
  const nodes = ids.map((id, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { id, x: Math.round(400 + 300 * Math.cos(a)), y: Math.round(220 + 170 * Math.sin(a)) };
  });
  const edges = [];
  for (const a of ids) for (const b of ids) {
    if (a !== b && Math.random() < 0.28) edges.push(edge(a, b, Math.floor(Math.random() * 12) - 2));
  }
  return { nodes, edges, source: 'A' };
}

export function defaultInputFor(template: Template): unknown {
  if (template === 'array') return randomArray();
  if (template === 'grid') return defaultGrid();
  if (template === 'graph') return defaultGraph();
  return defaultTreeInput();
}

// ---------- best / average / worst case inputs ----------

/** n distinct, evenly spaced values (nice bar heights). */
export const evenValues = (n: number) => Array.from({ length: n }, (_, i) => Math.round(5 + (i * 94) / Math.max(1, n - 1)));

export function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sortedArray = (n: number) => evenValues(n);
export const reversedArray = (n: number) => evenValues(n).reverse();
export const shuffledArray = (n: number) => shuffled(evenValues(n));

/**
 * Best case for Lomuto quicksort (pivot = last element): the pivot is always the median.
 * After partitioning, the right part [r0, r1..] becomes [r1.., r0], so we pre-rotate it.
 */
export function quickSortBest(n: number): number[] {
  const build = (vals: number[]): number[] => {
    if (vals.length <= 1) return vals;
    const mid = Math.floor((vals.length - 1) / 2);
    const left = build(vals.slice(0, mid));
    const b = build(vals.slice(mid + 1));
    const right = b.length ? [b[b.length - 1], ...b.slice(0, -1)] : [];
    return [...left, ...right, vals[mid]];
  };
  return build(evenValues(n));
}

const gridDims = (rows: number) => ({ rows, cols: Math.round((rows * 5) / 3) });

/** No walls: the Manhattan heuristic is exact, so A* walks straight to the goal. */
export function openGrid(rows: number): GridSpec {
  const { cols } = gridDims(rows);
  const mid = Math.floor(rows / 2);
  return { rows, cols, walls: [], start: [mid, 1], end: [mid, cols - 2] };
}

/** A wall across the grid with a gap in the far corner: the heuristic keeps pulling A* into the wall. */
export function trapGrid(rows: number): GridSpec {
  const g = openGrid(rows);
  const wallCol = Math.floor(g.cols / 2);
  const walls = Array.from({ length: rows - 1 }, (_, r) => (r + 1) * g.cols + wallCol);
  return { ...g, walls };
}

export const randomWallsGrid = (rows: number) => randomGrid(openGrid(rows), 0.25);

/** A chain A → B → … with edges listed in the given order. */
export function chainGraph(n: number, order: 'forward' | 'reverse' | 'random'): GraphSpec {
  const ids = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
  const nodes = ids.map((id, i) => ({ id, x: Math.round(60 + (i * 680) / Math.max(1, n - 1)), y: i % 2 ? 300 : 140 }));
  let edges = ids.slice(1).map((id, i) => edge(ids[i], id, 1 + ((i * 7) % 9)));
  if (order === 'reverse') edges = edges.reverse();
  if (order === 'random') edges = shuffled(edges);
  return { nodes, edges, source: 'A' };
}
