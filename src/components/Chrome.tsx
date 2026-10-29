// Small layout pieces: title bar, activity bar, status bar, resizer
import { isWindows } from "../lib/platform";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { t } from "../lib/i18n";

import { ReactNode, useRef } from "react";
import { Icon as LineIcon } from "../lib/icons";

/** Title bar with a centered command-center button, like VS Code; it opens ⌘P */
export type UpdateInfo = { version: string; progress: number | null; onInstall: () => void };

export function TitleBar({ label, onSearch, update }: { label: string; onSearch?: () => void; update?: UpdateInfo | null }) {
  return (
    <div className={`titlebar ${isWindows ? "titlebar-win" : ""}`} data-tauri-drag-region>
      {isWindows && <WindowControls />}
      {update && (
        <button
          className="update-btn"
          onClick={update.onInstall}
          disabled={update.progress !== null}
          title={`Kite ${update.version}`}
        >
          <LineIcon name="download" size={13} />
          {update.progress === null ? `${t("Güncelle")} · ${update.version}` : `${t("İndiriliyor")} ${update.progress}%`}
        </button>
      )}
      {onSearch ? (
        <button className="command-center" onClick={onSearch} title={t("Dosyaya git (⌘P) · Komutlar (⌘⇧P)")}>
          <LineIcon name="search" size={14} />
          <span>{label}</span>
        </button>
      ) : (
        <span className="titlebar-label" data-tauri-drag-region>{label}</span>
      )}
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
  onChat: () => void;
};

export function ActivityBar({ view, sidebarOpen, gitBadge, onView, onSettings, onChat }: ActivityProps) {
  const item = (v: View, title: string, badge = 0) => (
    <button
      className={`activity-item ${sidebarOpen && view === v ? "active" : ""}`}
      title={t(title)}
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
      <button className="activity-item" title={t("OpenRouter sohbeti (⌘⇧L)")} onClick={onChat}>
        <LineIcon name="chat" size={20} />
      </button>
      <div style={{ flex: 1 }} />
      <button className="activity-item" title={t("Ayarlar (⌘,)")} onClick={onSettings}>
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

type Toggle = { label: ReactNode; title: string; on: boolean; fn: () => void };

type StatusItem = string | { label: string; title: string; onClick: () => void };

export function StatusBar({ left, right, toggles, usage }: { left: StatusItem[]; right: string[]; toggles: Toggle[]; usage?: ReactNode }) {
  return (
    <div className="statusbar">
      <div>
        {left.map((s) =>
          typeof s === "string" ? (
            <span key={s}>{s}</span>
          ) : (
            <button key={s.title} className="status-toggle" title={t(s.title)} onClick={s.onClick}>{s.label}</button>
          ),
        )}
      </div>
      <div>
        {right.map((s) => <span key={s}>{s}</span>)}
        {usage}
        <span className="status-toggles">
          {toggles.map((tg) => (
            <button key={tg.title} className={`status-toggle ${tg.on ? "on" : ""}`} title={t(tg.title)} onClick={tg.fn}>
              {tg.label}
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

/** Windows draws no title bar for Kite (decorations: false), so Kite draws the buttons */
function WindowControls() {
  const win = () => getCurrentWindow();
  return (
    <div className="win-controls">
      <button title={t("Küçült")} onClick={() => win().minimize()}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" /></svg>
      </button>
      <button title={t("Büyüt")} onClick={() => win().toggleMaximize()}>
        <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" /></svg>
      </button>
      <button className="win-close" title={t("Kapat")} onClick={() => win().close()}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" /></svg>
      </button>
    </div>
  );
}
