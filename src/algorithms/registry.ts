import type { Template } from '../core/tracer';
import {
  chainGraph, defaultGraph, defaultGrid, defaultTreeInput, openGrid, quickSortBest, randomArray, randomWallsGrid,
  reversedArray, shuffledArray, sortedArray, trapGrid,
} from '../core/inputs';
import type { MetricKey } from '../core/metrics';
import insertionSort from './insertionSort.js?raw';
import quickSort from './quickSort.js?raw';
import astar from './astar.js?raw';
import bellmanFord from './bellmanFord.js?raw';
import bplusTree from '../structures/bplusTree.js?raw';
import bubbleSort from '../presets/bubbleSort.js?raw';
import selectionSort from '../presets/selectionSort.js?raw';
import bfs from '../presets/bfs.js?raw';
import bst from '../presets/bst.js?raw';
import dijkstra from '../presets/dijkstra.js?raw';

export type CaseName = 'best' | 'average' | 'worst';
export const CASE_NAMES: CaseName[] = ['best', 'average', 'worst'];

export interface CaseDef {
  label: string; // what the input looks like
  why: string; // why it is best / worst for this algorithm
  input: (n: number) => unknown;
}

export interface CaseStudy {
  sizeLabel: string; // what n means
  sizes: number[]; // n values for the growth chart
  defaultSize: number;
  metric: MetricKey; // headline metric for chart + race
  complexity: Record<CaseName, string>;
  cases: Record<CaseName, CaseDef>;
}

export interface AlgoDef {
  id: string;
  title: string;
  category: string;
  description: string;
  template: Template;
  source: string;
  defaultInput: () => unknown;
  caseStudy?: CaseStudy;
}

