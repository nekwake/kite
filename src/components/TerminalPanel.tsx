import { ReactNode, useEffect, useLayoutEffect, useRef } from "react";
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
};

export function TerminalPanel(props: Props) {
  const { view, tabs, activeId } = props;
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
        {view === "terminal" && (
          <div className="panel-tabs">
            {tabs.map((t) => (
              <div
                key={t.id}
                className={`panel-tab ${t.id === activeId ? "active" : ""}`}
                onClick={() => props.onSelect(t.id)}
              >
                <span>{t.title}{t.panes.length > 1 ? ` (${t.panes.length})` : ""}</span>
                <button
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onClose(t.id);
                  }}
                >
                  <span className="x">×</span>
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="panel-actions">
          {view === "terminal" && (
            <>
              <button className="icon-btn" onClick={props.onNew} title="Yeni terminal (⌘T)">+</button>
              <button className="icon-btn" onClick={props.onSplit} title="Terminali böl (⌘\)" disabled={!tabs.length}>⫿</button>
            </>
          )}
          <button className="icon-btn" onClick={props.onHide} title="Paneli gizle (⌘J)">⌄</button>
        </div>
      </div>
      <div className="panel-body" style={{ display: view === "terminal" ? "block" : "none" }}>
        {tabs.map((t) => (
          <div key={t.id} className="pane-row" style={{ display: t.id === activeId ? "flex" : "none" }}>
            {t.panes.map((p, i) => (
              <div key={p.id} className="pane">
                {i > 0 && <div className="pane-sep" />}
                <TerminalView tab={p} active={t.id === activeId && view === "terminal"} onExit={() => props.onClosePane(t.id, p.id)} />
                {t.panes.length > 1 && (
                  <button className="pane-close icon-btn" title="Bu bölmeyi kapat" onClick={() => props.onClosePane(t.id, p.id)}>×</button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      {view === "problems" && <div className="panel-body problems-body">{props.problems}</div>}
    </div>
  );
}

/** A bottom-panel terminal; it lives as long as this component */
function TerminalView({ tab, active, onExit }: { tab: Omit<Pane, "id">; active: boolean; onExit: () => void }) {
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
      session.current?.focus();
    });
  }, [active]);

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
