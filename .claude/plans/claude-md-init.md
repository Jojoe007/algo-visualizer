# Plan: create `algo-visualizer/CLAUDE.md`

## Context
The user ran `/init`. The repo has no CLAUDE.md, Cursor/Copilot rules or Codex/Gemini configs. The aim is a concise file covering the commands and the cross-file architecture: the trace pipeline, the sandbox, the template system and case studies. These are what a fresh session would otherwise have to rediscover across ~10 files. It also records the non-obvious gotchas: the repo-local SSH key, the `?raw` built-ins, and line numbers being tied to the source.

## Action
1. Write `/Users/jojoe007/Documents/Projects/train-traffic-management/algo-visualizer/CLAUDE.md` with the content below.
2. Copy this plan to `algo-visualizer/.claude/plans/claude-md-init.md`, following the new plans rule. Plan mode only allows editing the user-level plan file, so this copy happens after approval.

No other files change.

---

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

npm run dev                      # Vite dev server (http://localhost:5173)
npm test                         # vitest run — all engine tests (src/__tests__/engine.test.ts)
npx vitest run -t "B+ tree"      # run tests whose name matches
npx tsc -b                       # typecheck (also part of `npm run build`)
npm run build && npm run preview -- --port 4173   # production build + static server
npm run lint                     # oxlint

The UI has no component tests. Verify UI changes by running the app (`.claude/launch.json` defines the dev server for the browser pane).
`vite.config.ts` allows `.ngrok-free.app` hosts for both `server` and `preview`; the app is shared publicly with `ngrok http 4173`.

