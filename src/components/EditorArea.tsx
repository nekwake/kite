import { ReactNode, useEffect, useRef, useState } from "react";
import { t as tr } from "../lib/i18n";
import { Icon } from "../lib/icons";
import Editor, { DiffEditor } from "@monaco-editor/react";
import type * as monaco from "monaco-editor";
import { languageFor } from "../lib/monaco";
import { isDirty, Tab, TabGroup, tabTitle } from "../lib/tabs";
import { useSettings } from "../lib/settings";
import { FileIcon } from "../lib/fileIcons";
import { basename, git } from "../lib/api";
import { gutterDecorations, lineChanges } from "../lib/gitGutter";
import { startDrag } from "../lib/drag";
import { KiteMark } from "./KiteLogo";
import { TerminalSlot } from "./TerminalPanel";

/** Jump target; `nonce` makes repeated jumps to the same spot fire again */
export type Reveal = { path: string; line: number; start: number; end: number; nonce: number };

type Props = {
  group: TabGroup;
  tabs: Tab[];
  activeId: string | null;
  focused: boolean;
  /** Main group only: show the "drop here to split" zone while a tab is dragged */
  canSplit: boolean;
  onFocus: () => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onChange: (path: string, content: string) => void;
  onCursor: (line: number, col: number) => void;
  onMoveTab: (id: string, group: TabGroup, beforeId?: string) => void;
  onNewFile: () => void;
  onTerminalExit: (id: string) => void;
  reveal: Reveal | null;
  renderHistory: () => ReactNode;
  renderChat: (id: string) => ReactNode;
  root: string;
  onTabMenu: (e: React.MouseEvent, tab: Tab) => void;
  onPin: (id: string) => void;
  /** Changes whenever the repo state does, to refresh gutter markers */
  gitKey: string;
};

const EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  fontFamily: "'SF Mono', Menlo, monospace",
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
  const { group, tabs, activeId, onSelect, onClose, onChange, onCursor, reveal, renderHistory, root, onTabMenu } = props;
  const active = tabs.find((t) => t.id === activeId);
  const activeFile = active?.kind === "file" ? active : null;
  const settings = useSettings();
  const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    ...EDITOR_OPTIONS,
    fontSize: settings.editorFontSize,
    lineHeight: Math.round(settings.editorFontSize * 1.55),
    minimap: { enabled: settings.minimap },
    wordWrap: settings.wordWrap ? "on" : "off",
    tabSize: settings.tabSize,
  };
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

  // Git gutter: the index version of the file is the baseline
  const [base, setBase] = useState<{ path: string; text: string | null } | null>(null);
  const filePath = activeFile && !activeFile.untitled ? activeFile.path : null;
  useEffect(() => {
    if (!filePath || !root) return setBase(null);
    let live = true;
    git
      .fileVersions(root, filePath, false)
      .then((v) => live && setBase({ path: filePath, text: v.original }))
      .catch(() => live && setBase({ path: filePath, text: null }));
    return () => {
      live = false;
    };
  }, [filePath, root, props.gitKey]);

  const gutterIds = useRef(new Map<string, string[]>());
  // Bumped when Monaco mounts, so markers also appear on a freshly opened editor
  const [editorTick, setEditorTick] = useState(0);
  const content = activeFile?.content;
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model || !base || base.path !== filePath || model.uri.path !== filePath) return;
    const t = setTimeout(() => {
      const decos = base.text === null ? [] : gutterDecorations(lineChanges(base.text, model.getValue()));
      gutterIds.current.set(filePath, model.deltaDecorations(gutterIds.current.get(filePath) ?? [], decos));
    }, 200);
    return () => clearTimeout(t);
  }, [base, content, filePath, editorTick]);

  const dragTab = (e: React.PointerEvent, t: Tab) =>
    startDrag(
      e,
      tabTitle(t),
      "[data-tab-drop]",
      (target) => {
        const el = target as HTMLElement;
        props.onMoveTab(t.id, el.dataset.tabDrop as TabGroup, el.dataset.tabBefore);
      },
      "dragging-tab",
    );

  const splitZone = props.canSplit && (
    <div className="split-zone" data-tab-drop="right">
      <span>{tr("Sağ panele taşı")}</span>
    </div>
  );

  if (!active) {
    return (
      <div className="editor-empty" data-tab-drop={group} onMouseDown={props.onFocus}>
        {splitZone}
        <div className="brand brand-faded"><KiteMark size={72} /></div>
        <div className="shortcuts">
          <span>{tr("Dosyaya git")}</span><kbd>{tr("⌘P")}</kbd>
          <span>{tr("Komut paleti")}</span><kbd>{tr("⌘⇧P")}</kbd>
          <span>{tr("Yeni dosya")}</span><kbd>{tr("⌘N")}</kbd>
          <span>{tr("Projede ara")}</span><kbd>{tr("⌘⇧F")}</kbd>
          <span>{tr("Git")}</span><kbd>{tr("⌘⇧G")}</kbd>
          <span>{tr("Kenar çubuğu")}</span><kbd>{tr("⌘B")}</kbd>
          <span>{tr("Terminal")}</span><kbd>{tr("⌘J")}</kbd>
          <span>{tr("Yeni Claude oturumu")}</span><kbd>{tr("⌘L")}</kbd>
          <span>{tr("Claude oturumları")}</span><kbd>{tr("⌘⇧C")}</kbd>
          <span>{tr("Yeni pencere")}</span><kbd>{tr("⌘⇧N")}</kbd>
          <span>{tr("Ayarlar")}</span><kbd>⌘,</kbd>
        </div>
      </div>
    );
  }

  return (
    <div className={`editor-area ${props.focused ? "focused" : ""}`} onMouseDownCapture={props.onFocus}>
      <div className="tabs" data-tab-drop={group}>
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`tab ${t.id === activeId ? "active" : ""} tab-${t.kind} ${t.kind === "file" && t.preview ? "preview" : ""}`}
            data-tab-drop={group}
            data-tab-before={t.id}
            onPointerDown={(e) => dragTab(e, t)}
            onClick={() => onSelect(t.id)}
            onAuxClick={(e) => e.button === 1 && onClose(t.id)}
            onDoubleClick={() => props.onPin(t.id)}
            onContextMenu={(e) => onTabMenu(e, t)}
            title={t.kind === "history" || t.kind === "chat" ? undefined : t.kind === "terminal" ? t.cwd : t.kind === "file" && t.untitled ? undefined : t.path}
          >
            {t.kind === "file" && (t.untitled ? <Icon name="file" size={15} className="tab-icon" /> : <FileIcon name={basename(t.path)} />)}
            {t.kind === "diff" && <span className="tab-icon">±</span>}
            {t.kind === "history" && <Icon name="history" size={15} className="tab-icon" />}
            {t.kind === "terminal" && <Icon name="sparkle" size={15} className="tab-icon tab-icon-claude" />}
            {t.kind === "chat" && <Icon name="chat" size={15} className="tab-icon tab-icon-claude" />}
            <span>{tabTitle(t)}</span>
            <button
              className={`tab-close ${isDirty(t) ? "dirty" : ""}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.id);
              }}
            >
              <span className="dot">●</span>
              <span className="x"><Icon name="close" size={14} /></span>
            </button>
          </div>
        ))}
        <button className="tab-new" onClick={props.onNewFile} title={tr("Yeni dosya (⌘N)")}><Icon name="plus" size={17} /></button>
      </div>
      {activeFile && (
        <div className="breadcrumbs">
          {(activeFile.untitled
            ? basename(activeFile.path)
            : activeFile.path.startsWith(root + "/")
              ? activeFile.path.slice(root.length + 1)
              : activeFile.path
          )
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
      <div className="editor-host" data-tab-drop={group}>
        {splitZone}
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
              setEditorTick((n) => n + 1);
              // A jump requested before the editor existed (first file opened from search)
              const r = revealRef.current;
              if (r && r.path === editor.getModel()?.uri.path) applyReveal(editor, r);
              editor.onDidChangeCursorPosition((e) => onCursor(e.position.lineNumber, e.position.column));
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
        {active.kind === "chat" && <div className="chat-host" key={active.id}>{props.renderChat(active.id)}</div>}
        {/* Terminal tabs stay attached while hidden so their sessions keep running */}
        {tabs.map(
          (t) =>
            t.kind === "terminal" && (
              <div key={t.id} className="center-terminal" data-tab-id={t.id} style={{ display: t.id === activeId ? "block" : "none" }}>
                <TerminalSlot id={t.id} cwd={t.cwd} command={t.command} active={t.id === activeId} onExit={props.onTerminalExit} />
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
