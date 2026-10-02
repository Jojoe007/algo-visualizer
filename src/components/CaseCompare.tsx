// Best vs average vs worst: run all three inputs side by side on one shared clock ("race"),
// plus a growth chart of the headline metric across input sizes.

import { useEffect, useMemo, useState } from 'react';
import { CASE_NAMES, type AlgoDef, type CaseName } from '../algorithms/registry';
import { Player } from '../core/player';
import { computeMetrics, METRIC_LABELS, prefixCounts, type MetricKey } from '../core/metrics';
import type { VizState } from '../core/state';
import type { RunError } from '../core/trace';
import { ArrayView } from '../renderers/ArrayView';
import { GraphView } from '../renderers/GraphView';
import { GridView } from '../renderers/GridView';
import { runUserCode } from '../sandbox/runUserCode';
import { GrowthChart, type Growth } from './GrowthChart';

const CASE_LABEL: Record<CaseName, string> = { best: 'Best case', average: 'Average case', worst: 'Worst case' };
const RACE_SPEEDS = [10, 30, 100, 300];

interface Lane {
  player: Player;
  prefix: number[];
  metrics: Record<MetricKey, number>;
  error?: RunError;
}

function MiniView({ state }: { state: VizState }) {
  if (state.array) return <ArrayView state={state.array} />;
  if (state.grid) return <GridView state={state.grid} />;
  if (state.graph) return <GraphView state={state.graph} />;
  return null;
}

