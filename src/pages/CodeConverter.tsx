import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TEMPLATES } from '../algorithms/registry';
import { CodePanel } from '../components/CodePanel';
import type { Template } from '../core/tracer';
import { LANGUAGES, toJavaScript } from '../lang/registry';
import { hasErrors, type LanguageId } from '../lang/types';
import { loadConverterDraft, saveConverterDraft, type ConverterDraft } from '../store/library';

// One-way PoC: Java → JavaScript. The language is a constant so a picker can be added later.
const SOURCE: LanguageId = 'java';

function initialDraft(): ConverterDraft {
  const draft = loadConverterDraft();
  if (draft && TEMPLATES[draft.template]) return draft;
  const first = LANGUAGES[SOURCE].examples[0];
  return { template: first.template, name: first.name, source: first.source };
}

/** First output line generated from `sourceLine` (identity when emission is line-aligned). */
const outputLineFor = (lineMap: number[], sourceLine: number) => {
  const i = lineMap.indexOf(sourceLine);
  return i > 0 ? i : undefined;
};

export function CodeConverter() {
  const navigate = useNavigate();
  const lang = LANGUAGES[SOURCE];
  const [draft, setDraft] = useState(initialDraft);
  const [cursorLine, setCursorLine] = useState<number>();
  const deferredSource = useDeferredValue(draft.source);
  const result = useMemo(() => toJavaScript(SOURCE, deferredSource), [deferredSource]);
  const blocked = hasErrors(result.diagnostics) || !result.code.trim();

  useEffect(() => saveConverterDraft(draft), [draft]);

  const update = (patch: Partial<ConverterDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const isExample = lang.examples.some((e) => e.source === draft.source);

  const openInPlayground = () =>
    navigate('/playground', { state: { template: draft.template, code: result.code, name: `${draft.name} (from ${lang.label})` } });

  return (
    <div className="converter">
      <section className="pane converter-head">
        <div className="pane-header column">
          <div className="pane-header-row">
            <div>
              <h1>Code Converter</h1>
              <p className="muted small">
                Write an algorithm in {lang.label} and get JavaScript the visualizer runs. Lines stay aligned, so playback highlights the same line numbers.
              </p>
            </div>
            <button className="primary" onClick={openInPlayground} disabled={blocked} title={blocked ? 'Fix the errors first' : 'Run the converted code in the Playground'}>
              Open in Playground →
            </button>
          </div>
          <div className="toolbar">
            <label className="field">
              <span>Example</span>
              <select
                value=""
                onChange={(e) => {
                  const ex = lang.examples[Number(e.target.value)];
                  if (!ex || (!isExample && draft.source.trim() && !confirm('Replace your current code?'))) return;
                  setDraft({ template: ex.template, name: ex.name, source: ex.source });
                }}
              >
                <option value="" disabled>
                  Load…
                </option>
                {lang.examples.map((ex, i) => (
                  <option key={ex.name} value={i}>
                    {ex.name} · {TEMPLATES[ex.template].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Template</span>
              <select value={draft.template} onChange={(e) => update({ template: e.target.value as Template })}>
                {(Object.keys(TEMPLATES) as Template[]).map((t) => (
                  <option key={t} value={t}>
                    {TEMPLATES[t].label}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted small">
              Entry point: <code>{lang.entryPoint[draft.template]}</code>
            </span>
          </div>
        </div>
      </section>

      <section className="pane converter-side">
        <div className="converter-label">
          <strong>{lang.label}</strong>
          <span className="muted small">source</span>
          <input className="name-input" value={draft.name} onChange={(e) => update({ name: e.target.value })} aria-label="Algorithm name" />
        </div>
        <CodePanel
          language={lang.monacoLanguage}
          value={draft.source}
          onChange={(source) => update({ source })}
          diagnostics={result.diagnostics}
          onCursorLine={setCursorLine}
        />
        {result.diagnostics.length > 0 && (
          <ul className="diagnostics" aria-live="polite">
            {result.diagnostics.map((d, i) => (
              <li key={i} className={d.severity}>
                <span className="diag-line">line {d.line}</span> {d.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pane converter-side">
        <div className="converter-label">
          <strong>JavaScript</strong>
          <span className="muted small">output · read-only</span>
        </div>
        <CodePanel readOnly value={result.code} line={cursorLine && outputLineFor(result.lineMap, cursorLine)} />
      </section>
    </div>
  );
}
