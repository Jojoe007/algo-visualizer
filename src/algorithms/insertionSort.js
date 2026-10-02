// Insertion Sort — grow a sorted prefix, sinking each new element into place.
// `a` is a traced array: reads/writes are recorded automatically.
function run(a, viz) {
  viz.mark(0, 'sorted');
  for (let i = 1; i < a.length; i++) {
    let j = i;
    viz.vars({ i, j });
    while (j > 0 && a[j - 1] > a[j]) {
      viz.swap(j - 1, j);
      j--;
      viz.vars({ i, j });
    }
    viz.mark([...Array(i + 1).keys()], 'sorted');
  }
  viz.log('Sorted!');
}
