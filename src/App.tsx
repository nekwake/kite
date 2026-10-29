import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as monaco from "monaco-editor";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, basename, ClaudeSession, dirname, FileChange, git, relativeTo } from "./lib/api";
import { languageFor } from "./lib/monaco";
import { diffTabId, DiffSource, FileTab, HISTORY_TAB_ID, isDirty, Tab, tabTitle } from "./lib/tabs";
import { useGitStatus } from "./lib/useGitStatus";
import { FileTree } from "./components/FileTree";
import { EditorArea, Reveal } from "./components/EditorArea";
import { Command, QuickOpen } from "./components/QuickOpen";
import { ContextMenu, MenuItem, MenuState } from "./components/ContextMenu";
import { dropAt, DROP_ATTR, DROP_EVENT } from "./lib/drag";
import { getSettings, zoom } from "./lib/settings";
import { SearchView } from "./components/SearchView";
import { GitView } from "./components/GitView";
import { GitHistory } from "./components/GitHistory";
import { KiteMark } from "./components/KiteLogo";
import { Settings } from "./components/Settings";
import { TerminalPanel, TermTab } from "./components/TerminalPanel";
import { ActivityBar, Resizer, StatusBar, TitleBar, View } from "./components/Chrome";
import { ClaudeSessions } from "./components/ClaudeSessions";

const LAST_ROOT_KEY = "kite.lastRoot";
const RECENT_PROJECTS_KEY = "kite.recentProjects";

// Window APIs throw when the UI runs in a plain browser (UI previews/tests)
const inTauri = "__TAURI_INTERNALS__" in window;

