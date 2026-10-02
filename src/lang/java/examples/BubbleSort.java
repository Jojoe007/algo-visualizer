/**
 * Bubble sort, written in Java and converted to JavaScript.
 * - `a` is the input array. Reads (a[i]) and writes (a[i] = x) are traced automatically.
 * - Helpers: viz.swap(i, j), viz.mark(i, "sorted"), viz.vars(Map.of(...)), System.out.println(...)
 */
class BubbleSort {
  static void run(int[] a, Viz viz) {
    for (int end = a.length - 1; end > 0; end--) {
      boolean swapped = false;
      for (int i = 0; i < end; i++) {
        viz.vars(Map.of("i", i, "end", end, "swapped", swapped));
        if (a[i] > a[i + 1]) {
          viz.swap(i, i + 1);
          swapped = true;
        }
      }
      viz.mark(end, "sorted");
      if (!swapped) break;
    }
    for (int i = 0; i < a.length; i++) viz.mark(i, "sorted");
  }
}
