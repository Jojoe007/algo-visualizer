// User algorithms persisted in localStorage (no backend). All access is best-effort.

import type { Template } from '../core/tracer';

export interface SavedAlgo {
  name: string;
  template: Template;
  code: string;
  updatedAt: number;
}

const LIB = 'algoviz.library';
const DRAFT = 'algoviz.draft';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — saving is best-effort */
  }
}

export const listSaved = (): SavedAlgo[] => read<SavedAlgo[]>(LIB, []).sort((a, b) => b.updatedAt - a.updatedAt);

export function saveAlgo(algo: Omit<SavedAlgo, 'updatedAt'>) {
  const rest = listSaved().filter((a) => a.name !== algo.name);
  write(LIB, [{ ...algo, updatedAt: Date.now() }, ...rest]);
}

export const deleteSaved = (name: string) => write(LIB, listSaved().filter((a) => a.name !== name));

export const loadDraft = () => read<Omit<SavedAlgo, 'updatedAt'> | null>(DRAFT, null);
export const saveDraft = (d: Omit<SavedAlgo, 'updatedAt'>) => write(DRAFT, d);

// Code Converter draft (source in a non-JS language).
export interface ConverterDraft {
  template: Template;
  name: string;
  source: string;
}
const CONVERTER_DRAFT = 'algoviz.converterDraft';
export const loadConverterDraft = () => read<ConverterDraft | null>(CONVERTER_DRAFT, null);
export const saveConverterDraft = (d: ConverterDraft) => write(CONVERTER_DRAFT, d);
