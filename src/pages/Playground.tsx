import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { TEMPLATES } from '../algorithms/registry';
import { defaultInputFor } from '../core/inputs';
import type { Template } from '../core/tracer';
import { useRunner, Workspace, type RunOpts } from '../components/Workspace';
import { deleteSaved, listSaved, loadDraft, saveAlgo, saveDraft } from '../store/library';

interface Seed {
  template: Template;
  code: string;
  name: string;
  input?: unknown;
}

function initialSeed(fromNav: Seed | null): Seed {
  if (fromNav) return fromNav;
  const draft = loadDraft();
  if (draft && TEMPLATES[draft.template]) return draft;
  return { template: 'array', code: TEMPLATES.array.presets[0].source, name: 'My algorithm' };
}

export function Playground() {
  const location = useLocation();
  const [seed] = useState(() => initialSeed((location.state as Seed | null) ?? null));
  const [template, setTemplate] = useState<Template>(seed.template);
  const [code, setCode] = useState(seed.code);
  const [name, setName] = useState(seed.name);
  const [input, setInput] = useState<unknown>(() => seed.input ?? defaultInputFor(seed.template));
  const [saved, setSaved] = useState(listSaved);
  const [savedFlash, setSavedFlash] = useState(false);
  const { run, error, running } = useRunner();
  const hasRun = useRef(false);
  const latest = useRef({ code, template, input });
  latest.current = { code, template, input };

  const doRun = (opts: RunOpts = {}) => {
    hasRun.current = true;
    const { code, template, input } = latest.current;
    run(code, template, input, { autoplay: true, ...opts });
  };

  // Run once on open so the page is never blank.
  useEffect(() => {
    doRun({ autoplay: false });
  }, []);

  useEffect(() => saveDraft({ template, code, name }), [template, code, name]);

  const onInputChange = (next: unknown, opts: RunOpts = {}) => {
    setInput(next);
    latest.current.input = next;
    if (hasRun.current) doRun(opts.jumpToLastSection ? opts : { ...opts, autoplay: false });
  };

  const isPreset = (src: string) => Object.values(TEMPLATES).some((t) => t.presets.some((p) => p.source === src));
  const confirmDiscard = () => isPreset(code) || code.trim() === '' || confirm('Replace your current code?');

  const loadCode = (t: Template, src: string, nextInput: unknown, nextName?: string) => {
    setTemplate(t);
    setCode(src);
    setInput(nextInput);
    if (nextName) setName(nextName);
    latest.current = { code: src, template: t, input: nextInput };
    doRun({ autoplay: false });
  };

  const header = (
    <div className="pane-header playground-header">
      <div className="toolbar">
        <input className="name-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Algorithm name" />
        <button className="primary" onClick={() => doRun()} title="Run (⌘/Ctrl + Enter)">
          ▶ Run
        </button>
      </div>
      <div className="toolbar">
        <label className="field">
          <span>Template</span>
          <select
            value={template}
            onChange={(e) => {
              const t = e.target.value as Template;
              if (!confirmDiscard()) return;
              const preset = TEMPLATES[t].presets[0];
              loadCode(t, preset.source, preset.input?.() ?? defaultInputFor(t));
            }}
          >
            {(Object.keys(TEMPLATES) as Template[]).map((t) => (
              <option key={t} value={t}>
                {TEMPLATES[t].label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Example</span>
          <select
            value=""
            onChange={(e) => {
              const preset = TEMPLATES[template].presets[Number(e.target.value)];
              if (preset && confirmDiscard()) loadCode(template, preset.source, preset.input?.() ?? defaultInputFor(template), preset.name);
            }}
          >
            <option value="" disabled>
              Load…
            </option>
            {TEMPLATES[template].presets.map((p, i) => (
              <option key={p.name} value={i}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Saved</span>
          <select
            value=""
            onChange={(e) => {
              const algo = saved.find((a) => a.name === e.target.value);
              if (algo && confirmDiscard()) loadCode(algo.template, algo.code, defaultInputFor(algo.template), algo.name);
            }}
          >
            <option value="" disabled>
              {saved.length ? 'Open…' : 'None yet'}
            </option>
            {saved.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name} · {TEMPLATES[a.template].label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            saveAlgo({ name: name.trim() || 'Untitled', template, code });
            setSaved(listSaved());
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 1200);
          }}
        >
          {savedFlash ? 'Saved ✓' : 'Save'}
        </button>
        {saved.some((a) => a.name === name) && (
          <button
            className="ghost"
            onClick={() => {
              if (!confirm(`Delete "${name}" from your saved algorithms?`)) return;
              deleteSaved(name);
              setSaved(listSaved());
            }}
          >
            Delete
          </button>
        )}
      </div>
      <p className="muted small hint">{TEMPLATES[template].hint}</p>
    </div>
  );

  return (
    <Workspace
      header={header}
      code={code}
      onCodeChange={setCode}
      onRunShortcut={() => doRun()}
      template={template}
      input={input}
      onInputChange={onInputChange}
      error={error}
      running={running}
    />
  );
}
