/**
 * Binary search tree.
 * - input.ops: [{ op: 'insert' | 'delete' | 'search', key }]
 * - viz.tree(root, { highlight: node | node[], note }) snapshots any tree whose nodes look like
 *   { value, left, right } or { keys: [...], children: [...] }.
 * - viz.section(title) starts a new section (the player can jump between them).
 *
 * @param {{ ops: { op: string, key: number }[] }} input
 * @param {Viz} viz
 */
function run(input, viz) {
  let root = null;

  for (const { op, key } of input.ops) {
    viz.section(`${op}(${key})`);
    if (op === 'insert') root = insert(root, key);
    else if (op === 'delete') root = remove(root, key);
    else search(root, key);
    viz.tree(root, { note: `Done ${op}(${key})` });
  }

  function insert(node, key) {
    if (!node) return { value: key, left: null, right: null };
    viz.tree(root, { highlight: node, note: `${key} vs ${node.value}` });
    if (key < node.value) node.left = insert(node.left, key);
    else if (key > node.value) node.right = insert(node.right, key);
    return node;
  }

  function remove(node, key) {
    if (!node) return null;
    viz.tree(root, { highlight: node, note: `${key} vs ${node.value}` });
    if (key < node.value) node.left = remove(node.left, key);
    else if (key > node.value) node.right = remove(node.right, key);
    else {
      if (!node.left) return node.right;
      if (!node.right) return node.left;
      let succ = node.right;
      while (succ.left) succ = succ.left;
      node.value = succ.value;
      node.right = remove(node.right, succ.value);
    }
    return node;
  }

  function search(node, key) {
    while (node) {
      viz.tree(root, { highlight: node, note: node.value === key ? `Found ${key}` : `${key} vs ${node.value}` });
      if (node.value === key) return true;
      node = key < node.value ? node.left : node.right;
    }
    viz.log(`${key} not found`);
    return false;
  }
}