export function CaseCompare({ def }: { def: AlgoDef }) {
  const cs = def.caseStudy!;
  const sizeOptions = useMemo(() => [...new Set([...cs.sizes, cs.defaultSize])].sort((a, b) => a - b), [cs]);
  const [n, setN] = useState(cs.defaultSize);
  const [lanes, setLanes] = useState<Record<CaseName, Lane> | null>(null);
  const [growth, setGrowth] = useState<Growth | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);

  // Race inputs at the chosen n. Inputs are generated once per run so "average" stays stable while racing.
  useEffect(() => {
    let alive = true;
    setLanes(null);
    setPlaying(false);
    setT(0);
    Promise.all(
      CASE_NAMES.map(async (c) => {
        const res = await runUserCode(def.source, def.template, cs.cases[c].input(n));
        return [c, { player: new Player(res.steps), prefix: prefixCounts(res.steps, cs.metric), metrics: computeMetrics(res.steps), error: res.error }] as const;
      }),
    ).then((entries) => {
      if (!alive) return;
      setLanes(Object.fromEntries(entries) as Record<CaseName, Lane>);
      setPlaying(true);
    });
    return () => {
      alive = false;
    };
  }, [def, cs, n]);

  // Growth chart across sizes (computed once per algorithm).
  useEffect(() => {
    let alive = true;
    Promise.all(
      CASE_NAMES.map(async (c) => {
        const points = await Promise.all(
          cs.sizes.map(async (size) => {
            const res = await runUserCode(def.source, def.template, cs.cases[c].input(size));
            return { n: size, value: computeMetrics(res.steps)[cs.metric] };
          }),
        );
        return [c, points] as const;
      }),
    ).then((entries) => alive && setGrowth(Object.fromEntries(entries) as Growth));
    return () => {
      alive = false;
    };
  }, [def, cs]);

  const longest = lanes ? Math.max(...CASE_NAMES.map((c) => lanes[c].player.length)) : 0;

  // Shared race clock: every lane advances the same number of steps per tick.
  useEffect(() => {
    if (!playing || !lanes) return;
    const fps = 30;
    let acc = 0;
    const id = setInterval(() => {
      acc += speed / fps;
      const inc = Math.floor(acc);
      if (inc === 0) return;
      acc -= inc;
      setT((v) => {
        const next = Math.min(v + inc, longest - 1);
        if (next >= longest - 1) setPlaying(false);
        return next;
      });
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [playing, speed, lanes, longest]);

  const finishOrder = lanes ? [...CASE_NAMES].sort((a, b) => lanes[a].player.length - lanes[b].player.length) : [];
  const metricLabel = METRIC_LABELS[cs.metric];
  const shownMetrics = lanes
    ? (Object.keys(METRIC_LABELS) as MetricKey[]).filter((k) => CASE_NAMES.some((c) => lanes[c].metrics[k] > 0))
    : [];

  return (
    <div className="compare">
      <div className="compare-bar">
        <label className="field">
          <span>n</span>
          <select value={n} onChange={(e) => setN(Number(e.target.value))} aria-label={cs.sizeLabel}>
            {sizeOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={() => (t >= longest - 1 ? (setT(0), setPlaying(true)) : setPlaying(!playing))} disabled={!lanes}>
          {playing ? '⏸ Pause' : t >= longest - 1 && longest > 0 ? '↺ Replay race' : '▶ Race'}
        </button>
        <input
          className="scrubber"
          type="range"
          min={0}
          max={Math.max(0, longest - 1)}
          value={t}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
          aria-label="Race step"
          disabled={!lanes}
        />
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Race speed">
          {RACE_SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s} steps/s
            </option>
          ))}
        </select>
      </div>

      <div className="lanes">
        {CASE_NAMES.map((c) => {
          const lane = lanes?.[c];
          const len = lane?.player.length ?? 0;
          const i = Math.min(t, Math.max(0, len - 1));
          const done = lane && t >= len - 1;
          const state = lane?.player.stateAt(i);
          return (
            <section key={c} className={`lane case-${c}`}>
              <header>
                <span className="swatch" aria-hidden />
                <strong>{CASE_LABEL[c]}</strong>
                <span className="complexity">{cs.complexity[c]}</span>
              </header>
              <div className="lane-input">{cs.cases[c].label}</div>
              <div className="lane-canvas">{state ? <MiniView state={state} /> : <span className="spinner" aria-label="Running" />}</div>
              <div className="lane-progress" aria-hidden>
                <div style={{ width: len ? `${((i + 1) / longest) * 100}%` : 0 }} />
                {len > 0 && <span className="lane-end" style={{ left: `${(len / longest) * 100}%` }} />}
              </div>
              <div className="lane-stats">
                <span>
                  {metricLabel} <b>{lane ? lane.prefix[i].toLocaleString() : '–'}</b>
                </span>
                <span className={done ? 'done' : 'muted'}>
                  {done ? `✓ done · ${['1st', '2nd', '3rd'][finishOrder.indexOf(c)]}` : `step ${i + 1} / ${len}`}
                </span>
              </div>
              {lane?.error && <p className="error-text small">{lane.error.message}</p>}
              <p className="why small muted">{cs.cases[c].why}</p>
            </section>
          );
        })}
      </div>

      <div className="compare-bottom">
        {growth ? (
          <GrowthChart growth={growth} metricLabel={metricLabel} sizeLabel={cs.sizeLabel} currentN={n} />
        ) : (
          <div className="growth muted">
            <span className="spinner" /> Simulating {cs.sizes.length * 3} runs…
          </div>
        )}
        {lanes && (
          <table className="data-table summary">
            <caption>Totals at n = {n}</caption>
            <thead>
              <tr>
                <th />
                {CASE_NAMES.map((c) => (
                  <th key={c} className={`case-${c}`}>
                    <span className="swatch" aria-hidden /> {CASE_LABEL[c].split(' ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Complexity</th>
                {CASE_NAMES.map((c) => (
                  <td key={c}>{cs.complexity[c]}</td>
                ))}
              </tr>
              {shownMetrics.map((k) => (
                <tr key={k} className={k === cs.metric ? 'headline' : ''}>
                  <th>{METRIC_LABELS[k]}</th>
                  {CASE_NAMES.map((c) => (
                    <td key={c}>{lanes[c].metrics[k].toLocaleString()}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