function recentProjects(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

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
  const [quickOpen, setQuickOpen] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [searchFocus, setSearchFocus] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [terms, setTerms] = useState<TermTab[]>([]);
  const [activeTerm, setActiveTerm] = useState<number | null>(null);
  const nextTermId = useRef(1);

  const [view, setView] = useState<View>("files");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sidebarW, setSidebarW] = useState(260);
  const [panelH, setPanelH] = useState(260);
  const nextCenterTerm = useRef(1);

  const { status: gitStatus, refresh: refreshGit } = useGitStatus(root);

  const newTerminal = useCallback(
    (opts: { command?: string; title?: string; cwd?: string } = {}) => {
      if (!root) return;
      const id = nextTermId.current++;
      const cwd = opts.cwd ?? root;
      const title = opts.title ?? (cwd === root ? "zsh" : basename(cwd));
      setTerms((t) => [...t, { id, cwd, command: opts.command, title }]);
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
      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify([dir, ...recentProjects().filter((p) => p !== dir)].slice(0, 10)));
    } catch {}
    api.watchRoot(dir).catch(() => {});
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
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
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

  // Claude sessions run in big terminal tabs in the editor area
  const openClaude = (session?: ClaudeSession) => {
    if (!root) return;
    const existing = session && tabs.find((t) => t.kind === "terminal" && t.sessionId === session.id);
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    addOrFocusTab({
      kind: "terminal",
      id: `term:${nextCenterTerm.current++}`,
      title: session ? (session.title.length > 32 ? `${session.title.slice(0, 32)}…` : session.title) : "Yeni Claude oturumu",
      cwd: session?.cwd ?? root,
      command: session ? `claude --resume ${session.id}` : "claude",
      sessionId: session?.id,
    });
  };

  const openSessionIds = useMemo(
    () => new Set(tabs.flatMap((t) => (t.kind === "terminal" && t.sessionId ? [t.sessionId] : []))),
    [tabs],
  );

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

  // Keep tabs pointing at files that were renamed or moved to the trash
  const onRenamed = (from: string, to: string) => {
    const moved = (p: string) => (p === from ? to : p.startsWith(from + "/") ? to + p.slice(from.length) : null);
    setTabs((ts) =>
      ts.map((t) => {
        if (t.kind !== "file") return t;
        const np = moved(t.path);
        if (!np) return t;
        monaco.editor.getModels().find((m) => m.uri.path === t.path)?.dispose();
        return { ...t, id: np, path: np };
      }),
    );
    setActiveId((id) => (id && moved(id)) || id);
  };

  const onDeleted = (path: string) => {
    const gone = (p: string) => p === path || p.startsWith(path + "/");
    tabs.filter((t) => t.kind === "file" && gone(t.path)).forEach((t) => {
      if (t.kind === "file") monaco.editor.getModels().find((m) => m.uri.path === t.path)?.dispose();
    });
    const rest = tabs.filter((t) => !(t.kind === "file" && gone(t.path)));
    setTabs(rest);
    if (activeId && !rest.some((t) => t.id === activeId)) setActiveId(rest[rest.length - 1]?.id ?? null);
  };

  // "Claude oturumuna ekle": the active Claude tab, else the newest one, else a new session
  const sendToClaude = (paths: string[]) => {
    const claudeTabs = tabs.filter((t) => t.kind === "terminal" && t.command?.startsWith("claude"));
    const tab = claudeTabs.find((t) => t.id === activeId) ?? claudeTabs[claudeTabs.length - 1];
    if (!tab) {
      openClaude();
      setError("Yeni Claude oturumu açıldı; hazır olunca dosyayı tekrar ekleyebilirsin.");
      return;
    }
    setActiveId(tab.id);
    document
      .querySelector(`.center-terminal[data-tab-id="${tab.id}"] [${DROP_ATTR}]`)
      ?.dispatchEvent(new CustomEvent(DROP_EVENT, { detail: paths }));
  };

  const openMenu = (e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const closeTabs = (ids: string[]) => {
    const closing = tabs.filter((t) => ids.includes(t.id));
    // Unsaved files stay open; everything else closes
    const toClose = closing.filter((t) => !isDirty(t)).map((t) => t.id);
    closing.forEach((t) => {
      if (t.kind === "file" && toClose.includes(t.id)) monaco.editor.getModels().find((m) => m.uri.path === t.path)?.dispose();
    });
    const rest = tabs.filter((t) => !toClose.includes(t.id));
    setTabs(rest);
    if (activeId && toClose.includes(activeId)) setActiveId(rest[rest.length - 1]?.id ?? null);
    if (toClose.length < ids.length) setError("Kaydedilmemiş dosyalar açık bırakıldı");
  };

  const tabMenu = (e: React.MouseEvent, tab: Tab): void => {
    const idx = tabs.findIndex((t) => t.id === tab.id);
    const path = tab.kind === "file" || tab.kind === "diff" ? tab.path : tab.kind === "terminal" ? tab.cwd : null;
    openMenu(e, [
      { label: "Kapat", shortcut: "⌘W", onClick: () => closeTab(tab.id) },
      { label: "Diğerlerini kapat", onClick: () => closeTabs(tabs.filter((t) => t.id !== tab.id).map((t) => t.id)) },
      { label: "Sağdakileri kapat", onClick: () => closeTabs(tabs.slice(idx + 1).map((t) => t.id)) },
      { label: "Kaydedilenleri kapat", onClick: () => closeTabs(tabs.filter((t) => !isDirty(t)).map((t) => t.id)) },
      { label: "Tümünü kapat", onClick: () => closeTabs(tabs.map((t) => t.id)) },
      "separator",
      ...(path
        ? ([
            { label: "Yolu kopyala", onClick: () => navigator.clipboard.writeText(path) },
            { label: "Göreli yolu kopyala", onClick: () => navigator.clipboard.writeText(relativeTo(root ?? "", path)) },
            { label: "Finder'da göster", onClick: () => api.revealInFinder(path) },
          ] as MenuItem[])
        : []),
      ...(tab.kind === "file"
        ? ([{ label: "Claude oturumuna ekle", onClick: () => sendToClaude([tab.path]) }] as MenuItem[])
        : []),
    ]);
  };

  const reloadRef = useRef(reloadFiles);
  reloadRef.current = reloadFiles;

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

  // Optional auto-save, one second after typing stops
  useEffect(() => {
    if (!activeFile || !isDirty(activeFile) || !getSettings().autoSave) return;
    const t = setTimeout(save, 1000);
    return () => clearTimeout(t);
  }, [activeFile, save]);

  // External changes (git checkout, Claude edits) reload open tabs without unsaved edits
  useEffect(() => {
    const unlisten = listen<string[]>("fs-changed", (e) => {
      const changed = new Set(e.payload);
      const open = tabsRef.current.filter((t) => t.kind === "file" && changed.has(t.path)).map((t) => (t as FileTab).path);
      if (open.length) reloadRef.current(open);
      if (e.payload.some((p) => !p.includes("/node_modules/"))) refreshGit();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [refreshGit]);

  // Finder drops land on whatever terminal is under the pointer
  useEffect(() => {
    if (!inTauri) return;
    const unlisten = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type !== "drop") return;
      const ratio = window.devicePixelRatio || 1;
      dropAt(e.payload.position.x / ratio, e.payload.position.y / ratio, e.payload.paths);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Closing the window with unsaved files asks first
  useEffect(() => {
    if (!inTauri) return;
    const unlisten = getCurrentWindow().onCloseRequested(async (e) => {
      const dirty = tabsRef.current.filter(isDirty);
      if (!dirty.length) return;
      const ok = await ask(`${dirty.length} dosyada kaydedilmemiş değişiklik var. Yine de kapatılsın mı?`, {
        title: "Kite",
        kind: "warning",
        okLabel: "Kaydetmeden kapat",
        cancelLabel: "Vazgeç",
      });
      if (!ok) e.preventDefault();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const togglePanel = useCallback(() => {
    if (!panelOpen && terms.length === 0) newTerminal();
    else setPanelOpen((p) => !p);
  }, [panelOpen, terms.length, newTerminal]);

  // One action table for both the menu bar and keyboard shortcuts
  const actions: Record<string, () => void> = {
    settings: () => setSettingsOpen(true),
    open_folder: openFolder,
    quick_open: () => root && setQuickOpen(""),
    command_palette: () => root && setQuickOpen(">"),
    goto_line: () => root && activeFile && setQuickOpen(":"),
    zoom_in: () => zoom(1),
    zoom_out: () => zoom(-1),
    zoom_reset: () => zoom("reset"),
    save: () => save(),
    close_tab: () => activeId && closeTab(activeId),
    view_files: () => root && showView("files"),
    view_search: () => root && showView("search"),
    view_git: () => root && showView("git"),
    view_claude: () => root && showView("claude"),
    new_claude: () => openClaude(),
    toggle_sidebar: () => setSidebarOpen((s) => !s),
    toggle_terminal: togglePanel,
    new_terminal: () => newTerminal(),
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
      ",": "settings", o: "open_folder", p: "quick_open", s: "save", w: "close_tab", g: "goto_line",
      "=": "zoom_in", "+": "zoom_in", "-": "zoom_out", "0": "zoom_reset",
      b: "toggle_sidebar", j: "toggle_terminal", t: "new_terminal", l: "new_claude",
    };
    const shiftKeys: Record<string, string> = {
      e: "view_files", f: "view_search", g: "view_git", c: "view_claude", p: "command_palette",
    };
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

  const commands: Command[] = [
    { id: "new_claude", label: "Claude: Yeni oturum", shortcut: "⌘L", run: () => runAction("new_claude") },
    { id: "view_claude", label: "Claude: Oturumları göster", shortcut: "⌘⇧C", run: () => runAction("view_claude") },
    { id: "quick_open", label: "Dosyaya git", shortcut: "⌘P", run: () => setTimeout(() => setQuickOpen(""), 0) },
    { id: "goto_line", label: "Satıra git", shortcut: "⌘G", run: () => setTimeout(() => setQuickOpen(":"), 0) },
    { id: "save", label: "Dosya: Kaydet", shortcut: "⌘S", run: () => runAction("save") },
    { id: "close_tab", label: "Sekmeyi kapat", shortcut: "⌘W", run: () => runAction("close_tab") },
    { id: "close_all", label: "Tüm sekmeleri kapat", run: () => closeTabs(tabs.map((t) => t.id)) },
    { id: "open_folder", label: "Klasör aç", shortcut: "⌘O", run: () => runAction("open_folder") },
    { id: "view_files", label: "Görünüm: Gezgin", shortcut: "⌘⇧E", run: () => runAction("view_files") },
    { id: "view_search", label: "Görünüm: Projede ara", shortcut: "⌘⇧F", run: () => runAction("view_search") },
    { id: "view_git", label: "Görünüm: Kaynak kontrolü", shortcut: "⌘⇧G", run: () => runAction("view_git") },
    { id: "git_history", label: "Git: Geçmişi göster", run: showHistory },
    { id: "git_refresh", label: "Git: Durumu yenile", run: () => refreshGit() },
    { id: "toggle_sidebar", label: "Görünüm: Kenar çubuğunu aç/kapat", shortcut: "⌘B", run: () => runAction("toggle_sidebar") },
    { id: "toggle_terminal", label: "Terminal: Aç/kapat", shortcut: "⌘J", run: () => runAction("toggle_terminal") },
    { id: "new_terminal", label: "Terminal: Yeni terminal", shortcut: "⌘T", run: () => runAction("new_terminal") },
    { id: "zoom_in", label: "Yazıyı büyüt", shortcut: "⌘+", run: () => zoom(1) },
    { id: "zoom_out", label: "Yazıyı küçült", shortcut: "⌘-", run: () => zoom(-1) },
    { id: "zoom_reset", label: "Yazı boyutunu sıfırla", shortcut: "⌘0", run: () => zoom("reset") },
    { id: "settings", label: "Ayarlar", shortcut: "⌘,", run: () => setSettingsOpen(true) },
    ...(activeFile
      ? [
          { id: "reveal", label: "Aktif dosyayı Finder'da göster", run: () => api.revealInFinder(activeFile.path) },
          { id: "copy_path", label: "Aktif dosyanın yolunu kopyala", run: () => navigator.clipboard.writeText(activeFile.path) },
          { id: "send_claude", label: "Aktif dosyayı Claude oturumuna ekle", run: () => sendToClaude([activeFile.path]) },
        ]
      : []),
    ...recentProjects()
      .filter((p) => p !== root)
      .map((p) => ({ id: `project:${p}`, label: `Proje aç: ${basename(p)}  —  ${p.replace(/^\/Users\/[^/]+/, "~")}`, run: () => switchRoot(p) })),
  ];

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
          {recentProjects().length > 0 && (
            <div className="recent-projects">
              <div className="recent-title">Son projeler</div>
              {recentProjects().map((p) => (
                <button key={p} className="recent-project" onClick={() => switchRoot(p)}>
                  <span>{basename(p)}</span>
                  <span className="recent-path">{dirname(p).replace(/^\/Users\/[^/]+/, "~")}</span>
                </button>
              ))}
            </div>
          )}
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
          gitBadge={gitStatus?.changes.length ?? 0}
          onView={(v) => {
            if (v === view && sidebarOpen) setSidebarOpen(false);
            else showView(v);
          }}
        />
        {sidebarOpen && (
          <>
            <div className="sidebar" style={{ width: sidebarW }}>
              {/* All views stay mounted so their state survives switching */}
              <div className="sidebar-view" style={{ display: view === "files" ? "flex" : "none" }}>
                <FileTree
                  root={root}
                  activePath={activeFile?.path ?? null}
                  onOpenFile={openFile}
                  decorations={decorations}
                  openMenu={openMenu}
                  onRenamed={onRenamed}
                  onDeleted={onDeleted}
                  onOpenTerminal={(dir) => newTerminal({ cwd: dir })}
                  onSendToClaude={sendToClaude}
                  onError={setError}
                />
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
              <div className="sidebar-view" style={{ display: view === "claude" ? "flex" : "none" }}>
                <ClaudeSessions
                  root={root}
                  visible={view === "claude"}
                  openSessionIds={openSessionIds}
                  onResume={openClaude}
                  onNew={() => openClaude()}
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
              root={root}
              onTabMenu={tabMenu}
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
      </div>
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      {quickOpen !== null && (
        <QuickOpen
          root={root}
          recent={recent}
          commands={commands}
          initialQuery={quickOpen}
          onOpen={openFile}
          onGotoLine={(line) => activeFile && setReveal({ path: activeFile.path, line, start: 0, end: 0, nonce: Date.now() })}
          onClose={() => setQuickOpen(null)}
        />
      )}
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
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
          { label: "✦ Claude", title: "Yeni Claude oturumu (⌘L)", on: false, fn: () => openClaude() },
          { label: "⚙", title: "Ayarlar (⌘,)", on: settingsOpen, fn: () => setSettingsOpen(true) },
        ]}
      />
    </div>
  );
}
