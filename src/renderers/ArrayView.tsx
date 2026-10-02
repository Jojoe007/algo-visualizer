import type { ArrayState } from '../core/state';

const MARK_CLASS: Record<string, string> = { sorted: 'm-sorted', done: 'm-sorted', pivot: 'm-pivot', min: 'm-pivot', active: 'm-active' };

export function ArrayView({ state }: { state: ArrayState }) {
  const n = state.values.length;
  if (n === 0) return <div className="empty">Empty array</div>;

  const nums = state.values.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null));
  const maxAbs = Math.max(1, ...nums.map((v) => Math.abs(v ?? 0)));
  const unit = 40, gap = 6, H = 220, top = 22, bottom = 22;
  const W = n * unit;
  const active = new Set(state.active);

  return (
    <svg className="array-view" viewBox={`0 0 ${W} ${H + top + bottom}`} preserveAspectRatio="xMidYMax meet" role="img" aria-label="Array bars">
      {state.values.map((v, i) => {
        const id = state.ids[i];
        const num = nums[i];
        const h = num === null ? H * 0.3 : Math.max(4, (Math.abs(num) / maxAbs) * H);
        const cls = ['bar', active.has(i) && state.activity ? `a-${state.activity}` : '', state.marks[i] ? MARK_CLASS[state.marks[i]!] ?? 'm-other' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <g key={id} className={cls} style={{ transform: `translateX(${i * unit}px)` }}>
            <rect x={gap / 2} y={top + H - h} width={unit - gap} height={h} rx={4} />
            <text className="bar-value" x={unit / 2} y={top + H - h - 6} textAnchor="middle">
              {String(v)}
            </text>
          </g>
        );
      })}
      {state.values.map((_, i) => (
        <text key={`i${i}`} className="bar-index" x={i * unit + unit / 2} y={top + H + 16} textAnchor="middle">
          {i}
        </text>
      ))}
    </svg>
  );
}
