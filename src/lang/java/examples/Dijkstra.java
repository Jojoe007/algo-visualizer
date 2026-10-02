import java.util.*;

/**
 * Dijkstra — greedy shortest paths. Correct only when every edge weight is >= 0.
 * - graph: nodes (String[]), edges, source, outgoing(id) → List<Edge> with from, to, w
 * - Helpers: viz.node(id, state, info), viz.edge(from, to, state), viz.vars(Map.of(...))
 */
public class Dijkstra {
  public static void run(Graph graph, Viz viz) {
    Map<String, Double> dist = new HashMap<>();
    Map<String, String> pred = new HashMap<>();
    Set<String> done = new HashSet<>();
    for (String id : graph.nodes) dist.put(id, Double.POSITIVE_INFINITY);
    dist.put(graph.source, 0.0);
    viz.node(graph.source, "source", Map.of("d", 0));

    while (done.size() < graph.nodes.length) {
      String u = null;
      for (String id : graph.nodes) {
        if (!done.contains(id) && (u == null || dist.get(id) < dist.get(u))) u = id;
      }
      if (u == null || dist.get(u) == Double.POSITIVE_INFINITY) break;
      done.add(u);
      viz.node(u, "done", Map.of("d", dist.get(u)));

      for (Edge e : graph.outgoing(u)) {
        viz.edge(u, e.to, "active");
        viz.vars(Map.of("u", u, "to", e.to, "w", e.w, "dU", dist.get(u), "dTo", dist.get(e.to)));
        if (!done.contains(e.to) && dist.get(u) + e.w < dist.get(e.to)) {
          if (pred.containsKey(e.to)) viz.edge(pred.get(e.to), e.to, null);
          dist.put(e.to, dist.get(u) + e.w);
          pred.put(e.to, u);
          viz.edge(u, e.to, "tree");
          viz.node(e.to, "updated", Map.of("d", dist.get(e.to)));
        }
      }
    }
    System.out.println(dist);
  }
}
