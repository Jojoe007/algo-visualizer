import { useEffect } from 'react';
import { SPEEDS, usePlayback } from '../store/playback';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest('.monaco-editor'));

export function PlayerControls() {
  const { player, index, playing, speed, seek, stepBy, setPlaying, setSpeed } = usePlayback();
  const last = Math.max(0, player.length - 1);

  // Playback clock.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const s = usePlayback.getState();
      if (s.index >= s.player.length - 1) s.setPlaying(false);
      else s.seek(s.index + 1);
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [playing, speed]);

  // Keyboard: ← → step, space play/pause, Home/End.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = usePlayback.getState();
      if (e.key === 'ArrowRight') s.stepBy(1);
      else if (e.key === 'ArrowLeft') s.stepBy(-1);
      else if (e.key === ' ') s.setPlaying(!s.playing);
      else if (e.key === 'Home') s.stepBy(-Infinity);
      else if (e.key === 'End') s.stepBy(Infinity);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const disabled = player.length === 0;
  return (
    <div className="controls">
      <div className="buttons">
        <button className="icon" onClick={() => stepBy(-Infinity)} disabled={disabled || index === 0} title="First step (Home)" aria-label="First step">
          ⏮
        </button>
        <button className="icon" onClick={() => stepBy(-1)} disabled={disabled || index === 0} title="Previous step (←)" aria-label="Previous step">
          ◀
        </button>
        <button className="icon primary" onClick={() => setPlaying(!playing)} disabled={disabled} title="Play / pause (space)" aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '⏸' : '▶'}
        </button>
        <button className="icon" onClick={() => stepBy(1)} disabled={disabled || index >= last} title="Next step (→)" aria-label="Next step">
          ▶︎|
        </button>
        <button className="icon" onClick={() => stepBy(Infinity)} disabled={disabled || index >= last} title="Last step (End)" aria-label="Last step">
          ⏭
        </button>
      </div>
      <input
        className="scrubber"
        type="range"
        min={0}
        max={last}
        value={index}
        onChange={(e) => {
          setPlaying(false);
          seek(Number(e.target.value));
        }}
        disabled={disabled}
        aria-label="Step"
      />
      <span className="counter">
        {player.length ? index + 1 : 0} / {player.length}
      </span>
      <label className="speed">
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Speed">
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s} steps/s
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
