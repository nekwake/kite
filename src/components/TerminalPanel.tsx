import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createTerminal, ensureTerminal, TerminalSession } from "../lib/terminals";

export type Pane = { id: number; cwd: string; command?: string };
/** A bottom-panel terminal tab: one or more panes side by side */
export type TermTab = { id: number; title: string; panes: Pane[] };

export type PanelView = "terminal" | "problems";

type Props = {
  view: PanelView;
  onView: (v: PanelView) => void;
  problemCount: number;
  problems: ReactNode;
  tabs: TermTab[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onSplit: () => void;
  onClose: (id: number) => void;
  onClosePane: (tabId: number, paneId: number) => void;
  onHide: () => void;
  maximized: boolean;
  onToggleMaximize: () => void;
};

const folderName = (p: string) => p.split("/").filter(Boolean).pop() ?? p;

export function TerminalPanel(props: Props) {
  const { view, tabs, activeId } = props;
  // The pane that last got focus from the list; it takes keyboard focus
  const [focusedPane, setFocusedPane] = useState<number | null>(null);
  const active = tabs.find((t) => t.id === activeId);
  // A new split takes focus, like VS Code
  const paneCount = active?.panes.length ?? 0;
  useEffect(() => {
    if (active) setFocusedPane(active.panes[active.panes.length - 1].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, paneCount]);
  const killTarget = active && (active.panes.find((p) => p.id === focusedPane) ?? active.panes[active.panes.length - 1]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-views">
          <button className={view === "problems" ? "on" : ""} onClick={() => props.onView("problems")}>
            SORUNLAR {props.problemCount > 0 && <span className="search-count">{props.problemCount}</span>}
          </button>
          <button className={view === "terminal" ? "on" : ""} onClick={() => props.onView("terminal")}>
            TERMİNAL
          </button>
        </div>
        <div className="panel-actions">
          {view === "terminal" && (
            <>
              <button className="icon-btn" onClick={props.onNew} title="Yeni terminal (⌘T)">+</button>
              <button className="icon-btn" onClick={props.onSplit} title="Terminali böl (⌘\)" disabled={!tabs.length}>
                <SplitIcon />
              </button>
              <button
                className="icon-btn"
                disabled={!killTarget}
                onClick={() => active && killTarget && props.onClosePane(active.id, killTarget.id)}
                title="Terminali kapat"
              >
                <TrashIcon />
              </button>
              <span className="panel-sep" />
            </>
          )}
          <button className="icon-btn" onClick={props.onToggleMaximize} title={props.maximized ? "Paneli küçült" : "Paneli büyüt"}>
            {props.maximized ? "⤡" : "⤢"}
          </button>
          <button className="icon-btn" onClick={props.onHide} title="Paneli gizle (⌘J)">×</button>
        </div>
      </div>

      <div className="panel-main" style={{ display: view === "terminal" ? "flex" : "none" }}>
        <div className="panel-body">
          {tabs.map((t) => (
            <div key={t.id} className="pane-row" style={{ display: t.id === activeId ? "flex" : "none" }}>
              {t.panes.map((p, i) => (
                <div key={p.id} className="pane" onMouseDown={() => setFocusedPane(p.id)}>
                  {i > 0 && <div className="pane-sep" />}
                  <TerminalView
                    tab={p}
                    active={t.id === activeId && view === "terminal"}
                    focused={focusedPane === p.id}
                    onExit={() => props.onClosePane(t.id, p.id)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Terminal list on the right, like VS Code; split panes are grouped with ┌ └ */}
        <div className="term-list">
          {tabs.map((t) =>
            t.panes.map((p, i) => (
              <div
                key={p.id}
                className={`term-item ${t.id === activeId ? "active" : ""} ${t.id === activeId && (focusedPane ?? t.panes[0].id) === p.id ? "focused" : ""}`}
                onClick={() => {
                  props.onSelect(t.id);
                  setFocusedPane(p.id);
                }}
                title={p.cwd}
              >
                {t.panes.length > 1 && (
                  <span className="term-branch">{i === 0 ? "┌" : i === t.panes.length - 1 ? "└" : "├"}</span>
                )}
                <span className="term-icon">›_</span>
                <span className="term-name">{p.command?.split(" ")[0] ?? "zsh"}</span>
                <span className="term-cwd">{folderName(p.cwd)}</span>
                <span className="term-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="icon-btn"
                    title="Böl"
                    onClick={() => {
                      props.onSelect(t.id);
                      props.onSplit();
                    }}
                  >
                    <SplitIcon />
                  </button>
                  <button className="icon-btn" title="Kapat" onClick={() => props.onClosePane(t.id, p.id)}>
                    <TrashIcon />
                  </button>
                </span>
              </div>
            )),
          )}
        </div>
      </div>
      {view === "problems" && <div className="panel-body problems-body">{props.problems}</div>}
    </div>
  );
}

function SplitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <path d="M8 2.5v11" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v4.5M9.2 6.5v4.5" />
    </svg>
  );
}

/** A bottom-panel terminal; it lives as long as this component */
function TerminalView(props: { tab: Omit<Pane, "id">; active: boolean; focused: boolean; onExit: () => void }) {
  const { tab, active, onExit } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const session = useRef<TerminalSession | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    const s = createTerminal({ cwd: tab.cwd, command: tab.command, onExit: () => onExitRef.current() });
    session.current = s;
    hostRef.current!.appendChild(s.el);
    return () => s.dispose();
    // A terminal lives for the lifetime of its tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      session.current?.refit();
      if (props.focused) session.current?.focus();
    });
  }, [active, props.focused]);

  return <div ref={hostRef} className="terminal-slot" />;
}

/** Shows an editor-area terminal; the session itself survives moves between groups */
export function TerminalSlot(props: { id: string; cwd: string; command?: string; active: boolean; onExit: (id: string) => void }) {
  const { id, cwd, command, active } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const onExitRef = useRef(props.onExit);
  onExitRef.current = props.onExit;
  const session = () => ensureTerminal(id, { cwd, command, onExit: () => onExitRef.current(id) });

  useLayoutEffect(() => {
    const s = session();
    if (s.el.parentElement !== hostRef.current) hostRef.current!.appendChild(s.el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!active) return;
    const s = session();
    requestAnimationFrame(() => {
      s.refit();
      s.focus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, id]);

  return <div ref={hostRef} className="terminal-slot" style={{ display: active ? "block" : "none" }} />;
}
