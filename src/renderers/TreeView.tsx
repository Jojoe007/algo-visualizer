import type { TreeState } from '../core/state';
import type { TreeNodeDTO } from '../core/trace';

const KEY_W = 34, NODE_H = 30, LEVEL_GAP = 64, SIB_GAP = 14, NULL_W = 18, PAD = 16;

interface Placed {
  node: TreeNodeDTO;
  x: number; // left edge
  y: number;
  w: number;
}

const nodeWidth = (n: TreeNodeDTO) => Math.max(1, n.keys.length) * KEY_W;

function layout(root: TreeNodeDTO) {
  const widths = new Map<TreeNodeDTO, number>();
  const measure = (n: TreeNodeDTO | null): number => {
    if (!n) return NULL_W;
    const kids = n.children.length ? n.children.map(measure).reduce((a, b) => a + b, 0) + SIB_GAP * (n.children.length - 1) : 0;
    const w = Math.max(nodeWidth(n), kids);
    widths.set(n, w);
    return w;
  };
  measure(root);

  const placed: Placed[] = [];
  const edges: { x1: number; y1: number; x2: number; y2: number; from: number; to: number }[] = [];
  let depth = 0;
  const place = (n: TreeNodeDTO, left: number, level: number): Placed => {
    depth = Math.max(depth, level);
    const total = widths.get(n)!;
    const w = nodeWidth(n);
    const p: Placed = { node: n, x: left + (total - w) / 2, y: level * (NODE_H + LEVEL_GAP), w };
    placed.push(p);
    const kidsW = n.children.reduce((s, c) => s + (c ? widths.get(c)! : NULL_W), 0) + SIB_GAP * Math.max(0, n.children.length - 1);
    let cursor = left + (total - kidsW) / 2;
    n.children.forEach((c, i) => {
      if (c) {
        const cp = place(c, cursor, level + 1);
        // Pointer i sits between key i-1 and key i (B+ style); for binary nodes that's the left/right edge.
        const px = n.children.length === 1 ? p.x + w / 2 : p.x + (w * i) / (n.children.length - 1);
        edges.push({ x1: px, y1: p.y + NODE_H, x2: cp.x + cp.w / 2, y2: cp.y, from: n.id, to: c.id });
      }
      cursor += (c ? widths.get(c)! : NULL_W) + SIB_GAP;
    });
    return p;
  };
  place(root, 0, 0);
  return { placed, edges, width: widths.get(root)!, height: depth * (NODE_H + LEVEL_GAP) + NODE_H };
}

export function TreeView({ state }: { state: TreeState }) {
  if (!state.root) return <div className="empty">Empty tree — add some keys below</div>;
  const { placed, edges, width, height } = layout(state.root);
  const hl = new Set(state.highlight);
  const byId = new Map(placed.map((p) => [p.node.id, p]));

  return (
    <svg
      className="tree-view"
      viewBox={`${-PAD} ${-PAD} ${width + PAD * 2} ${height + PAD * 2}`}
      style={{ maxWidth: Math.max(320, (width + PAD * 2) * 1.3) }}
      role="img"
      aria-label="Tree"
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="arrow-head" />
        </marker>
      </defs>
      {edges.map((e) => (
        <line key={`${e.from}-${e.to}`} className={`edge ${hl.has(e.to) && hl.has(e.from) ? 'hl' : ''}`} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
      ))}
      {placed.map((p) => {
        const next = p.node.next !== undefined ? byId.get(p.node.next) : undefined;
        if (!next) return null;
        return (
          <line key={`n${p.node.id}`} className="leaf-link" x1={p.x + p.w} y1={p.y + NODE_H / 2} x2={next.x - 2} y2={next.y + NODE_H / 2} markerEnd="url(#arrow)" />
        );
      })}
      {placed.map((p) => (
        <g key={p.node.id} className={`tnode ${hl.has(p.node.id) ? 'hl' : ''}`} transform={`translate(${p.x}, ${p.y})`}>
          <rect width={p.w} height={NODE_H} rx={6} />
          {p.node.keys.map((k, i) => (
            <g key={i}>
              {i > 0 && <line className="key-sep" x1={i * KEY_W} y1={0} x2={i * KEY_W} y2={NODE_H} />}
              <text x={i * KEY_W + KEY_W / 2} y={NODE_H / 2 + 5} textAnchor="middle">
                {k}
              </text>
            </g>
          ))}
          {p.node.keys.length === 0 && (
            <text x={KEY_W / 2} y={NODE_H / 2 + 5} textAnchor="middle" className="muted">
              ∅
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
