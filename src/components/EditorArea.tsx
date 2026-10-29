import { ReactNode, useEffect, useRef } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import type * as monaco from "monaco-editor";
import { languageFor } from "../lib/monaco";
import { isDirty, Tab, tabTitle } from "../lib/tabs";
import { useSettings } from "../lib/settings";
import { FileIcon } from "../lib/fileIcons";
import { basename } from "../lib/api";
import { KiteMark } from "./KiteLogo";
import { TerminalView } from "./TerminalPanel";

/** Jump target; `nonce` makes repeated jumps to the same spot fire again */
export type Reveal = { path: string; line: number; start: number; end: number; nonce: number };

type Props = {
  tabs: Tab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onChange: (path: string, content: string) => void;
  onCursor: (line: number, col: number) => void;
  reveal: Reveal | null;
  renderHistory: () => ReactNode;
  root: string;
  onTabMenu: (e: React.MouseEvent, tab: Tab) => void;
};

const EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
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
};

export function EditorArea(props: Props) {
  const { tabs, activeId, onSelect, onClose, onChange, onCursor, reveal, renderHistory, root, onTabMenu } = props;
  const active = tabs.find((t) => t.id === activeId);
  const { editorFontSize } = useSettings();
  const editorOptions = { ...EDITOR_OPTIONS, fontSize: editorFontSize, lineHeight: Math.round(editorFontSize * 1.55) };
  const activeFile = active?.kind === "file" ? active : null;
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const revealRef = useRef(reveal);
  revealRef.current = reveal;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !reveal || reveal.path !== activeFile?.path) return;
    // Let the editor switch to the new file's model first
    const t = setTimeout(() => applyReveal(editor, reveal), 0);
    return () => clearTimeout(t);
  }, [reveal, activeFile?.path]);

  // The editor is unmounted while no file tab is showing
  useEffect(() => {
    if (!activeFile) editorRef.current = null;
  }, [activeFile]);

  if (!active) {
    return (
      <div className="editor-empty">
        <div className="brand brand-faded"><KiteMark size={72} /></div>
        <div className="shortcuts">
          <span>Dosyaya git</span><kbd>⌘P</kbd>
          <span>Komut paleti</span><kbd>⌘⇧P</kbd>
          <span>Projede ara</span><kbd>⌘⇧F</kbd>
          <span>Git</span><kbd>⌘⇧G</kbd>
          <span>Klasör aç</span><kbd>⌘O</kbd>
          <span>Kaydet</span><kbd>⌘S</kbd>
          <span>Kenar çubuğu</span><kbd>⌘B</kbd>
          <span>Terminal</span><kbd>⌘J</kbd>
          <span>Yeni terminal</span><kbd>⌘T</kbd>
          <span>Yeni Claude oturumu</span><kbd>⌘L</kbd>
          <span>Claude oturumları</span><kbd>⌘⇧C</kbd>
          <span>Ayarlar</span><kbd>⌘,</kbd>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-area">
      <div className="tabs">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`tab ${t.id === activeId ? "active" : ""} tab-${t.kind}`}
            onClick={() => onSelect(t.id)}
            onAuxClick={(e) => e.button === 1 && onClose(t.id)}
            onContextMenu={(e) => onTabMenu(e, t)}
            title={t.kind === "history" ? undefined : t.kind === "terminal" ? t.cwd : t.path}
          >
            {t.kind === "file" && <FileIcon name={basename(t.path)} />}
            {t.kind === "diff" && <span className="tab-icon">±</span>}
            {t.kind === "history" && <span className="tab-icon">⎇</span>}
            {t.kind === "terminal" && <span className="tab-icon tab-icon-claude">✦</span>}
            <span>{tabTitle(t)}</span>
            <button
              className={`tab-close ${isDirty(t) ? "dirty" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.id);
              }}
            >
              <span className="dot">●</span>
              <span className="x">×</span>
            </button>
          </div>
        ))}
      </div>
      {activeFile && (
        <div className="breadcrumbs">
          {(activeFile.path.startsWith(root + "/") ? activeFile.path.slice(root.length + 1) : activeFile.path)
            .split("/")
            .map((seg, i, all) => (
              <span key={i} className={i === all.length - 1 ? "crumb-last" : ""}>
                {i === all.length - 1 && <FileIcon name={seg} />}
                {seg}
                {i < all.length - 1 && <span className="crumb-sep">›</span>}
              </span>
            ))}
        </div>
      )}
      <div className="editor-host">
        {active.kind === "file" && (
          <Editor
            theme="kite-dark"
            path={active.path}
            defaultValue={active.content}
            defaultLanguage={languageFor(active.path)}
            // Models are disposed when their tab closes, so undo history survives tab switches
            keepCurrentModel
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
            options={editorOptions}
          />
        )}
        {active.kind === "diff" && (
          <DiffEditor
            key={active.id}
            theme="kite-dark"
            original={active.original}
            modified={active.modified}
            language={languageFor(active.path)}
            originalModelPath={`/__diff__/a/${active.id}`}
            modifiedModelPath={`/__diff__/b/${active.id}`}
            options={{
              ...editorOptions,
              readOnly: true,
              originalEditable: false,
              renderSideBySide: true,
              useInlineViewWhenSpaceIsLimited: true,
              stickyScroll: { enabled: false },
            }}
          />
        )}
        {active.kind === "history" && renderHistory()}
        {/* Terminal tabs stay mounted while hidden so their sessions keep running */}
        {tabs.map(
          (t) =>
            t.kind === "terminal" && (
              <div key={t.id} className="center-terminal" data-tab-id={t.id} style={{ display: t.id === activeId ? "block" : "none" }}>
                <TerminalView tab={t} active={t.id === activeId} onExit={() => onClose(t.id)} />
              </div>
            ),
        )}
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
