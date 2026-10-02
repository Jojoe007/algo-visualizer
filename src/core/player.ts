// Random access over a trace: state at step i = keyframe ≤ i + replay of the remainder.

import { applyStep, initialState, type VizState } from './state';
import type { Step } from './trace';

export class Player {
  readonly steps: Step[];
  readonly sections: { index: number; title: string }[];
  private keyframes: VizState[] = [];
  private interval: number;
  private cache?: { index: number; state: VizState };

  constructor(steps: Step[], interval = 64) {
    this.steps = steps;
    this.interval = interval;
    this.sections = steps.flatMap((s, index) => (s.kind === 'section' ? [{ index, title: s.title }] : []));
    const s = initialState();
    steps.forEach((step, i) => {
      applyStep(s, step);
      if (i % interval === 0) this.keyframes.push(structuredClone(s));
    });
  }

  get length() {
    return this.steps.length;
  }

  /** State after applying steps[0..index]. Treat as read-only (it is cached). */
  stateAt(index: number): VizState {
    if (this.steps.length === 0) return initialState();
    const i = Math.max(0, Math.min(index, this.steps.length - 1));
    // Fast path for sequential playback.
    if (this.cache && this.cache.index === i - 1) {
      const s = structuredClone(this.cache.state);
      applyStep(s, this.steps[i]);
      this.cache = { index: i, state: s };
      return s;
    }
    const k = Math.floor(i / this.interval);
    const s = structuredClone(this.keyframes[k]);
    for (let j = k * this.interval + 1; j <= i; j++) applyStep(s, this.steps[j]);
    this.cache = { index: i, state: s };
    return s;
  }
}
