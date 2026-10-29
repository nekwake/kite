import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as monaco from "monaco-editor";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { api, basename, FileChange, git } from "./lib/api";
import { languageFor } from "./lib/monaco";
import { diffTabId, DiffSource, FileTab, HISTORY_TAB_ID, isDirty, Tab, tabTitle } from "./lib/tabs";
import { useGitStatus } from "./lib/useGitStatus";
import { FileTree } from "./components/FileTree";
import { EditorArea, Reveal } from "./components/EditorArea";
import { QuickOpen } from "./components/QuickOpen";
import { SearchView } from "./components/SearchView";
import { GitView } from "./components/GitView";
import { GitHistory } from "./components/GitHistory";
import { KiteMark } from "./components/KiteLogo";
import { Settings } from "./components/Settings";
import { TerminalPanel, TermTab } from "./components/TerminalPanel";
import { ActivityBar, AgentPanel, Resizer, StatusBar, TitleBar, View } from "./components/Chrome";

const LAST_ROOT_KEY = "kite.lastRoot";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function storedRoot(): string | null {
  try {
    return localStorage.getItem(LAST_ROOT_KEY);
  } catch {
    return null;
  }
}

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<[number, number]>([1, 1]);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [terms, setTerms] = useState<TermTab[]>([]);
  const [activeTerm, setActiveTerm] = useState<number | null>(null);
  const nextTermId = useRef(1);

  const [view, setView] = useState<View>("files");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [agentOpen, setAgentOpen] = useState(false);
  const [sidebarW, setSidebarW] = useState(260);
  const [panelH, setPanelH] = useState(260);
  const [agentW, setAgentW] = useState(360);

  const { status: gitStatus, refresh: refreshGit } = useGitStatus(root);

  const newTerminal = useCallback(
    (command?: string, title?: string) => {
      if (!root) return;
      const id = nextTermId.current++;
      setTerms((t) => [...t, { id, cwd: root, command, title: title ?? "zsh" }]);
      setActiveTerm(id);
      setPanelOpen(true);
    },
    [root],
  );

  const closeTerminal = (id: number) => {
    const rest = terms.filter((t) => t.id !== id);
    setTerms(rest);
    if (rest.length === 0) setPanelOpen(false);
    if (activeTerm === id) setActiveTerm(rest[rest.length - 1]?.id ?? null);
  };

  // Bumped on every folder switch, even to the same folder, to start a fresh terminal
  const [rootSeq, setRootSeq] = useState(0);

  const switchRoot = useCallback((dir: string) => {
    monaco.editor.getModels().forEach((m) => m.dispose());
    setTabs([]);
    setActiveId(null);
    setTerms([]);
    setActiveTerm(null);
    setRecent([]);
    setRoot(dir);
    setRootSeq((s) => s + 1);
    try {
      localStorage.setItem(LAST_ROOT_KEY, dir);
    } catch {}
  }, []);

  // Open the folder passed on the command line, or the last one used
  useEffect(() => {
    api.initialDir().then((dir) => {
      const d = dir ?? storedRoot();
      if (d) switchRoot(d);
    });
  }, [switchRoot]);

  // Every project starts with one terminal in its folder
  useEffect(() => {
    if (rootSeq > 0) newTerminal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootSeq]);

  const openFolder = useCallback(async () => {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") switchRoot(dir);
  }, [switchRoot]);

  const activeTab = tabs.find((t) => t.id === activeId);
  const activeFile = activeTab?.kind === "file" ? activeTab : null;

  // Most recently focused files first, for the empty ⌘P list
  useEffect(() => {
    const p = activeFile?.path;
    if (p) setRecent((r) => [p, ...r.filter((x) => x !== p)].slice(0, 20));
  }, [activeFile?.path]);

  const addOrFocusTab = (tab: Tab) => {
    setTabs((ts) => (ts.some((t) => t.id === tab.id) ? ts.map((t) => (t.id === tab.id ? tab : t)) : [...ts, tab]));
    setActiveId(tab.id);
  };

  const openFile = async (path: string): Promise<boolean> => {
    if (tabs.some((t) => t.id === path)) {
      setActiveId(path);
      return true;
    }
    try {
      const content = await api.readFile(path);
      setTabs((ts) => (ts.some((t) => t.id === path) ? ts : [...ts, { kind: "file", id: path, path, content, saved: content }]));
      setActiveId(path);
      setError(null);
      return true;
    } catch (e) {
      setError(`${basename(path)}: ${e}`);
      return false;
    }
  };

  const openMatch = async (path: string, line: number, start: number, end: number) => {
    if (await openFile(path)) setReveal({ path, line, start, end, nonce: Date.now() });
  };

  const loadDiff = async (path: string, source: DiffSource) => {
    if (!root) return;
    try {
      const v = await git.fileVersions(root, path, source.staged, source.rev);
      addOrFocusTab({ kind: "diff", id: diffTabId(path, source), path, source, ...v });
    } catch (e) {
      setError(`Diff açılamadı: ${e}`);
    }
  };

  const openDiff = (change: FileChange, rev?: string) => loadDiff(change.path, { staged: change.staged, rev });

  // Working-tree and index diffs go stale as files change; reload them when focused
  useEffect(() => {
    if (activeTab?.kind === "diff" && !activeTab.source.rev) loadDiff(activeTab.path, activeTab.source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const showHistory = () => addOrFocusTab({ kind: "history", id: HISTORY_TAB_ID });

  // Files reverted by git: reload their tabs unless they hold unsaved edits
  const reloadFiles = async (paths: string[]) => {
    for (const p of paths) {
      const tab = tabs.find((t): t is FileTab => t.kind === "file" && t.path === p);
      if (!tab || isDirty(tab)) continue;
      const content = await api.readFile(p).catch(() => null);
      if (content === null) continue;
      monaco.editor.getModels().find((m) => m.uri.path === p)?.setValue(content);
      setTabs((ts) => ts.map((t) => (t.id === p ? { ...t, content, saved: content } : t)));
    }
  };

  const showView = (v: View) => {
    setView(v);
    setSidebarOpen(true);
    if (v === "search") setSearchFocus((n) => n + 1);
  };

  const closeTab = async (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    if (isDirty(tab)) {
      const ok = await ask(`${tabTitle(tab)} kaydedilmemiş değişiklikler içeriyor. Yine de kapatılsın mı?`, {
        title: "Kite",
        kind: "warning",
        okLabel: "Kapat",
        cancelLabel: "Vazgeç",
      });
      if (!ok) return;
    }
    if (tab.kind === "file") monaco.editor.getModels().find((m) => m.uri.path === tab.path)?.dispose();
    const idx = tabs.findIndex((t) => t.id === id);
    const rest = tabs.filter((t) => t.id !== id);
    setTabs(rest);
    if (activeId === id) setActiveId(rest[Math.min(idx, rest.length - 1)]?.id ?? null);
  };

  const save = useCallback(async () => {
    if (!activeFile) return;
    const { path, content } = activeFile;
    try {
      await api.writeFile(path, content);
      setTabs((ts) => ts.map((t) => (t.id === path ? { ...t, saved: content } : t)));
      setError(null);
      refreshGit();
    } catch (e) {
      setError(`Kaydedilemedi: ${e}`);
    }
  }, [activeFile, refreshGit]);

  const togglePanel = useCallback(() => {
    if (!panelOpen && terms.length === 0) newTerminal();
    else setPanelOpen((p) => !p);
  }, [panelOpen, terms.length, newTerminal]);

  // One action table for both the menu bar and keyboard shortcuts
  const actions: Record<string, () => void> = {
    settings: () => setSettingsOpen(true),
    open_folder: openFolder,
    quick_open: () => root && setQuickOpen(true),
    save: () => save(),
    close_tab: () => activeId && closeTab(activeId),
    view_files: () => root && showView("files"),
    view_search: () => root && showView("search"),
    view_git: () => root && showView("git"),
    toggle_sidebar: () => setSidebarOpen((s) => !s),
    toggle_terminal: togglePanel,
    new_terminal: () => newTerminal(),
    toggle_agent: () => setAgentOpen((a) => !a),
  };
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // A shortcut may arrive both as a keydown and as a menu event; run it once
  const lastRun = useRef<{ id: string; at: number }>({ id: "", at: 0 });
  const runAction = (id: string) => {
    const now = performance.now();
    if (lastRun.current.id === id && now - lastRun.current.at < 300) return;
    lastRun.current = { id, at: now };
    actionsRef.current[id]?.();
  };

  useEffect(() => {
    const keys: Record<string, string> = {
      ",": "settings", o: "open_folder", p: "quick_open", s: "save", w: "close_tab",
      b: "toggle_sidebar", j: "toggle_terminal", t: "new_terminal", l: "toggle_agent",
    };
    const shiftKeys: Record<string, string> = { e: "view_files", f: "view_search", g: "view_git" };
    // Capture phase so shortcuts win over Monaco and xterm
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.altKey || e.ctrlKey) return;
      const id = (e.shiftKey ? shiftKeys : keys)[e.key.toLowerCase()];
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      runAction(id);
    };
    window.addEventListener("keydown", onKey, true);
    const unlisten = listen<string>("menu", (e) => runAction(e.payload));
    return () => {
      window.removeEventListener("keydown", onKey, true);
      unlisten.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Git status letters for the file tree, plus every folder that contains a change
  const decorations = useMemo(() => {
    const files = new Map<string, string>();
    const dirs = new Set<string>();
    for (const c of gitStatus?.changes ?? []) {
      if (!files.has(c.path) || !c.staged) files.set(c.path, c.status);
      for (let d = c.path; (d = d.slice(0, d.lastIndexOf("/"))) && d.length > 1; ) dirs.add(d);
    }
    return { files, dirs };
  }, [gitStatus]);

  if (!root) {
    return (
      <div className="app">
        <TitleBar title="Kite" />
        <div className="welcome">
          <div className="brand"><KiteMark size={88} /><span className="wordmark">Kite</span></div>
          <p>Hafif, hızlı, Claude ile entegre kod editörü.</p>
          <button className="primary-btn" onClick={openFolder}>Klasör aç (⌘O)</button>
        </div>
        {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      </div>
    );
  }

  const branchLabel = gitStatus?.branch
    ? `⎇ ${gitStatus.branch}${gitStatus.behind ? ` ↓${gitStatus.behind}` : ""}${gitStatus.ahead ? ` ↑${gitStatus.ahead}` : ""}`
    : null;

  return (
    <div className="app">
      <TitleBar title={activeTab ? `${tabTitle(activeTab)} — ${basename(root)}` : basename(root)} />
      <div className="workbench">
        <ActivityBar
          view={view}
          sidebarOpen={sidebarOpen}
          agentOpen={agentOpen}
          gitBadge={gitStatus?.changes.length ?? 0}
          onView={(v) => {
            if (v === view && sidebarOpen) setSidebarOpen(false);
            else showView(v);
          }}
          onToggleAgent={() => setAgentOpen((a) => !a)}
        />
        {sidebarOpen && (
          <>
            <div className="sidebar" style={{ width: sidebarW }}>
              {/* All views stay mounted so their state survives switching */}
              <div className="sidebar-view" style={{ display: view === "files" ? "flex" : "none" }}>
                <FileTree root={root} activePath={activeFile?.path ?? null} onOpenFile={openFile} decorations={decorations} />
              </div>
              <div className="sidebar-view" style={{ display: view === "search" ? "flex" : "none" }}>
                <SearchView root={root} focusNonce={searchFocus} onOpenMatch={openMatch} />
              </div>
              <div className="sidebar-view" style={{ display: view === "git" ? "flex" : "none" }}>
                <GitView
                  root={root}
                  status={gitStatus}
                  refresh={refreshGit}
                  onOpenDiff={(c) => openDiff(c)}
                  onOpenFile={openFile}
                  onShowHistory={showHistory}
                  onDiscarded={reloadFiles}
                />
              </div>
            </div>
            <Resizer dir="x" onDrag={(d) => setSidebarW((w) => clamp(w + d, 160, 600))} />
          </>
        )}
        <div className="main">
          <div className="main-editor">
            <EditorArea
              tabs={tabs}
              activeId={activeId}
              onSelect={setActiveId}
              onClose={closeTab}
              onChange={(path, content) =>
                setTabs((ts) => ts.map((t) => (t.id === path && t.kind === "file" ? { ...t, content } : t)))
              }
              onCursor={(l, c) => setCursor([l, c])}
              reveal={reveal}
              renderHistory={() => <GitHistory root={root} onOpenDiff={openDiff} />}
            />
          </div>
          {/* Kept mounted while hidden so shells keep running */}
          <div style={{ display: panelOpen && terms.length ? "contents" : "none" }}>
            <Resizer dir="y" onDrag={(d) => setPanelH((h) => clamp(h - d, 100, 800))} />
            <div className="main-panel" style={{ height: panelH }}>
              <TerminalPanel
                tabs={terms}
                activeId={panelOpen ? activeTerm : null}
                onSelect={setActiveTerm}
                onNew={() => newTerminal()}
                onClose={closeTerminal}
                onHide={() => setPanelOpen(false)}
              />
            </div>
          </div>
        </div>
        {agentOpen && (
          <>
            <Resizer dir="x" onDrag={(d) => setAgentW((w) => clamp(w - d, 260, 700))} />
            <div className="agent-wrap" style={{ width: agentW }}>
              <AgentPanel onLaunchClaude={() => newTerminal("claude", "claude")} disabled={!root} />
            </div>
          </>
        )}
      </div>
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      {quickOpen && (
        <QuickOpen root={root} recent={recent} onOpen={openFile} onClose={() => setQuickOpen(false)} />
      )}
      <StatusBar
        left={[
          ...(branchLabel ? [branchLabel] : []),
          root.replace(/^\/Users\/[^/]+/, "~"),
          ...(error ? [`⚠ ${error}`] : []),
        ]}
        right={
          activeFile
            ? [`Sat ${cursor[0]}, Süt ${cursor[1]}`, languageFor(activeFile.path), "UTF-8"]
            : []
        }
        toggles={[
          { label: "Terminal", title: "Terminali aç/kapat (⌘J)", on: panelOpen && terms.length > 0, fn: togglePanel },
          { label: "Agent", title: "Agent panelini aç/kapat (⌘L)", on: agentOpen, fn: () => setAgentOpen((a) => !a) },
          { label: "⚙", title: "Ayarlar (⌘,)", on: settingsOpen, fn: () => setSettingsOpen(true) },
        ]}
      />
    </div>
  );
}
