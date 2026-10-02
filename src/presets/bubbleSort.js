/**
 * Write your algorithm in run(input, viz).
 * - `a` is your input array. Reads (a[i]) and writes (a[i] = x) are traced automatically,
 *   and swapping with [a[i], a[j]] = [a[j], a[i]] animates as a swap.
 * - Helpers: viz.swap(i, j), viz.mark(indices, 'sorted'), viz.vars({...}), viz.log(...)
 *
 * @param {number[]} a
 * @param {Viz} viz
 */
function run(a, viz) {
  for (let end = a.length - 1; end > 0; end--) {
    let swapped = false;
    for (let i = 0; i < end; i++) {
      viz.vars({ i, end, swapped });
      if (a[i] > a[i + 1]) {
        [a[i], a[i + 1]] = [a[i + 1], a[i]];
        swapped = true;
      }
    }
    viz.mark(end, 'sorted');
    if (!swapped) break;
  }
  viz.mark([...Array(a.length).keys()], 'sorted');
}
