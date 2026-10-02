import { edgeKey, type GraphState } from '../core/state';
import type { GraphSpec } from '../core/trace';

const R = 24;
const EDGE_STATES = ['default', 'active', 'tree', 'cycle'] as const;

interface Props {
  state: GraphState;
  onEdit?: (spec: GraphSpec) => void;
}

export function GraphView({ state, onEdit }: Props) {
  const { spec } = state;
  const pos = new Map(spec.nodes.map((n) => [n.id, n]));
  const has = new Set(spec.edges.map((e) => edgeKey(e.from, e.to)));

  const editWeight = (i: number) => {
    if (!onEdit) return;
    const e = spec.edges[i];
    const raw = prompt(`Weight of ${e.from} → ${e.to}`, String(e.w));
    if (raw === null || raw.trim() === '' || !Number.isFinite(Number(raw))) return;
    onEdit({ ...spec, edges: spec.edges.map((x, j) => (j === i ? { ...x, w: Number(raw) } : x)) });
  };

  return (
    <svg className="graph-view" viewBox="0 0 800 440" role="img" aria-label="Weighted directed graph">
      <defs>
        {EDGE_STATES.map((s) => (
          <marker key={s} id={`ah-${s}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className={`ah ah-${s}`} />
          </marker>
        ))}
      </defs>

      {spec.edges.map((e, i) => {
        const a = pos.get(e.from), b = pos.get(e.to);
        if (!a || !b) return null;
        const key = edgeKey(e.from, e.to);
        const persistent = state.edges[key];
        const active = state.activeEdge === key;
        const cls = active && !persistent ? 'active' : persistent ?? 'default';
        // Unit vector and perpendicular; curve when the reverse edge also exists.
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len, px = -uy, py = ux;
        const bend = has.has(edgeKey(e.to, e.from)) ? 28 : 0;
        const sx = a.x + ux * R + px * bend * 0.35, sy = a.y + uy * R + py * bend * 0.35;
        const tx = b.x - ux * (R + 3) + px * bend * 0.35, ty = b.y - uy * (R + 3) + py * bend * 0.35;
        const cx = (a.x + b.x) / 2 + px * bend, cy = (a.y + b.y) / 2 + py * bend;
        // Label at t = 0.4 along the curve (not the midpoint) so crossing edges don't stack their labels.
        const t = 0.4, k0 = (1 - t) ** 2, k1 = 2 * t * (1 - t), k2 = t * t;
        const lx = k0 * sx + k1 * cx + k2 * tx + px * 12, ly = k0 * sy + k1 * cy + k2 * ty + py * 12;
        return (
          <g key={key} className={`gedge e-${cls} ${active ? 'is-active' : ''}`}>
            <path d={`M${sx},${sy} Q${cx},${cy} ${tx},${ty}`} markerEnd={`url(#ah-${EDGE_STATES.includes(cls as never) ? cls : 'default'})`} />
            <g className={`wlabel ${onEdit ? 'editable' : ''}`} onClick={() => editWeight(i)}>
              <rect x={lx - 14} y={ly - 10} width={28} height={20} rx={10} />
              <text x={lx} y={ly + 4} textAnchor="middle">
                {e.w}
              </text>
              {onEdit && <title>Click to change weight</title>}
            </g>
          </g>
        );
      })}

      {spec.nodes.map((n) => {
        const ns = state.nodes[n.id];
        const d = ns?.info?.d;
        return (
          <g key={n.id} className={`gnode n-${ns?.state ?? 'none'} ${state.activeNode === n.id ? 'is-active' : ''}`} transform={`translate(${n.x}, ${n.y})`}>
            <circle r={R} />
            <text className="nlabel" y={5} textAnchor="middle">
              {n.id}
            </text>
            <text className="ndist" y={R + 18} textAnchor="middle">
              {d === undefined ? (n.id === spec.source ? 'd = 0' : 'd = ∞') : `d = ${d === 'Infinity' ? '∞' : d}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
