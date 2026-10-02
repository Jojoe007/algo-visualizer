// Quick Sort — Lomuto partition, pivot = last element.
// If the input is already sorted (or reversed), the pivot is always the max (or min),
// so every partition peels off just one element: depth n, O(n²) comparisons.
function run(a, viz) {
  quickSort(0, a.length - 1, 1);
  viz.mark([...Array(a.length).keys()], 'sorted');

  function quickSort(lo, hi, depth) {
    if (lo > hi) return;
    if (lo === hi) {
      viz.mark(lo, 'sorted');
      return;
    }
    viz.vars({ lo, hi, depth });
    const p = partition(lo, hi);
    viz.mark(p, 'sorted');
    quickSort(lo, p - 1, depth + 1);
    quickSort(p + 1, hi, depth + 1);
  }

  function partition(lo, hi) {
    viz.mark(hi, 'pivot');
    let i = lo;
    for (let j = lo; j < hi; j++) {
      if (viz.compare(j, hi) < 0) {
        // a[j] < pivot → move it into the "smaller" zone
        if (i !== j) viz.swap(i, j);
        i++;
      }
    }
    viz.unmark(hi);
    if (i !== hi) viz.swap(i, hi);
    return i;
  }
}
