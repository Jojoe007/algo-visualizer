import { Link } from 'react-router-dom';
import { BUILTINS } from '../algorithms/registry';
import type { Template } from '../core/tracer';

function Thumb({ template }: { template: Template | 'custom' }) {
  if (template === 'array')
    return (
      <svg viewBox="0 0 120 60" className="thumb" aria-hidden>
        {[20, 34, 12, 48, 28, 40, 16].map((h, i) => (
          <rect key={i} x={6 + i * 16} y={56 - h} width={12} height={h} rx={2} className={i < 3 ? 't-accent' : i === 3 ? 't-hot' : 't-base'} />
        ))}
      </svg>
    );
  if (template === 'grid')
    return (
      <svg viewBox="0 0 120 60" className="thumb" aria-hidden>
        {Array.from({ length: 40 }, (_, id) => {
          const r = Math.floor(id / 10), c = id % 10;
          const path = (r === 2 && c < 7) || (c === 6 && r < 3) || (r === 0 && c >= 6);
          const wall = c === 4 && r < 2;
          return <rect key={id} x={4 + c * 11.4} y={4 + r * 13} width={10} height={11} rx={2} className={wall ? 't-wall' : path ? 't-accent' : 't-base'} />;
        })}
      </svg>
    );
  if (template === 'graph')
    return (
      <svg viewBox="0 0 120 60" className="thumb" aria-hidden>
        <line x1={18} y1={30} x2={56} y2={12} className="t-line" />
        <line x1={18} y1={30} x2={56} y2={48} className="t-line" />
        <line x1={56} y1={12} x2={100} y2={30} className="t-hot-line" />
        <line x1={56} y1={48} x2={100} y2={30} className="t-line" />
        <line x1={56} y1={12} x2={56} y2={48} className="t-line" />
        {[[18, 30], [56, 12], [56, 48], [100, 30]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={7} className={i === 0 ? 't-accent' : 't-base'} />
        ))}
      </svg>
    );
  if (template === 'tree')
    return (
      <svg viewBox="0 0 120 60" className="thumb" aria-hidden>
        <line x1={50} y1={18} x2={22} y2={40} className="t-line" />
        <line x1={70} y1={18} x2={96} y2={40} className="t-line" />
        <line x1={60} y1={18} x2={60} y2={40} className="t-line" />
        <rect x={45} y={4} width={30} height={14} rx={3} className="t-accent" />
        {[8, 46, 82].map((x) => (
          <rect key={x} x={x} y={40} width={30} height={14} rx={3} className="t-base" />
        ))}
      </svg>
    );
  return (
    <svg viewBox="0 0 120 60" className="thumb" aria-hidden>
      <text x={60} y={40} textAnchor="middle" className="t-code">
        {'{ … }'}
      </text>
    </svg>
  );
}

export function Gallery() {
  return (
    <div className="gallery">
      <header className="hero">
        <h1>See algorithms think.</h1>
        <p className="muted">
          Step through built-in algorithms, or paste your own JavaScript and watch it run line by line. Every visualization is a recorded trace,
          so you can play, pause, rewind and scrub through it.
        </p>
      </header>
      <div className="cards">
        {BUILTINS.map((a) => (
          <Link key={a.id} to={`/algo/${a.id}`} className="card">
            <Thumb template={a.template} />
            <div className="card-body">
              <span className="tag">{a.category}</span>
              <h2>{a.title}</h2>
              <p className="muted small">{a.description}</p>
            </div>
          </Link>
        ))}
        <Link to="/playground" className="card custom">
          <Thumb template="custom" />
          <div className="card-body">
            <span className="tag">Your code</span>
            <h2>Create your own</h2>
            <p className="muted small">
              Write <code>run(input, viz)</code> in JavaScript. Array reads and writes are traced automatically, and <code>viz.*</code> helpers add the rest.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
