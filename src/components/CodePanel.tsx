import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useEffect, useRef } from 'react';
import type { RunError } from '../core/trace';
import type { Diagnostic } from '../lang/types';
import { useTheme } from './theme';

interface Props {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  line?: number;
  error?: RunError;
  /** Converter diagnostics, shown as markers alongside `error`. */
  diagnostics?: Diagnostic[];
  onRunShortcut?: () => void;
  onCursorLine?: (line: number) => void;
  language?: string;
}

export function CodePanel({ value, onChange, readOnly, line, error, diagnostics, onRunShortcut, onCursorLine, language = 'javascript' }: Props) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorations = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const runRef = useRef(onRunShortcut);
  runRef.current = onRunShortcut;
  const cursorRef = useRef(onCursorLine);
  cursorRef.current = onCursorLine;
  const theme = useTheme();

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    decorations.current = editor.createDecorationsCollection();
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current?.());
    editor.onDidChangeCursorPosition((e) => cursorRef.current?.(e.position.lineNumber));
    syncLine();
    syncError();
  };

  const syncLine = () => {
    const editor = editorRef.current;
    if (!editor || !decorations.current) return;
    if (!line) {
      decorations.current.clear();
      return;
    }
    decorations.current.set([
      { range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 }, options: { isWholeLine: true, className: 'exec-line', glyphMarginClassName: 'exec-glyph' } },
    ]);
    editor.revealLineInCenterIfOutsideViewport(line);
  };

  const syncError = () => {
    const editor = editorRef.current, monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!monaco || !model) return;
    const marker = (severity: Monaco.MarkerSeverity, message: string, line: number, column?: number): Monaco.editor.IMarkerData => {
      const ln = Math.min(line, model.getLineCount());
      return {
        severity,
        message,
        startLineNumber: ln,
        endLineNumber: ln,
        startColumn: column !== undefined ? column + 1 : model.getLineFirstNonWhitespaceColumn(ln),
        endColumn: model.getLineMaxColumn(ln),
      };
    };
    const markers: Monaco.editor.IMarkerData[] = [];
    if (error?.line) markers.push(marker(monaco.MarkerSeverity.Error, error.message, error.line, error.column));
    for (const d of diagnostics ?? []) {
      markers.push(marker(d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning, d.message, d.line, d.column));
    }
    monaco.editor.setModelMarkers(model, 'viz', markers);
  };

  useEffect(syncLine, [line]);
  useEffect(syncError, [error, diagnostics, value]);

  return (
    <div className="code-panel">
      <Editor
        language={language}
        value={value}
        onChange={(v) => onChange?.(v ?? '')}
        onMount={onMount}
        theme={theme === 'dark' ? 'vs-dark' : 'vs'}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          glyphMargin: true,
          automaticLayout: true,
          tabSize: 2,
          renderLineHighlight: 'none',
          stickyScroll: { enabled: false },
          padding: { top: 8 },
        }}
      />
    </div>
  );
}
