import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import type * as monaco from "monaco-editor";
import { basename } from "../lib/api";
import { languageFor } from "../lib/monaco";
import { KiteMark } from "./KiteLogo";

export type Tab = { path: string; content: string; saved: string };

/** Jump target; `nonce` makes repeated jumps to the same spot fire again */
export type Reveal = { path: string; line: number; start: number; end: number; nonce: number };

type Props = {
  tabs: Tab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onChange: (path: string, content: string) => void;
  onCursor: (line: number, col: number) => void;
  reveal: Reveal | null;
};

export function EditorArea({ tabs, activePath, onSelect, onClose, onChange, onCursor, reveal }: Props) {
  const active = tabs.find((t) => t.path === activePath);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const revealRef = useRef(reveal);
  revealRef.current = reveal;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !reveal || reveal.path !== activePath) return;
    // Let the editor switch to the new file's model first
    const t = setTimeout(() => applyReveal(editor, reveal), 0);
    return () => clearTimeout(t);
  }, [reveal, activePath]);

  // The editor is unmounted while no tab is open
  useEffect(() => {
    if (!active) editorRef.current = null;
  }, [active]);

  if (!active) {
    return (
      <div className="editor-empty">
        <div className="brand brand-faded"><KiteMark size={72} /></div>
        <div className="shortcuts">
          <span>Dosyaya git</span><kbd>⌘P</kbd>
          <span>Projede ara</span><kbd>⌘⇧F</kbd>
          <span>Klasör aç</span><kbd>⌘O</kbd>
          <span>Kaydet</span><kbd>⌘S</kbd>
          <span>Kenar çubuğu</span><kbd>⌘B</kbd>
          <span>Terminal</span><kbd>⌘J</kbd>
          <span>Yeni terminal</span><kbd>⌘T</kbd>
          <span>Agent paneli</span><kbd>⌘L</kbd>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-area">
      <div className="tabs">
        {tabs.map((t) => (
          <div
            key={t.path}
            className={`tab ${t.path === activePath ? "active" : ""}`}
            onClick={() => onSelect(t.path)}
            onAuxClick={(e) => e.button === 1 && onClose(t.path)}
            title={t.path}
          >
            <span>{basename(t.path)}</span>
            <button
              className={`tab-close ${t.content !== t.saved ? "dirty" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.path);
              }}
            >
              <span className="dot">●</span>
              <span className="x">×</span>
            </button>
          </div>
        ))}
      </div>
      <div className="editor-host">
        <Editor
          theme="kite-dark"
          path={active.path}
          defaultValue={active.content}
          defaultLanguage={languageFor(active.path)}
          onChange={(v) => onChange(active.path, v ?? "")}
          onMount={(editor) => {
            editorRef.current = editor;
            // A jump requested before the editor existed (first file opened from search)
            const r = revealRef.current;
            if (r && r.path === editor.getModel()?.uri.path) applyReveal(editor, r);
            editor.onDidChangeCursorPosition((e) =>
              onCursor(e.position.lineNumber, e.position.column),
            );
          }}
          options={{
            fontFamily: "'SF Mono', Menlo, monospace",
            fontSize: 13,
            lineHeight: 20,
            minimap: { enabled: false },
            smoothScrolling: true,
            cursorSmoothCaretAnimation: "on",
            renderLineHighlight: "line",
            scrollBeyondLastLine: false,
            padding: { top: 8 },
            automaticLayout: true,
            bracketPairColorization: { enabled: true },
            stickyScroll: { enabled: true },
          }}
        />
      </div>
    </div>
  );
}

function applyReveal(editor: monaco.editor.IStandaloneCodeEditor, r: Reveal) {
  const range = {
    startLineNumber: r.line,
    startColumn: r.start + 1,
    endLineNumber: r.line,
    endColumn: r.end + 1,
  };
  editor.setSelection(range);
  editor.revealRangeInCenterIfOutsideViewport(range);
  editor.focus();
}
