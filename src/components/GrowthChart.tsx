import { useState } from 'react';
import { CASE_NAMES, type CaseName } from '../algorithms/registry';

export type Growth = Record<CaseName, { n: number; value: number }[]>;

const CASE_LABEL: Record<CaseName, string> = { best: 'Best', average: 'Average', worst: 'Worst' };
const W = 640, H = 270, M = { l: 52, r: 96, t: 14, b: 40 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v)!;
}
const fmt = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v.toLocaleString());

interface Props {
  growth: Growth;
  metricLabel: string;
  sizeLabel: string;
  currentN: number;
}

export function GrowthChart({ growth, metricLabel, sizeLabel, currentN }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const sizes = growth.best.map((p) => p.n);
  const yMax = niceMax(Math.max(1, ...CASE_NAMES.flatMap((c) => growth[c].map((p) => p.value))));
  const x0 = sizes[0], x1 = sizes[sizes.length - 1];
  const x = (n: number) => M.l + ((n - x0) / Math.max(1, x1 - x0)) * (W - M.l - M.r);
  const y = (v: number) => H - M.b - (v / yMax) * (H - M.t - M.b);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

  // Direct labels at the line ends, nudged apart so they never collide.
  const ends = CASE_NAMES.map((c) => ({ c, v: growth[c][growth[c].length - 1].value, y: y(growth[c][growth[c].length - 1].value) })).sort(
    (a, b) => a.y - b.y,
  );
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = M.l + ((e.clientX - box.left) / box.width) * (W - M.l - M.r);
    let best = 0;
    sizes.forEach((n, i) => {
      if (Math.abs(x(n) - px) < Math.abs(x(sizes[best]) - px)) best = i;
    });
    setHover(best);
  };

  const hx = hover !== null ? x(sizes[hover]) : 0;
  const tipLeft = hover !== null && hx > W / 2;

  return (
    <figure className="growth">
      <figcaption>
        <strong>{metricLabel}</strong> as n grows
        <span className="legend">
          {CASE_NAMES.map((c) => (
            <span key={c} className={`legend-item case-${c}`}>
              <i /> {CASE_LABEL[c]}
            </span>
          ))}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="growth-svg" role="img" aria-label={`${metricLabel} versus ${sizeLabel} for best, average and worst case`}>
        {yTicks.map((v) => (
          <g key={v}>
            <line className="gc-grid" x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} />
            <text className="gc-tick" x={M.l - 8} y={y(v) + 4} textAnchor="end">
              {fmt(v)}
            </text>
          </g>
        ))}
        {sizes.map((n) => (
          <text key={n} className="gc-tick" x={x(n)} y={H - M.b + 18} textAnchor="middle">
            {n}
          </text>
        ))}
        <text className="gc-axis" x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle">
          {sizeLabel}
        </text>
        {sizes.includes(currentN) && <line className="gc-current" x1={x(currentN)} x2={x(currentN)} y1={M.t} y2={H - M.b} />}

        {CASE_NAMES.map((c) => (
          <g key={c} className={`gc-series case-${c}`}>
            <polyline points={growth[c].map((p) => `${x(p.n)},${y(p.value)}`).join(' ')} />
            {growth[c].map((p, i) => (
              <circle key={p.n} cx={x(p.n)} cy={y(p.value)} r={hover === i ? 5 : 4} />
            ))}
          </g>
        ))}
        {ends.map((e) => (
          <g key={e.c} className={`gc-endlabel case-${e.c}`}>
            <circle cx={W - M.r + 10} cy={e.y - 4} r={4} />
            <text x={W - M.r + 18} y={e.y}>
              {CASE_LABEL[e.c]} {fmt(e.v)}
            </text>
          </g>
        ))}

        {hover !== null && (
          <g className="gc-hover" pointerEvents="none">
            <line x1={hx} x2={hx} y1={M.t} y2={H - M.b} />
            <g transform={`translate(${tipLeft ? hx - 142 : hx + 10}, ${M.t + 4})`}>
              <rect width={132} height={80} rx={6} />
              <text x={10} y={18} className="tip-title">
                n = {sizes[hover]}
              </text>
              {CASE_NAMES.map((c, i) => (
                <g key={c} className={`case-${c}`} transform={`translate(10, ${36 + i * 16})`}>
                  <circle cx={4} cy={-4} r={4} />
                  <text x={14} y={0}>
                    {CASE_LABEL[c]}
                  </text>
                  <text x={112} y={0} textAnchor="end" className="tip-value">
                    {growth[c][hover].value.toLocaleString()}
                  </text>
                </g>
              ))}
            </g>
          </g>
        )}
        <rect className="gc-hit" x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      <button className="ghost small" onClick={() => setShowTable(!showTable)} aria-expanded={showTable}>
        {showTable ? 'Hide table' : 'Show as table'}
      </button>
      {showTable && (
        <table className="data-table">
          <thead>
            <tr>
              <th>n</th>
              {CASE_NAMES.map((c) => (
                <th key={c}>{CASE_LABEL[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sizes.map((n, i) => (
              <tr key={n}>
                <td>{n}</td>
                {CASE_NAMES.map((c) => (
                  <td key={c}>{growth[c][i].value.toLocaleString()}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
