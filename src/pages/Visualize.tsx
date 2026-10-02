import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { CASE_NAMES, findBuiltin, type AlgoDef, type CaseName } from '../algorithms/registry';
import { CaseCompare } from '../components/CaseCompare';
import { useRunner, Workspace, type RunOpts } from '../components/Workspace';

const CASE_SHORT: Record<CaseName, string> = { best: 'Best', average: 'Average', worst: 'Worst' };

export function Visualize() {
  const { id = '' } = useParams();
  const def = findBuiltin(id);
  if (!def) return <Navigate to="/" replace />;
  return <BuiltinWorkspace key={def.id} def={def} />;
}

function BuiltinWorkspace({ def }: { def: AlgoDef }) {
  const navigate = useNavigate();
  const [input, setInput] = useState(def.defaultInput);
  const [mode, setMode] = useState<'step' | 'compare'>('step');
  const [activeCase, setActiveCase] = useState<CaseName | null>(null);
  const opts = useRef<RunOpts>({});
  const { run, error, running } = useRunner();
  const cs = def.caseStudy;

  useEffect(() => {
    run(def.source, def.template, input, opts.current);
  }, [def, input, run]);

  const onInputChange = (next: unknown, o: RunOpts = {}) => {
    opts.current = o.jumpToLastSection ? { ...o, autoplay: true } : o;
    setActiveCase(null);
    setInput(next);
  };

  const loadCase = (c: CaseName) => {
    opts.current = {};
    setActiveCase(c);
    setInput(cs!.cases[c].input(cs!.defaultSize));
  };

  const header = (
    <div className="pane-header column">
      <div className="pane-header-row">
        <div>
          <div className="crumbs">
            <Link to="/">Gallery</Link> / {def.category}
          </div>
          <h1>{def.title}</h1>
        </div>
        <button onClick={() => navigate('/playground', { state: { template: def.template, code: def.source, name: `${def.title} (copy)`, input } })}>
          Edit in Playground
        </button>
      </div>
      <p className="muted small">{def.description}</p>
      {cs && (
        <div className="case-controls">
          <div className="segmented" role="tablist" aria-label="View">
            <button role="tab" aria-selected={mode === 'step'} className={mode === 'step' ? 'on' : ''} onClick={() => setMode('step')}>
              Step through
            </button>
            <button role="tab" aria-selected={mode === 'compare'} className={mode === 'compare' ? 'on' : ''} onClick={() => setMode('compare')}>
              Compare cases
            </button>
          </div>
          {mode === 'step' && (
            <div className="case-picker" role="group" aria-label="Load an input case">
              <span className="muted small">Input:</span>
              {CASE_NAMES.map((c) => (
                <button key={c} className={`case-btn case-${c} ${activeCase === c ? 'on' : ''}`} onClick={() => loadCase(c)} title={cs.cases[c].label}>
                  <span className="swatch" aria-hidden /> {CASE_SHORT[c]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {cs && mode === 'step' && activeCase && (
        <p className={`case-note case-${activeCase}`}>
          <strong>
            {CASE_SHORT[activeCase]} case · {cs.complexity[activeCase]}
          </strong>{' '}
          {cs.cases[activeCase].label}: {cs.cases[activeCase].why}
        </p>
      )}
    </div>
  );

  return (
    <Workspace
      header={header}
      code={def.source}
      readOnly
      template={def.template}
      input={input}
      onInputChange={onInputChange}
      error={error}
      running={running}
      stage={mode === 'compare' && cs ? <CaseCompare def={def} /> : undefined}
    />
  );
}
