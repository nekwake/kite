// Small layout pieces: title bar, activity bar, status bar, resizer

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
  claude: <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />,
};

export type View = "files" | "search" | "git" | "claude";

type ActivityProps = {
  view: View;
  sidebarOpen: boolean;
  gitBadge: number;
  onView: (v: View) => void;
  onSettings: () => void;
};

export function ActivityBar({ view, sidebarOpen, gitBadge, onView, onSettings }: ActivityProps) {
  const item = (v: View, title: string, badge = 0) => (
    <button
      className={`activity-item ${sidebarOpen && view === v ? "active" : ""}`}
      title={title}
      onClick={() => onView(v)}
    >
      <Icon name={v} />
      {badge > 0 && <span className="activity-badge">{badge > 99 ? "99+" : badge}</span>}
    </button>
  );
  return (
    <div className="activity-bar">
      {item("files", "Dosyalar (⌘⇧E)")}
      {item("search", "Ara (⌘⇧F)")}
      {item("git", "Kaynak kontrolü (⌘⇧G)", gitBadge)}
      {item("claude", "Claude oturumları (⌘⇧C)")}
      <div style={{ flex: 1 }} />
      <button className="activity-item" title="Ayarlar (⌘,)" onClick={onSettings}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
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

type Toggle = { label: string; title: string; on: boolean; fn: () => void };

export function StatusBar({ left, right, toggles }: { left: string[]; right: string[]; toggles: Toggle[] }) {
  return (
    <div className="statusbar">
      <div>{left.map((s) => <span key={s}>{s}</span>)}</div>
      <div>
        {right.map((s) => <span key={s}>{s}</span>)}
        <span className="status-toggles">
          {toggles.map((t) => (
            <button key={t.label} className={`status-toggle ${t.on ? "on" : ""}`} title={t.title} onClick={t.fn}>
              {t.label}
            </button>
          ))}
        </span>
      </div>
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
