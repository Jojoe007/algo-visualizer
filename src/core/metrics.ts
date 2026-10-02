// Operation counts derived from a trace — used to compare best / average / worst cases.

import type { Step } from './trace';

export type MetricKey = 'steps' | 'comparisons' | 'swaps' | 'writes' | 'expanded' | 'opened' | 'edgeChecks' | 'relaxations' | 'passes';

export const METRIC_LABELS: Record<MetricKey, string> = {
  steps: 'Trace steps',
  comparisons: 'Comparisons',
  swaps: 'Swaps',
  writes: 'Writes',
  expanded: 'Cells expanded',
  opened: 'Cells opened',
  edgeChecks: 'Edge checks',
  relaxations: 'Relaxations',
  passes: 'Passes',
};

/** Which metric (if any) a single step adds to. */
export function stepMetric(s: Step): MetricKey | null {
  switch (s.kind) {
    case 'array.compare':
      return 'comparisons';
    case 'array.read':
      return s.indices.length > 1 ? 'comparisons' : null;
    case 'array.swap':
      return 'swaps';
    case 'array.write':
      return 'writes';
    case 'grid.set':
      return s.state === 'closed' ? 'expanded' : s.state === 'open' ? 'opened' : null;
    case 'graph.edge':
      return s.state === 'active' ? 'edgeChecks' : s.state === 'tree' ? 'relaxations' : null;
    case 'section':
      return s.title.startsWith('Pass') ? 'passes' : null;
    default:
      return null;
  }
}

export function computeMetrics(steps: Step[]): Record<MetricKey, number> {
  const m = Object.fromEntries(Object.keys(METRIC_LABELS).map((k) => [k, 0])) as Record<MetricKey, number>;
  m.steps = steps.length;
  for (const s of steps) {
    const k = stepMetric(s);
    if (k) m[k]++;
  }
  return m;
}

/** prefix[i] = count of `key` in steps[0..i] — for live counters during a race. */
export function prefixCounts(steps: Step[], key: MetricKey): number[] {
  let c = 0;
  return steps.map((s, i) => (key === 'steps' ? i + 1 : (c += stepMetric(s) === key ? 1 : 0)));
}
