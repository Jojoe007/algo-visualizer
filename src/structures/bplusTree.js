// B+ Tree — all keys live in leaves; internal nodes hold separators; leaves are linked.
// input = { order, ops: [{ op: 'insert' | 'delete' | 'search', key }] }
function run(input, viz) {
  const tree = new BPlusTree(input.order ?? 4, viz);
  for (const { op, key } of input.ops) {
    viz.section(`${op}(${key})`);
    if (op === 'insert') tree.insert(key);
    else if (op === 'delete') tree.remove(key);
    else tree.search(key);
  }
  return tree.root;
}

class Node {
  constructor(leaf) {
    this.leaf = leaf;
    this.keys = [];
    this.children = [];
    this.next = null;
  }
}

class BPlusTree {
  constructor(order, viz) {
    this.order = Math.max(3, order); // max children per node
    this.maxKeys = this.order - 1;
    this.minKeys = Math.ceil(this.order / 2) - 1;
    this.root = new Node(true);
    this.viz = viz;
  }

  // Walks root → leaf, recording the internal nodes on the way down.
  findLeaf(key, path) {
    let node = this.root;
    while (!node.leaf) {
      let i = 0;
      while (i < node.keys.length && key >= node.keys[i]) i++;
      this.viz.tree(this.root, { highlight: node, note: `Descend: ${key} goes to child ${i}` });
      path.push(node);
      node = node.children[i];
    }
    return node;
  }

  search(key) {
    const leaf = this.findLeaf(key, []);
    const found = leaf.keys.includes(key);
    this.viz.tree(this.root, { highlight: leaf, note: found ? `Found ${key}` : `${key} not found` });
    return found;
  }

  insert(key) {
    const path = [];
    const leaf = this.findLeaf(key, path);
    let i = 0;
    while (i < leaf.keys.length && leaf.keys[i] < key) i++;
    if (leaf.keys[i] === key) {
      this.viz.tree(this.root, { highlight: leaf, note: `${key} already exists` });
      return;
    }
    leaf.keys.splice(i, 0, key);
    this.viz.tree(this.root, { highlight: leaf, note: `Insert ${key} into leaf` });

    let node = leaf;
    while (node.keys.length > this.maxKeys) {
      const { sep, right } = this.split(node);
      const parent = path.pop();
      if (!parent) {
        const root = new Node(false);
        root.keys = [sep];
        root.children = [node, right];
        this.root = root;
        this.viz.tree(this.root, { highlight: [root, node, right], note: `Split overflowing node; ${sep} becomes the new root` });
        break;
      }
      const ci = parent.children.indexOf(node);
      parent.keys.splice(ci, 0, sep);
      parent.children.splice(ci + 1, 0, right);
      this.viz.tree(this.root, { highlight: [node, right, parent], note: `Split overflowing node; push ${sep} up` });
      node = parent;
    }
  }

  split(node) {
    const right = new Node(node.leaf);
    if (node.leaf) {
      const mid = Math.ceil(node.keys.length / 2);
      right.keys = node.keys.splice(mid);
      right.next = node.next;
      node.next = right;
      return { sep: right.keys[0], right };
    }
    const mid = Math.floor(node.keys.length / 2);
    const sep = node.keys[mid];
    right.keys = node.keys.splice(mid + 1);
    node.keys.pop();
    right.children = node.children.splice(mid + 1);
    return { sep, right };
  }

  remove(key) {
    const path = [];
    const leaf = this.findLeaf(key, path);
    const i = leaf.keys.indexOf(key);
    if (i < 0) {
      this.viz.tree(this.root, { highlight: leaf, note: `${key} not found` });
      return;
    }
    leaf.keys.splice(i, 1);
    this.viz.tree(this.root, { highlight: leaf, note: `Remove ${key} from leaf` });

    let node = leaf;
    while (node !== this.root && node.keys.length < this.minKeys) {
      const parent = path.pop();
      const ci = parent.children.indexOf(node);
      const left = parent.children[ci - 1];
      const right = parent.children[ci + 1];

      if (left && left.keys.length > this.minKeys) {
        if (node.leaf) {
          node.keys.unshift(left.keys.pop());
          parent.keys[ci - 1] = node.keys[0];
        } else {
          node.keys.unshift(parent.keys[ci - 1]);
          parent.keys[ci - 1] = left.keys.pop();
          node.children.unshift(left.children.pop());
        }
        this.viz.tree(this.root, { highlight: [left, node, parent], note: 'Underflow: borrow from left sibling' });
        break;
      }
      if (right && right.keys.length > this.minKeys) {
        if (node.leaf) {
          node.keys.push(right.keys.shift());
          parent.keys[ci] = right.keys[0];
        } else {
          node.keys.push(parent.keys[ci]);
          parent.keys[ci] = right.keys.shift();
          node.children.push(right.children.shift());
        }
        this.viz.tree(this.root, { highlight: [node, right, parent], note: 'Underflow: borrow from right sibling' });
        break;
      }
      const at = left ? ci - 1 : ci;
      const a = parent.children[at];
      this.merge(parent, at);
      this.viz.tree(this.root, { highlight: [a, parent], note: 'Underflow: merge with sibling' });
      node = parent;
    }

    if (!this.root.leaf && this.root.keys.length === 0) {
      this.root = this.root.children[0];
      this.viz.tree(this.root, { highlight: this.root, note: 'Root is empty; tree shrinks by one level' });
    }
  }

  // Merges children[at + 1] into children[at].
  merge(parent, at) {
    const a = parent.children[at];
    const b = parent.children[at + 1];
    if (a.leaf) {
      a.keys.push(...b.keys);
      a.next = b.next;
    } else {
      a.keys.push(parent.keys[at], ...b.keys);
      a.children.push(...b.children);
    }
    parent.keys.splice(at, 1);
    parent.children.splice(at + 1, 1);
  }
}