export const BUILTINS: AlgoDef[] = [
  {
    id: 'insertion-sort',
    title: 'Insertion Sort',
    category: 'Sorting',
    description: 'Builds a sorted prefix one element at a time, sinking each new element into place. O(n²) worst case, O(n) on sorted input.',
    template: 'array',
    source: insertionSort,
    defaultInput: () => randomArray(),
    caseStudy: {
      sizeLabel: 'Array length n',
      sizes: [4, 8, 12, 16, 24, 32, 48],
      defaultSize: 12,
      metric: 'comparisons',
      complexity: { best: 'O(n)', average: 'O(n²)', worst: 'O(n²)' },
      cases: {
        best: { label: 'Already sorted', why: 'Each new element is already in place, so there is 1 comparison per element and no swaps.', input: sortedArray },
        average: { label: 'Random order', why: 'Each element sinks about halfway into the sorted prefix: roughly n²/4 swaps.', input: shuffledArray },
        worst: { label: 'Reverse sorted', why: 'Every new element is the smallest so far and must sink to the front: n(n−1)/2 swaps.', input: reversedArray },
      },
    },
  },
  {
    id: 'quick-sort',
    title: 'Quick Sort',
    category: 'Sorting',
    description: 'Divide and conquer: partition around a pivot (here the last element), then recurse. Fast on average, but sorted or reversed input makes it quadratic.',
    template: 'array',
    source: quickSort,
    defaultInput: () => randomArray(),
    caseStudy: {
      sizeLabel: 'Array length n',
      sizes: [4, 8, 12, 16, 24, 32, 48],
      defaultSize: 15,
      metric: 'comparisons',
      complexity: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n²)' },
      cases: {
        best: { label: 'Pivot is always the median', why: 'Every partition splits the range in half, so the recursion is only log₂ n deep.', input: quickSortBest },
        average: { label: 'Random order', why: 'Random pivots give reasonably balanced splits: about 1.39·n·log₂ n comparisons.', input: shuffledArray },
        worst: { label: 'Reverse sorted', why: 'The last element is always the min (or max), so each partition removes one element. That gives depth n and n(n−1)/2 comparisons. Sorted input is just as bad.', input: reversedArray },
      },
    },
  },
  {
    id: 'astar',
    title: 'A* Shortest Path',
    category: 'Pathfinding',
    description: 'Best-first search ordered by f = g + h with the Manhattan heuristic. Draw walls, move start and goal, and watch the open and closed sets grow.',
    template: 'grid',
    source: astar,
    defaultInput: defaultGrid,
    caseStudy: {
      sizeLabel: 'Grid rows n (columns ≈ 5n/3)',
      sizes: [5, 7, 9, 11, 13, 15],
      defaultSize: 9,
      metric: 'expanded',
      complexity: { best: 'O(d)', average: 'depends on h', worst: 'O(V log V)' },
      cases: {
        best: { label: 'Open grid', why: 'With no walls the Manhattan heuristic is exact, so A* expands only the cells on the path.', input: openGrid },
        average: { label: 'Random walls', why: 'Some detours: the heuristic is optimistic, so A* explores around obstacles.', input: randomWallsGrid },
        worst: { label: 'Heuristic trap', why: 'A wall blocks the direct route and the only gap is in a corner. The heuristic keeps pulling A* into the wall, so it floods most of the grid first.', input: trapGrid },
      },
    },
  },
  {
    id: 'bellman-ford',
    title: 'Bellman-Ford',
    category: 'Shortest path',
    description: 'Relaxes every edge V − 1 times, so it handles negative weights. One more pass detects negative cycles. Click an edge weight to change it.',
    template: 'graph',
    source: bellmanFord,
    defaultInput: defaultGraph,
    caseStudy: {
      sizeLabel: 'Chain length n (nodes)',
      sizes: [3, 4, 5, 6, 8, 10, 12],
      defaultSize: 6,
      metric: 'edgeChecks',
      complexity: { best: 'O(E)', average: 'O(V·E)', worst: 'O(V·E)' },
      cases: {
        best: { label: 'Edges in path order', why: 'Pass 1 relaxes the chain front to back and settles every node. Pass 2 changes nothing, so it stops early.', input: (n: number) => chainGraph(n, 'forward') },
        average: { label: 'Edges shuffled', why: 'Each pass settles a few nodes, depending on how many edges happen to be in order.', input: (n: number) => chainGraph(n, 'random') },
        worst: { label: 'Edges in reverse order', why: 'Each pass can only extend the known distances by one edge, so all V − 1 passes are needed.', input: (n: number) => chainGraph(n, 'reverse') },
      },
    },
  },
  {
    id: 'bplus-tree',
    title: 'B+ Tree',
    category: 'Data structure',
    description: 'A balanced multi-way search tree. All keys live in linked leaves, and internal nodes route searches. Insert, delete and search to see splits, borrows and merges.',
    template: 'tree',
    source: bplusTree,
    defaultInput: () => defaultTreeInput(4),
  },
];

export const findBuiltin = (id: string) => BUILTINS.find((a) => a.id === id);

export const TEMPLATES: Record<Template, { label: string; hint: string; presets: { name: string; source: string; input?: () => unknown }[] }> = {
  array: {
    label: 'Array',
    hint: 'run(a, viz) gets a traced number[]. Reads, writes and swaps animate as bars.',
    presets: [
      { name: 'Bubble sort', source: bubbleSort },
      { name: 'Selection sort', source: selectionSort },
      { name: 'Insertion sort (built-in)', source: insertionSort },
      { name: 'Quick sort (built-in)', source: quickSort },
    ],
  },
  grid: {
    label: 'Grid / Graph',
    hint: 'run(grid, viz) gets a grid with neighbors(). Paint with viz.open / visit / path.',
    presets: [
      { name: 'Breadth-first search', source: bfs },
      { name: 'A* (built-in)', source: astar },
    ],
  },
  graph: {
    label: 'Weighted graph',
    hint: 'run(graph, viz) gets { nodes, edges, source, outgoing() }. Reading graph.edges highlights edges; paint with viz.node / viz.edge.',
    presets: [
      { name: 'Dijkstra', source: dijkstra },
      { name: 'Bellman-Ford (built-in)', source: bellmanFord },
    ],
  },
  tree: {
    label: 'Tree',
    hint: 'run(input, viz) gets { ops }. Snapshot any tree with viz.tree(root, { highlight, note }).',
    presets: [
      { name: 'Binary search tree', source: bst },
      { name: 'B+ tree (built-in)', source: bplusTree, input: () => defaultTreeInput(4) },
    ],
  },
};
