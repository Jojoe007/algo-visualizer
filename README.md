# AlgoViz

A step-by-step algorithm and data-structure visualizer. It includes Insertion Sort, A\* and a B+ Tree, plus a **Playground** where you write your own JavaScript algorithm and watch it run line by line.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # engine tests (sorting, A* optimality, B+ tree invariants, sandbox limits)
```

## How it works

```
code ──instrument──▶ run in Web Worker ──▶ Step[] (trace) ──reduce──▶ VizState ──▶ SVG renderer
```

- **Everything is a trace.** Built-in algorithms are plain JS files (`src/algorithms/*.js`, `src/structures/*.js`) written against the same `viz` API that users get. They run through the same sandbox as user code.
- **Line highlighting.** `src/sandbox/instrument.ts` (acorn + astring) inserts `__line(n)` before every statement, and every recorded step remembers its line.
- **Auto-tracing.** In the Array template, the input is a Proxy, so `a[i]` reads become compare highlights and `[a[i], a[j]] = [a[j], a[i]]` becomes a swap. In the Grid template, `grid.neighbors()` is traced.
- **Sandbox.** Code runs in a fresh Web Worker with a 3 s wall clock, a 2M statement budget (which catches infinite loops) and a 100k step cap.
- **Player.** `src/core/player.ts` stores keyframes every 64 steps, so jumping and scrubbing are instant in both directions.

## Best vs average vs worst case

Insertion Sort, Quick Sort, A* and Bellman-Ford each have a `caseStudy` in `src/algorithms/registry.ts`, which gives every case an input generator `input(n)`, an explanation and its complexity.

- **Step through → Input: Best / Average / Worst** loads that case's input into the normal player.
- **Compare cases** runs all three side by side on one clock (a "race"), so the worst case visibly lags. It also plots the headline metric (comparisons, cells expanded or edge checks) against n and shows a totals table. Metrics are counted from the trace (`src/core/metrics.ts`).

## Writing your own algorithm

```js
function run(a, viz) {            // Array template: a is a traced number[]
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j + 1 < a.length - i; j++)
      if (a[j] > a[j + 1]) [a[j], a[j + 1]] = [a[j + 1], a[j]];
}
```

| Template | `input` | Useful helpers |
|---|---|---|
| Array | traced `number[]` | `viz.swap`, `viz.compare`, `viz.mark(idx, 'sorted'/'pivot')` |
| Grid | `{ rows, cols, start, end, neighbors(), isWall(), id(), cost() }` | `viz.open(cell, info)`, `viz.visit(cell, info)`, `viz.path(cells)` |
| Tree | `{ order?, ops: [{ op, key }] }` | `viz.tree(root, { highlight, note })`. Nodes can be `{value,left,right}` or `{keys,children,next}` |
| All | | `viz.vars({...})`, `viz.log(...)`, `viz.section(title)` |

Saved algorithms and the current draft are stored in `localStorage`.
