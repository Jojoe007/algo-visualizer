import { useCallback, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { RunError } from '../core/trace';
import type { Template } from '../core/tracer';
import { ArrayView } from '../renderers/ArrayView';
import { GraphView } from '../renderers/GraphView';
import { GridView, type GridTool } from '../renderers/GridView';
import { TreeView } from '../renderers/TreeView';
import { runUserCode } from '../sandbox/runUserCode';
import { transitionMs, usePlayback } from '../store/playback';
import { CodePanel } from './CodePanel';
import { InputEditor } from './InputEditor';
import { Inspector } from './Inspector';
import { PlayerControls } from './PlayerControls';

export interface RunOpts {
  jumpToLastSection?: boolean;
  jumpToEnd?: boolean;
  autoplay?: boolean;
}

/** Runs code in the sandbox and loads the trace into the player. Stale runs are dropped. */
export function useRunner() {
  const load = usePlayback((s) => s.load);
  const [error, setError] = useState<RunError>();
  const [running, setRunning] = useState(false);
  const token = useRef(0);

  const run = useCallback(
    async (code: string, template: Template, input: unknown, opts: RunOpts = {}) => {
      const mine = ++token.current;
      setRunning(true);
      const res = await runUserCode(code, template, input);
      if (mine !== token.current) return;
      setRunning(false);
      setError(res.error);
      let index = 0;
      if (opts.jumpToEnd || res.error) index = res.steps.length - 1;
      else if (opts.jumpToLastSection) index = res.steps.findLastIndex((s) => s.kind === 'section');
      load(res.steps, { index: Math.max(0, index), autoplay: opts.autoplay && !res.error });
    },
    [load],
  );
  return { run, error, running };
}

interface Props {
  header: ReactNode;
  code: string;
  onCodeChange?: (code: string) => void;
  readOnly?: boolean;
  onRunShortcut?: () => void;
  template: Template;
  input: unknown;
  onInputChange: (input: unknown, opts?: RunOpts) => void;
  error?: RunError;
  running: boolean;
  /** Replaces the stage (canvas + controls) and hides the inspector, e.g. for case comparison. */
  stage?: ReactNode;
}

export function Workspace({ header, code, onCodeChange, readOnly, onRunShortcut, template, input, onInputChange, error, running, stage }: Props) {
  const player = usePlayback((s) => s.player);
  const index = usePlayback((s) => s.index);
  const speed = usePlayback((s) => s.speed);
  const playing = usePlayback((s) => s.playing);
  const state = useMemo(() => player.stateAt(index), [player, index]);
  const [gridTool, setGridTool] = useState<GridTool>('wall');

  let view: ReactNode = <div className="empty">{running ? 'Running…' : 'Press Run to visualize'}</div>;
  if (template === 'array' && state.array) view = <ArrayView state={state.array} />;
  if (template === 'grid' && state.grid)
    view = <GridView state={state.grid} tool={gridTool} onEdit={(spec) => onInputChange(spec, { jumpToEnd: true })} />;
  if (template === 'tree' && state.tree) view = <TreeView state={state.tree} />;
  if (template === 'graph' && state.graph)
    view = <GraphView state={state.graph} onEdit={(spec) => onInputChange(spec, { jumpToEnd: true })} />;

  const dur = { '--dur': `${playing ? transitionMs(speed) : 180}ms` } as CSSProperties;

  return (
    <div className={`workspace ${stage ? 'no-side' : ''}`}>
      <section className="pane code-pane">
        {header}
        <CodePanel value={code} onChange={onCodeChange} readOnly={readOnly} line={stage ? undefined : state.line} error={error} onRunShortcut={onRunShortcut} />
      </section>

      {stage ? (
        <section className="pane stage compare-stage">{stage}</section>
      ) : (
        <>

      <section className="pane stage">
        <div className={`caption ${error ? 'has-error' : ''}`} aria-live="polite">
          {error ? (
            <span className="error-text">
              <strong>{error.phase === 'syntax' ? 'Syntax error' : error.phase === 'runtime' ? 'Runtime error' : 'Stopped'}</strong>
              {error.line ? ` (line ${error.line})` : ''}: {error.message}
            </span>
          ) : (
            <span>{state.caption || ' '}</span>
          )}
          {running && <span className="spinner" aria-label="Running" />}
        </div>
        <div className="canvas" style={dur}>
          {view}
        </div>
        <PlayerControls />
        <InputEditor template={template} input={input} onChange={onInputChange} gridTool={gridTool} setGridTool={setGridTool} />
      </section>

      <aside className="pane side">
        <Inspector state={state} />
      </aside>
        </>
      )}
    </div>
  );
}
