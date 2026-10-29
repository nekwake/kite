import Editor from "@monaco-editor/react";
import { basename } from "../lib/api";
import { languageFor } from "../lib/monaco";

export type Tab = { path: string; content: string; saved: string };

type Props = {
  tabs: Tab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onChange: (path: string, content: string) => void;
  onCursor: (line: number, col: number) => void;
};

export function EditorArea({ tabs, activePath, onSelect, onClose, onChange, onCursor }: Props) {
  const active = tabs.find((t) => t.path === activePath);

  if (!active) {
    return (
      <div className="editor-empty">
        <div className="editor-empty-logo">Kite</div>
        <div className="shortcuts">
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
