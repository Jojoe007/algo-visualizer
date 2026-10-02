import { useEffect, useRef } from 'react';
import type { VizState } from '../core/state';
import { usePlayback } from '../store/playback';

export function Inspector({ state }: { state: VizState }) {
  const { player, index, seek, setPlaying } = usePlayback();
  const logRef = useRef<HTMLOListElement>(null);
  const vars = Object.entries(state.vars);
  const logs = state.logs.slice(-200);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs.length]);

  const sections = player.sections;
  const current = sections.findLastIndex((s) => s.index <= index);

  return (
    <div className="inspector">
      <section>
        <h3>Variables</h3>
        {vars.length ? (
          <table className="vars">
            <tbody>
              {vars.map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{typeof v === 'string' ? v : JSON.stringify(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small">Call viz.vars({'{ i, j }'}) to show variables here.</p>
        )}
      </section>
      {sections.length > 0 && (
        <section>
          <h3>Sections</h3>
          <div className="sections">
            {sections.map((s, i) => (
              <button
                key={s.index}
                className={`chip ${i === current ? 'active' : ''}`}
                onClick={() => {
                  setPlaying(false);
                  seek(s.index);
                }}
              >
                {s.title}
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="grow">
        <h3>Log</h3>
        <ol className="log" ref={logRef}>
          {logs.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
          {logs.length === 0 && <li className="muted">viz.log(…) output appears here</li>}
        </ol>
      </section>
    </div>
  );
}
