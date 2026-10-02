import { useEffect, useState } from 'react';
import { defaultGraph, defaultGrid, negativeCycleGraph, randomArray, randomGraph, randomGrid } from '../core/inputs';
import type { GraphSpec, GridSpec, TreeInput, TreeOp } from '../core/trace';
import type { Template } from '../core/tracer';
import type { GridTool } from '../renderers/GridView';

interface Props {
  template: Template;
  input: unknown;
  onChange: (input: unknown, opts?: { jumpToLastSection?: boolean }) => void;
  gridTool: GridTool;
  setGridTool: (t: GridTool) => void;
}

export function InputEditor(props: Props) {
  if (props.template === 'array') return <ArrayInput {...props} />;
  if (props.template === 'grid') return <GridInput {...props} />;
  if (props.template === 'graph') return <GraphInput {...props} />;
  return <TreeInputEditor {...props} />;
}

function ArrayInput({ input, onChange }: Props) {
  const values = input as number[];
  const [text, setText] = useState(values.join(', '));
  useEffect(() => setText(values.join(', ')), [values]);

  const commit = () => {
    const parsed = text.split(/[\s,]+/).filter(Boolean).map(Number);
    if (parsed.length && parsed.every(Number.isFinite)) onChange(parsed.slice(0, 200));
    else setText(values.join(', '));
  };
  return (
    <div className="input-editor">
      <label className="field grow">
        <span>Array</span>
        <input value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      </label>
      <button onClick={() => onChange(randomArray(values.length || 14))}>Shuffle</button>
      <button onClick={() => onChange([...values].sort((a, b) => b - a))} title="Worst case for insertion sort">
        Reversed
      </button>
      <label className="field">
        <span>Size</span>
        <input type="number" min={2} max={60} value={values.length} onChange={(e) => onChange(randomArray(Math.max(2, Math.min(60, +e.target.value || 2))))} />
      </label>
    </div>
  );
}

function GridInput({ input, onChange, gridTool, setGridTool }: Props) {
  const spec = input as GridSpec;
  const tools: [GridTool, string][] = [['wall', '▦ Wall'], ['start', 'S Start'], ['end', 'G Goal']];
  return (
    <div className="input-editor">
      <div className="segmented" role="radiogroup" aria-label="Edit tool">
        {tools.map(([t, label]) => (
          <button key={t} role="radio" aria-checked={gridTool === t} className={gridTool === t ? 'on' : ''} onClick={() => setGridTool(t)}>
            {label}
          </button>
        ))}
      </div>
      <span className="muted small">Click or drag on the grid to edit</span>
      <span className="spacer" />
      <button onClick={() => onChange(randomGrid(spec))}>Random walls</button>
      <button onClick={() => onChange({ ...spec, walls: [] })}>Clear walls</button>
      <button onClick={() => onChange(defaultGrid())}>Reset</button>
    </div>
  );
}

function GraphInput({ input, onChange }: Props) {
  const spec = input as GraphSpec;
  return (
    <div className="input-editor">
      <label className="field">
        <span>Source</span>
        <select value={spec.source} onChange={(e) => onChange({ ...spec, source: e.target.value })}>
          {spec.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.id}
            </option>
          ))}
        </select>
      </label>
      <span className="muted small">Click a weight to edit it</span>
      <span className="spacer" />
      <button onClick={() => onChange(defaultGraph())}>Example</button>
      <button onClick={() => onChange(negativeCycleGraph())} title="Adds E → D, creating a negative cycle">
        Negative cycle
      </button>
      <button onClick={() => onChange(randomGraph())}>Random</button>
    </div>
  );
}

function TreeInputEditor({ input, onChange }: Props) {
  const t = input as TreeInput;
  const [op, setOp] = useState<TreeOp['op']>('insert');
  const [key, setKey] = useState('');

  const apply = (ops: TreeOp[], jump = true) => onChange({ ...t, ops }, { jumpToLastSection: jump });
  const submit = () => {
    const k = Number(key);
    if (key.trim() === '' || !Number.isFinite(k)) return;
    apply([...t.ops, { op, key: k }]);
    setKey('');
  };
  const randomKeys = () => {
    const keys = Array.from({ length: 10 }, () => Math.floor(Math.random() * 100));
    onChange({ ...t, ops: keys.map((k) => ({ op: 'insert' as const, key: k })) }, { jumpToLastSection: false });
  };

  return (
    <div className="input-editor">
      <select value={op} onChange={(e) => setOp(e.target.value as TreeOp['op'])} aria-label="Operation">
        <option value="insert">Insert</option>
        <option value="delete">Delete</option>
        <option value="search">Search</option>
      </select>
      <input
        className="key-input"
        type="number"
        placeholder="key"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        aria-label="Key"
      />
      <button className="primary" onClick={submit}>
        Go
      </button>
      <button onClick={() => apply(t.ops.slice(0, -1), false)} disabled={t.ops.length === 0}>
        Undo
      </button>
      <button onClick={randomKeys}>Random 10</button>
      <button onClick={() => onChange({ ...t, ops: [] })}>Clear</button>
      {t.order !== undefined && (
        <label className="field">
          <span>Order</span>
          <select value={t.order} onChange={(e) => onChange({ ...t, order: Number(e.target.value) }, { jumpToLastSection: false })}>
            {[3, 4, 5, 6, 7].map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      )}
      <span className="muted small ops-count">{t.ops.length} ops</span>
    </div>
  );
}
