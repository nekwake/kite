// Small layout pieces: title bar, activity bar, status bar, resizer, agent panel

import { useRef } from "react";

export function TitleBar({ title }: { title: string }) {
  return (
    <div className="titlebar" data-tauri-drag-region>
      <span data-tauri-drag-region>{title}</span>
    </div>
  );
}

const icons = {
  files: (
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" />
  ),
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  git: (
    <><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="8" r="2.5" /><path d="M6 8.5v7M18 10.5c0 4-6 3-11 6" /></>
  ),
  agent: <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />,
};

export type View = "files" | "search" | "git";

type ActivityProps = {
  view: View;
  sidebarOpen: boolean;
  agentOpen: boolean;
  onView: (v: View) => void;
  onToggleAgent: () => void;
};

export function ActivityBar({ view, sidebarOpen, agentOpen, onView, onToggleAgent }: ActivityProps) {
  const item = (v: View, title: string, disabled = false) => (
    <button
      className={`activity-item ${sidebarOpen && view === v ? "active" : ""}`}
      title={disabled ? `${title} (yakında)` : title}
      disabled={disabled}
      onClick={() => onView(v)}
    >
      <Icon name={v} />
    </button>
  );
  return (
    <div className="activity-bar">
      {item("files", "Dosyalar (⌘B)")}
      {item("search", "Arama", true)}
      {item("git", "Git", true)}
      <div style={{ flex: 1 }} />
      <button
        className={`activity-item ${agentOpen ? "active" : ""}`}
        title="Agent (⌘L)"
        onClick={onToggleAgent}
      >
        <Icon name="agent" />
      </button>
    </div>
  );
}

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
}

export function StatusBar({ left, right }: { left: string[]; right: string[] }) {
  return (
    <div className="statusbar">
      <div>{left.map((s) => <span key={s}>{s}</span>)}</div>
      <div>{right.map((s) => <span key={s}>{s}</span>)}</div>
    </div>
  );
}

/** Drag handle between panes; reports incremental pixel movement. */
export function Resizer({ dir, onDrag }: { dir: "x" | "y"; onDrag: (delta: number) => void }) {
  const last = useRef(0);
  return (
    <div
      className={`resizer resizer-${dir}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = dir === "x" ? e.clientX : e.clientY;
        document.body.classList.add(`resizing-${dir}`);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const pos = dir === "x" ? e.clientX : e.clientY;
        onDrag(pos - last.current);
        last.current = pos;
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        document.body.classList.remove(`resizing-${dir}`);
      }}
    />
  );
}

export function AgentPanel({ onLaunchClaude, disabled }: { onLaunchClaude: () => void; disabled: boolean }) {
  return (
    <div className="agent">
      <div className="sidebar-header">
        <span>AGENT</span>
        <select className="model-select" disabled defaultValue="claude">
          <option value="claude">Claude Code</option>
          <option value="openrouter">OpenRouter (yakında)</option>
        </select>
      </div>
      <div className="agent-body">
        <p>
          Entegre Claude sohbeti (tool call kartları, MCP listesi, diff onayı) ve OpenRouter
          modelleri sonraki aşamalarda burada olacak.
        </p>
        <p>Şimdilik Claude Code'u bu projede bir terminal sekmesinde açabilirsin:</p>
        <button className="primary-btn" onClick={onLaunchClaude} disabled={disabled}>
          Claude Code'u başlat
        </button>
      </div>
    </div>
  );
}
