/**
 * Breadth-first search on a grid.
 * - grid: { rows, cols, start, end, neighbors(cell), isWall(r, c), id(cell), cost(a, b) }
 *   Cells are [row, col]. grid.neighbors() is traced automatically.
 * - Helpers: viz.open(cell, info?), viz.visit(cell, info?), viz.path(cells), viz.vars({...})
 *
 * @param {Grid} grid
 * @param {Viz} viz
 */
function run(grid, viz) {
  const queue = [grid.start];
  const dist = new Map([[grid.id(grid.start), 0]]);
  const parent = new Map();
  viz.open(grid.start, { d: 0 });

  while (queue.length > 0) {
    const cell = queue.shift();
    viz.visit(cell, { d: dist.get(grid.id(cell)) });
    viz.vars({ cell, queue: queue.length });

    if (grid.id(cell) === grid.id(grid.end)) {
      const path = [cell];
      while (parent.has(grid.id(path[0]))) path.unshift(parent.get(grid.id(path[0])));
      viz.path(path);
      return;
    }

    for (const next of grid.neighbors(cell)) {
      if (dist.has(grid.id(next))) continue;
      dist.set(grid.id(next), dist.get(grid.id(cell)) + 1);
      parent.set(grid.id(next), cell);
      queue.push(next);
      viz.open(next, { d: dist.get(grid.id(next)) });
    }
  }
  viz.log('No path');
}
