// Bellman-Ford — single-source shortest paths that tolerate negative edge weights.
// Relax every edge |V| - 1 times; if anything still relaxes, there is a negative cycle.
// Reading graph.edges highlights each edge as it is examined.
function run(graph, viz) {
  const dist = {};
  const pred = {};
  for (const id of graph.nodes) dist[id] = Infinity;
  dist[graph.source] = 0;
  viz.node(graph.source, 'source', { d: 0 });

  const n = graph.nodes.length;
  for (let pass = 1; pass < n; pass++) {
    viz.section(`Pass ${pass}`);
    let changed = false;
    for (const { from, to, w } of graph.edges) {
      viz.vars({ pass, edge: `${from}→${to}`, w, dFrom: dist[from], dTo: dist[to] });
      if (dist[from] + w < dist[to]) {
        if (pred[to] !== undefined) viz.edge(pred[to], to, null);
        dist[to] = dist[from] + w;
        pred[to] = from;
        viz.edge(from, to, 'tree');
        viz.node(to, 'updated', { d: dist[to] });
        changed = true;
      }
    }
    if (!changed) {
      viz.log(`No changes in pass ${pass}: distances are final`);
      break;
    }
  }

  viz.section('Negative-cycle check');
  for (const { from, to, w } of graph.edges) {
    if (dist[from] + w < dist[to]) {
      viz.edge(from, to, 'cycle');
      viz.node(to, 'error');
      viz.log(`Negative cycle: ${from} → ${to} can still be relaxed`);
      return null;
    }
  }

  for (const id of graph.nodes) {
    viz.node(id, dist[id] === Infinity ? 'unreachable' : id === graph.source ? 'source' : 'done', { d: dist[id] });
  }
  viz.log('Shortest distances:', dist);
  return dist;
}
