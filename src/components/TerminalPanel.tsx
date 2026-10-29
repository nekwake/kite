import { useEffect, useLayoutEffect, useRef } from "react";
import { createTerminal, ensureTerminal, TerminalSession } from "../lib/terminals";

export type TermTab = { id: number; title: string; cwd: string; command?: string };

type Props = {
  tabs: TermTab[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onClose: (id: number) => void;
  onHide: () => void;
};

export function TerminalPanel({ tabs, activeId, onSelect, onNew, onClose, onHide }: Props) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-tabs">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={`panel-tab ${t.id === activeId ? "active" : ""}`}
              onClick={() => onSelect(t.id)}
            >
              <span>{t.title}</span>
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.id);
                }}
              >
                <span className="x">×</span>
              </button>
            </div>
          ))}
        </div>
        <div className="panel-actions">
          <button className="icon-btn" onClick={onNew} title="Yeni terminal (⌘T)">+</button>
          <button className="icon-btn" onClick={onHide} title="Paneli gizle (⌘J)">⌄</button>
        </div>
      </div>
      <div className="panel-body">
        {tabs.map((t) => (
          <TerminalView key={t.id} tab={t} active={t.id === activeId} onExit={() => onClose(t.id)} />
        ))}
      </div>
    </div>
  );
}

/** A bottom-panel terminal; it lives as long as this component */
function TerminalView({ tab, active, onExit }: { tab: Omit<TermTab, "id" | "title">; active: boolean; onExit: () => void }) {
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

  return <div ref={hostRef} className="terminal-slot" style={{ display: active ? "block" : "none" }} />;
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
