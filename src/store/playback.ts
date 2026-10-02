import { create } from 'zustand';
import { Player } from '../core/player';
import type { Step } from '../core/trace';

export const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 500]; // steps per second

interface PlaybackState {
  player: Player;
  index: number;
  playing: boolean;
  speed: number;
  load: (steps: Step[], opts?: { index?: number; autoplay?: boolean }) => void;
  seek: (index: number) => void;
  stepBy: (delta: number) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
}

export const usePlayback = create<PlaybackState>((set, get) => ({
  player: new Player([]),
  index: 0,
  playing: false,
  speed: 10,
  load: (steps, opts = {}) => {
    const player = new Player(steps);
    set({ player, index: Math.min(opts.index ?? 0, Math.max(0, steps.length - 1)), playing: !!opts.autoplay && steps.length > 1 });
  },
  seek: (index) => {
    const max = get().player.length - 1;
    set({ index: Math.max(0, Math.min(index, max)) });
  },
  stepBy: (delta) => {
    get().seek(get().index + delta);
    set({ playing: false });
  },
  setPlaying: (playing) => {
    const { index, player } = get();
    // Pressing play at the end restarts from the beginning.
    if (playing && index >= player.length - 1) set({ index: 0 });
    set({ playing });
  },
  setSpeed: (speed) => set({ speed }),
}));

/** Duration for CSS transitions so animations never lag behind playback. */
export const transitionMs = (speed: number) => Math.max(0, Math.min(260, 800 / speed));
