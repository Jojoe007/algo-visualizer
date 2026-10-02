import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useEffect, useRef } from 'react';
import type { RunError } from '../core/trace';
import { useTheme } from './theme';

interface Props {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  line?: number;
  error?: RunError;
  onRunShortcut?: () => void;
}

export function CodePanel({ value, onChange, readOnly, line, error, onRunShortcut }: Props) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorations = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const runRef = useRef(onRunShortcut);
  runRef.current = onRunShortcut;
  const theme = useTheme();

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    decorations.current = editor.createDecorationsCollection();
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current?.());
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
    const markers: Monaco.editor.IMarkerData[] = [];
    if (error?.line) {
      const ln = Math.min(error.line, model.getLineCount());
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: error.message,
        startLineNumber: ln,
        endLineNumber: ln,
        startColumn: error.column !== undefined ? error.column + 1 : model.getLineFirstNonWhitespaceColumn(ln),
        endColumn: model.getLineMaxColumn(ln),
      });
    }
    monaco.editor.setModelMarkers(model, 'viz', markers);
  };

  useEffect(syncLine, [line]);
  useEffect(syncError, [error, value]);

  return (
    <div className="code-panel">
      <Editor
        language="javascript"
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