## Architecture: everything is a trace

    algorithm source (plain JS string)
      → sandbox/instrument.ts   acorn parse, insert `__line(n);` before every statement and at the top of every loop body, astring regenerate
      → sandbox/execute.ts      new Function(...) in strict mode; runs `run(input, viz)`
      → core/tracer.ts          Tracer records Step[]; `viz` API + traced inputs (Proxies)
      → core/player.ts          Player: keyframe every 64 steps → stateAt(i) via core/state.ts applyStep reducer
      → renderers/*View.tsx     draw VizState (ArrayView / GridView / GraphView / TreeView)

- **Built-ins are user code.** `src/algorithms/*.js`, `src/structures/*.js` and the Playground examples in `src/presets/*.js` are plain JS defining `function run(input, viz)`. They are imported with `?raw` and run through the *same* sandbox as user code. Do not convert them to TS modules. The editor shows exactly this source, and step `line` numbers refer to it.
- **Line highlighting is a call to `viz` inside a helper:** a step records the line where `viz.*` was called. Wrapping `viz.*` in a helper method makes every step point at that helper's line, which is why bplusTree.js calls `this.viz.tree(...)` directly.
- **Sandbox** (`sandbox/runUserCode.ts`): every run spawns a fresh module Worker (`worker.ts` → `execute()`) with a 3 s wall-clock timeout (terminate). `execute()` is environment-agnostic, so tests call it directly with no worker. Limits are in `LIMITS` (tracer.ts): 100k steps and 2M line hits. The line-hit budget is what catches `while(true){}`. Steps must stay structured-clone-safe, so values go through `formatValue`.
- **Auto-tracing via Proxies** (tracer.ts):
  - Array input: reads on one line coalesce into a compare step. Two adjacent writes that exchange values coalesce into a swap.
  - Grid: `grid.neighbors()` emits `grid.expand`.
  - Graph: reading `graph.edges[i]` emits an `active` edge step.
  - `viz.swap` and `viz.compare` touch the raw array, so they bypass the proxy.
- **Transient vs persistent state:** `applyStep` clears transient fields (`array.active`, `grid.changed`, `graph.activeEdge/activeNode`) at the start of each step. Everything else accumulates. `stateAt()` returns a cached object; treat it as read-only.

## Templates (input kinds)

`Template = 'array' | 'grid' | 'tree' | 'graph'` (core/tracer.ts). A new template touches all of these:
- the `StepBody` union (`core/trace.ts`) and reducer cases (`core/state.ts`)
- `createRuntime` (input wrapping + init step) and `viz` helpers (`core/tracer.ts`)
- `defaultInputFor` (`core/inputs.ts`) and `TEMPLATES` (`algorithms/registry.ts`)
- the renderer branch in `components/Workspace.tsx` plus `CaseCompare.tsx` `MiniView`, and `components/InputEditor.tsx`
- the Monaco `VIZ_DTS` typings (`monacoSetup.ts`, for autocompletion) and the Gallery thumbnail
- metrics in `core/metrics.ts`, if the template has meaningful counts

## Registry, gallery and case studies

`src/algorithms/registry.ts` holds:
- `BUILTINS`: the gallery entries and `/algo/:id` routes.
- `TEMPLATES`: the Playground templates and their examples.

An optional `caseStudy` (`sizes`, `defaultSize`, headline `metric`, `complexity`, and `best/average/worst` each with `input(n)` and an explanation) enables the case buttons and the **Compare cases** view (`components/CaseCompare.tsx` race + `GrowthChart.tsx`). Metrics are counted from steps in `core/metrics.ts` (`stepMetric`). For example, comparisons = `array.compare` steps plus 2-index `array.read` steps. An algorithm must therefore express its comparisons through traced reads or `viz.compare` for its counts to be right. Case input generators live in `core/inputs.ts`; `quickSortBest` pre-rotates subarrays to match the Lomuto partition.

## UI state

- Playback state is a single zustand store (`store/playback.ts`). `useRunner()` (Workspace.tsx) runs code and loads the trace, dropping stale runs by token.
- `CaseCompare` keeps its own local Players and clock, independent of the store.
- Routing uses `HashRouter`, so static hosting works.
- Monaco is bundled locally (`monacoSetup.ts`, `loader.config({ monaco })`), not loaded from a CDN. That is why the main chunk is ~4 MB.
- Theme: CSS variables on `:root` / `[data-theme='dark']` in `index.css`, toggled by `components/theme.ts`.
- Case series colors (`--case-best/average/worst`) are reference-palette slots 3/1/2, validated in both modes.
- Saved Playground algorithms and the draft live in `localStorage` (`store/library.ts`).

## Tests

`src/__tests__/engine.test.ts` exercises the engine end to end through `execute()`:
- sorting correctness
- A\* path length equals BFS distance on random grids
- B+ tree invariants (key bounds, balanced depth, leaf links) under random insert/delete
- Bellman-Ford against a reference implementation, plus negative-cycle detection
- exact best/worst operation counts per case study
- player random-access equals sequential replay
- sandbox limits and error line numbers
- every Playground preset and every case at every chart size runs without error

Extend these when adding algorithms or cases.

## Conventions

- **Commit messages:** lowercase, past tense, with no `Co-Authored-By` or other attribution lines. For example: `added bellman-ford to gallery`, `fixed overlapping edge labels`.
- **Reuse before writing:** check for an existing helper first, such as `formatValue`, `edgeKey`, the input generators in `core/inputs.ts`, `computeMetrics`/`prefixCounts`, the renderers, `useRunner`, `Workspace`, and `Player`. Extend shared modules rather than duplicating logic per algorithm or template. Keep modules single-purpose (engine in `core/`, execution in `sandbox/`, drawing in `renderers/`, page composition in `pages/`).
- **High-level code:** read like a description of intent. When low-level code is unavoidable (geometry math, AST surgery, proxy traps, bit or index arithmetic), wrap it in a small function with a meaningful name. Examples: `asBlock`, `lineCall`, `quickSortBest`, `niceMax`. Call that function instead of inlining the mechanics.

## Git

The remote is `git@github.com:Jojoe007/algo-visualizer.git`. The default SSH agent key is a work key that GitHub rejects for this account, so the repo sets `core.sshCommand` locally to use `~/.ssh/takdanai-personal`. Keep that setting.
```

---

(Code fences inside the real file will be proper ```bash blocks; they are shown unfenced above only to avoid nesting.)

## Verification
- Run `cat CLAUDE.md` and confirm the prefix lines are exact.
- Spot-check that the referenced paths exist: `ls src/core src/sandbox src/algorithms/registry.ts src/__tests__/engine.test.ts`.
- `npx vitest run -t "B+ tree"` runs a filtered subset, confirming the single-test command works.
