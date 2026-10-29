import { useEffect, useRef, useState } from "react";
import { clearNotices, dismissNotice, markNoticesRead, useNotices } from "../lib/notifications";
import { updateSettings, useSettings } from "../lib/settings";
import { Icon } from "../lib/icons";
import { t } from "../lib/i18n";

/** Bell at the right end of the status bar with the notification list above it */
export function NotificationBell() {
  const { items, unread } = useNotices();
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    markNoticesRead();
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close, true);
    window.addEventListener("keydown", close, true);
    return () => {
      window.removeEventListener("mousedown", close, true);
      window.removeEventListener("keydown", close, true);
    };
  }, [open, items.length]);

  return (
    <div className="bell" ref={ref}>
      <button
        className={`status-toggle bell-btn ${unread ? "has-unread" : ""}`}
        onClick={() => setOpen(!open)}
        title={settings.doNotDisturb ? t("Bildirimler (rahatsız etme açık)") : t("Bildirimler")}
      >
        <Icon name={settings.doNotDisturb ? "bellOff" : "bell"} size={14} />
        {unread > 0 && <span className="bell-count">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel">
          <div className="bell-head">
            <span>{t("BİLDİRİMLER")}</span>
            <button
              className={`icon-btn ${settings.doNotDisturb ? "on" : ""}`}
              title={settings.doNotDisturb ? t("Rahatsız etme: açık") : t("Rahatsız etme")}
              onClick={() => updateSettings({ doNotDisturb: !settings.doNotDisturb })}
            >
              <Icon name={settings.doNotDisturb ? "bellOff" : "bell"} size={14} />
            </button>
            <button className="icon-btn" title={t("Tümünü temizle")} onClick={clearNotices} disabled={!items.length}>
              <Icon name="trash" size={14} />
            </button>
          </div>
          <div className="bell-list">
            {items.length === 0 && <div className="bell-empty">{t("Yeni bildirim yok")}</div>}
            {items.map((n) => (
              <div key={n.id} className={`bell-item ${n.kind}`}>
                <span className="bell-icon">{n.kind === "error" ? "⊗" : n.kind === "success" ? "✓" : "ⓘ"}</span>
                <div className="bell-text">
                  <b>{n.title}</b>
                  {n.body && <span>{n.body}</span>}
                  <small>{ago(n.time)}</small>
                </div>
                <button className="icon-btn" title={t("Kapat")} onClick={() => dismissNotice(n.id)}>
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
          {settings.doNotDisturb && <div className="bell-dnd">{t("Rahatsız etme açık: masaüstü bildirimi gösterilmiyor")}</div>}
        </div>
      )}
    </div>
  );
}

function ago(ms: number) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return t("az önce");
  if (s < 3600) return `${Math.floor(s / 60)} ${t("dk önce")}`;
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
