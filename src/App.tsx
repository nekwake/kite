import { useCallback, useEffect, useRef, useState } from "react";
import * as monaco from "monaco-editor";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { api, basename } from "./lib/api";
import { languageFor } from "./lib/monaco";
import { FileTree } from "./components/FileTree";
import { EditorArea, Reveal, Tab } from "./components/EditorArea";
import { QuickOpen } from "./components/QuickOpen";
import { SearchView } from "./components/SearchView";
import { KiteMark } from "./components/KiteLogo";
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
  const [activePath, setActivePath] = useState<string | null>(null);
  const [cursor, setCursor] = useState<[number, number]>([1, 1]);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState(0);

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
    setActivePath(null);
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

  // Most recently focused files first, for the empty ⌘P list
  useEffect(() => {
    if (activePath) setRecent((r) => [activePath, ...r.filter((p) => p !== activePath)].slice(0, 20));
  }, [activePath]);

  const openFile = async (path: string): Promise<boolean> => {
    if (tabs.some((t) => t.path === path)) {
      setActivePath(path);
      return true;
    }
    try {
      const content = await api.readFile(path);
      setTabs((ts) => (ts.some((t) => t.path === path) ? ts : [...ts, { path, content, saved: content }]));
      setActivePath(path);
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

  const showSearch = () => {
    setView("search");
    setSidebarOpen(true);
    setSearchFocus((n) => n + 1);
  };

  const closeTab = async (path: string) => {
    const tab = tabs.find((t) => t.path === path);
    if (tab && tab.content !== tab.saved) {
      const ok = await ask(`${basename(path)} kaydedilmemiş değişiklikler içeriyor. Yine de kapatılsın mı?`, {
        title: "Kite",
        kind: "warning",
        okLabel: "Kapat",
        cancelLabel: "Vazgeç",
      });
      if (!ok) return;
    }
    monaco.editor.getModels().find((m) => m.uri.path === path)?.dispose();
    const idx = tabs.findIndex((t) => t.path === path);
    const rest = tabs.filter((t) => t.path !== path);
    setTabs(rest);
    if (activePath === path) setActivePath(rest[Math.min(idx, rest.length - 1)]?.path ?? null);
  };

  const save = useCallback(async () => {
    const tab = tabs.find((t) => t.path === activePath);
    if (!tab) return;
    try {
      await api.writeFile(tab.path, tab.content);
      setTabs((ts) => ts.map((t) => (t.path === tab.path ? { ...t, saved: tab.content } : t)));
      setError(null);
    } catch (e) {
      setError(`Kaydedilemedi: ${e}`);
    }
  }, [tabs, activePath]);

  const togglePanel = useCallback(() => {
    if (!panelOpen && terms.length === 0) newTerminal();
    else setPanelOpen((p) => !p);
  }, [panelOpen, terms.length, newTerminal]);

  // Capture phase so shortcuts win over Monaco and xterm
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (!e.metaKey || e.altKey || e.ctrlKey) return;
    const actions: Record<string, () => void> = {
      s: save,
      o: openFolder,
      b: () => setSidebarOpen((s) => !s),
      j: togglePanel,
      t: () => newTerminal(),
      l: () => setAgentOpen((a) => !a),
      p: () => root && setQuickOpen(true),
    };
    const shiftActions: Record<string, () => void> = {
      f: () => root && showSearch(),
    };
    const action = (e.shiftKey ? shiftActions : actions)[e.key.toLowerCase()];
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      action();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);

  if (!root) {
    return (
      <div className="app">
        <TitleBar title="Kite" />
        <div className="welcome">
          <div className="brand"><KiteMark size={88} /><span className="wordmark">Kite</span></div>
          <p>Hafif, hızlı, Claude ile entegre kod editörü.</p>
          <button className="primary-btn" onClick={openFolder}>Klasör aç (⌘O)</button>
        </div>
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.path === activePath);

  return (
    <div className="app">
      <TitleBar title={activeTab ? `${basename(activeTab.path)} — ${basename(root)}` : basename(root)} />
      <div className="workbench">
        <ActivityBar
          view={view}
          sidebarOpen={sidebarOpen}
          agentOpen={agentOpen}
          onView={(v) => {
            if (v === view && sidebarOpen) setSidebarOpen(false);
            else if (v === "search") showSearch();
            else {
              setView(v);
              setSidebarOpen(true);
            }
          }}
          onToggleAgent={() => setAgentOpen((a) => !a)}
        />
        {sidebarOpen && (
          <>
            <div className="sidebar" style={{ width: sidebarW }}>
              {/* Both stay mounted so the search query survives switching views */}
              <div className="sidebar-view" style={{ display: view === "files" ? "flex" : "none" }}>
                <FileTree root={root} activePath={activePath} onOpenFile={openFile} />
              </div>
              <div className="sidebar-view" style={{ display: view === "search" ? "flex" : "none" }}>
                <SearchView root={root} focusNonce={searchFocus} onOpenMatch={openMatch} />
              </div>
            </div>
            <Resizer dir="x" onDrag={(d) => setSidebarW((w) => clamp(w + d, 160, 600))} />
          </>
        )}
        <div className="main">
          <div className="main-editor">
            <EditorArea
              tabs={tabs}
              activePath={activePath}
              onSelect={setActivePath}
              onClose={closeTab}
              onChange={(path, content) =>
                setTabs((ts) => ts.map((t) => (t.path === path ? { ...t, content } : t)))
              }
              onCursor={(l, c) => setCursor([l, c])}
              reveal={reveal}
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
      {quickOpen && (
        <QuickOpen root={root} recent={recent} onOpen={openFile} onClose={() => setQuickOpen(false)} />
      )}
      <StatusBar
        left={[root.replace(/^\/Users\/[^/]+/, "~"), ...(error ? [`⚠ ${error}`] : [])]}
        right={
          activeTab
            ? [`Sat ${cursor[0]}, Süt ${cursor[1]}`, languageFor(activeTab.path), "UTF-8"]
            : []
        }
      />
    </div>
  );
}
