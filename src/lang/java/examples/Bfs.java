import java.util.*;

/**
 * Breadth-first search on a grid.
 * - grid: rows, cols, start, end, neighbors(cell), isWall(r, c), id(cell). Cells are int[] {row, col}.
 * - Helpers: viz.open(cell, info), viz.visit(cell, info), viz.path(cells), viz.vars(Map.of(...))
 */
public class Bfs {
  public static void run(Grid grid, Viz viz) {
    Queue<int[]> queue = new ArrayDeque<>();
    Map<Integer, Integer> dist = new HashMap<>();
    Map<Integer, int[]> parent = new HashMap<>();
    queue.offer(grid.start);
    dist.put(grid.id(grid.start), 0);
    viz.open(grid.start, Map.of("d", 0));

    while (!queue.isEmpty()) {
      int[] cell = queue.poll();
      viz.visit(cell, Map.of("d", dist.get(grid.id(cell))));
      viz.vars(Map.of("cell", cell, "queue", queue.size()));

      if (grid.id(cell) == grid.id(grid.end)) {
        List<int[]> path = new ArrayList<>();
        path.add(cell);
        while (parent.containsKey(grid.id(path.get(0)))) path.add(0, parent.get(grid.id(path.get(0))));
        viz.path(path);
        return;
      }

      for (int[] next : grid.neighbors(cell)) {
        if (dist.containsKey(grid.id(next))) continue;
        dist.put(grid.id(next), dist.get(grid.id(cell)) + 1);
        parent.put(grid.id(next), cell);
        queue.offer(next);
        viz.open(next, Map.of("d", dist.get(grid.id(next))));
      }
    }
    System.out.println("No path");
  }
}
