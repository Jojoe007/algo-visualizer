// Types of the objects the visualizer runtime hands to `run(input, viz)` (core/tracer.ts).
// Front ends use them to type member access on inputs, e.g. grid.id(cell) is an int.

import { T, type Type } from './core';

interface HostType {
  fields: Record<string, Type>;
  methods: Record<string, Type>;
}

const cell: Type = { kind: 'array', of: T.int };
const edge: Type = { kind: 'host', name: 'Edge' };
const treeOp: Type = { kind: 'host', name: 'TreeOp' };

export const HOST_TYPES: Record<string, HostType> = {
  Viz: {
    fields: {},
    methods: {
      swap: T.void, compare: T.int, mark: T.void, unmark: T.void,
      open: T.void, visit: T.void, path: T.void,
      node: T.void, edge: T.void, tree: T.void,
      vars: T.void, log: T.void, section: T.void,
    },
  },
  Grid: {
    fields: { rows: T.int, cols: T.int, start: cell, end: cell },
    methods: {
      neighbors: { kind: 'seq', of: cell, origin: 'List' },
      inBounds: T.boolean, isWall: T.boolean, id: T.int, cost: T.int,
    },
  },
  Graph: {
    fields: { nodes: { kind: 'array', of: T.string }, edges: { kind: 'array', of: edge }, source: T.string },
    methods: { outgoing: { kind: 'seq', of: edge, origin: 'List' }, incoming: { kind: 'seq', of: edge, origin: 'List' } },
  },
  Edge: { fields: { from: T.string, to: T.string, w: T.int }, methods: {} },
  TreeInput: { fields: { order: T.int, ops: { kind: 'array', of: treeOp } }, methods: {} },
  TreeOp: { fields: { op: T.string, key: T.int }, methods: {} },
};

export const isViz = (t: Type) => t.kind === 'host' && t.name === 'Viz';
