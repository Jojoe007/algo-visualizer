// A* shortest path on a 4-connected grid with the Manhattan heuristic.
// grid.neighbors(cell) is traced automatically; viz.open / viz.visit / viz.path paint cells.
function run(grid, viz) {
  const { start, end } = grid;
  const id = (cell) => grid.id(cell);
  const h = (cell) => Math.abs(cell[0] - end[0]) + Math.abs(cell[1] - end[1]);

  const g = new Map([[id(start), 0]]);
  const cameFrom = new Map();
  const closed = new Set();
  const open = new MinHeap((x, y) => x.f - y.f || x.h - y.h);

  open.push({ cell: start, f: h(start), h: h(start) });
  viz.open(start, { g: 0, h: h(start), f: h(start) });

  while (open.size > 0) {
    const { cell, f } = open.pop();
    const k = id(cell);
    if (closed.has(k)) continue;
    viz.vars({ current: cell, f, openSize: open.size, closed: closed.size });

    if (k === id(end)) {
      const path = [cell];
      while (cameFrom.has(id(path[0]))) path.unshift(cameFrom.get(id(path[0])));
      viz.path(path);
      viz.log(`Found path with cost ${g.get(k)}`);
      return g.get(k);
    }

    closed.add(k);
    viz.visit(cell, { g: g.get(k), h: h(cell), f: g.get(k) + h(cell) });

    for (const next of grid.neighbors(cell)) {
      const nk = id(next);
      if (closed.has(nk)) continue;
      const tentative = g.get(k) + grid.cost(cell, next);
      if (tentative < (g.get(nk) ?? Infinity)) {
        g.set(nk, tentative);
        cameFrom.set(nk, cell);
        const hn = h(next);
        open.push({ cell: next, f: tentative + hn, h: hn });
        viz.open(next, { g: tentative, h: hn, f: tentative + hn });
      }
    }
  }
  viz.log('No path exists');
  return Infinity;
}

class MinHeap {
  constructor(less) {
    this.items = [];
    this.cmp = less;
  }
  get size() {
    return this.items.length;
  }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}
