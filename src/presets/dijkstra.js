/**
 * Dijkstra — greedy shortest paths. Correct only when every edge weight is ≥ 0.
 * Try it on the default graph (which has negative edges) and compare with Bellman-Ford.
 * - graph: { nodes: string[], edges: {from, to, w}[], source, outgoing(id), incoming(id) }
 * - Helpers: viz.node(id, state, info), viz.edge(from, to, state), viz.vars({...})
 *
 * @param {Graph} graph
 * @param {Viz} viz
 */
function run(graph, viz) {
  const dist = {};
  const pred = {};
  const done = new Set();
  for (const id of graph.nodes) dist[id] = Infinity;
  dist[graph.source] = 0;
  viz.node(graph.source, 'source', { d: 0 });

  while (done.size < graph.nodes.length) {
    let u = null;
    for (const id of graph.nodes) if (!done.has(id) && (u === null || dist[id] < dist[u])) u = id;
    if (u === null || dist[u] === Infinity) break;
    done.add(u);
    viz.node(u, 'done', { d: dist[u] });

    for (const { to, w } of graph.outgoing(u)) {
      viz.edge(u, to, 'active');
      viz.vars({ u, to, w, dU: dist[u], dTo: dist[to] });
      if (!done.has(to) && dist[u] + w < dist[to]) {
        if (pred[to] !== undefined) viz.edge(pred[to], to, null);
        dist[to] = dist[u] + w;
        pred[to] = u;
        viz.edge(u, to, 'tree');
        viz.node(to, 'updated', { d: dist[to] });
      }
    }
  }
  viz.log('Distances:', dist);
}
