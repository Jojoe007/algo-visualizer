import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'algoviz.theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let pref = readPref();
const resolved = () => (pref === 'system' ? (media.matches ? 'dark' : 'light') : pref);

function apply() {
  document.documentElement.dataset.theme = resolved();
  listeners.forEach((l) => l());
}
media.addEventListener('change', apply);
apply();

export function cycleTheme() {
  pref = pref === 'system' ? (media.matches ? 'light' : 'dark') : pref === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
  apply();
}

export function useTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    resolved,
  );
}
