/**
 * Selection sort — find the minimum of the unsorted part and move it to the front.
 *
 * @param {number[]} a
 * @param {Viz} viz
 */
function run(a, viz) {
  for (let i = 0; i < a.length - 1; i++) {
    let min = i;
    viz.mark(min, 'pivot');
    for (let j = i + 1; j < a.length; j++) {
      viz.vars({ i, j, min });
      if (a[j] < a[min]) {
        viz.unmark(min);
        min = j;
        viz.mark(min, 'pivot');
      }
    }
    viz.swap(i, min);
    viz.unmark(min);
    viz.mark(i, 'sorted');
  }
  viz.mark(a.length - 1, 'sorted');
}
