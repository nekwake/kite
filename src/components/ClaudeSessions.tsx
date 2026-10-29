import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "../lib/i18n";
import { Chevron, Icon } from "../lib/icons";
import { basename, claude, ClaudeSession } from "../lib/api";
import { KiteLoader } from "./KiteLogo";

type Scope = "project" | "all";

type Props = {
  root: string;
  visible: boolean;
  openSessionIds: Set<string>;
  onResume: (s: ClaudeSession) => void;
  onNew: () => void;
};

const SCOPE_KEY = "kite.sessionScope";

export function ClaudeSessions({ root, visible, openSessionIds, onResume, onNew }: Props) {
  const [scope, setScope] = useState<Scope>(() => {
    try {
      return localStorage.getItem(SCOPE_KEY) === "all" ? "all" : "project";
    } catch {
      return "project";
    }
  });
  const [sessions, setSessions] = useState<ClaudeSession[] | null>(null);
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setSessions(await claude.sessions(scope === "project" ? root : null));
    } catch {
      setSessions([]);
    }
  }, [root, scope]);

  // New sessions and fresh titles show up while the list is on screen
  useEffect(() => {
    if (!visible) return;
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [visible, load]);

  const changeScope = (s: Scope) => {
    setScope(s);
    setSessions(null);
    try {
      localStorage.setItem(SCOPE_KEY, s);
    } catch {}
  };

  const groups = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase("tr");
    const list = (sessions ?? []).filter(
      (s) => !q || `${s.title} ${s.lastPrompt ?? ""} ${s.cwd}`.toLocaleLowerCase("tr").includes(q),
    );
    const out = new Map<string, ClaudeSession[]>();
    for (const s of list) {
      const key = scope === "all" ? s.cwd : dateBucket(s.updated);
      out.set(key, [...(out.get(key) ?? []), s]);
    }
    return [...out.entries()];
  }, [sessions, filter, scope]);

  const toggleGroup = (key: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <div className="sidebar-section">
      <div className="sidebar-header">
        <span>{t("CLAUDE OTURUMLARI")}</span>
        <div className="header-actions">
          <button className="icon-btn" onClick={load} title={t("Yenile")}><Icon name="refresh" /></button>
        </div>
      </div>

      <div className="sessions-top">
        <button className="primary-btn sessions-new" onClick={onNew}>{t("+ Yeni oturum")} <kbd>{t("⌘L")}</kbd></button>
        <div className="segmented">
          <button className={scope === "project" ? "on" : ""} onClick={() => changeScope("project")}>{t("Bu proje")}</button>
          <button className={scope === "all" ? "on" : ""} onClick={() => changeScope("all")}>{t("Tüm projeler")}</button>
        </div>
        <input
          className="search-input sessions-filter"
          placeholder={t("Oturumlarda ara")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="tree">
        {sessions === null && <div className="git-empty"><KiteLoader size={18} label={t("Oturumlar okunuyor…")} /></div>}
        {sessions && groups.length === 0 && (
          <div className="git-empty">
            {filter ? "Eşleşen oturum yok" : scope === "project" ? `${basename(root)} için henüz Claude oturumu yok.` : "Henüz Claude oturumu yok."}
          </div>
        )}
        {groups.map(([key, items]) => {
          const open = !collapsed.has(key);
          return (
            <div key={key} className="session-group">
              <div className="tree-row change-group-head" onClick={() => toggleGroup(key)} title={scope === "all" ? key : undefined}>
                <span className="tree-chevron"><Chevron open={open} /></span>
                <span>{scope === "all" ? basename(key) : key}</span>
                <span className="search-count">{items.length}</span>
              </div>
              {open &&
                items.map((s) => (
                  <div
                    key={s.id}
                    className={`session ${openSessionIds.has(s.id) ? "open" : ""} ${s.cwdExists ? "" : "missing"}`}
                    onClick={() => s.cwdExists && onResume(s)}
                    title={s.cwdExists ? `${s.cwd}\n${s.lastPrompt ?? ""}` : `Klasör artık yok: ${s.cwd}`}
                  >
                    <div className="session-title">
                      {openSessionIds.has(s.id) && <span className="session-dot" />}
                      <span>{s.title}</span>
                    </div>
                    {s.lastPrompt && s.lastPrompt !== s.title && <div className="session-prompt">{s.lastPrompt}</div>}
                    <div className="session-meta">
                      <span>{relativeTime(s.updated)}</span>
                      <span>{s.prompts} mesaj</span>
                      {s.branch && s.branch !== "HEAD" && <span>⎇ {s.branch}</span>}
                      {s.entrypoint === "claude-desktop" && <span className="session-badge" title={t("Claude masaüstü uygulamasında başlatıldı")}>{t("masaüstü")}</span>}
                    </div>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function dateBucket(sec: number): string {
  const d = new Date(sec * 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return "Bugün";
  if (days === 1) return "Dün";
  if (days < 7) return "Bu hafta";
  if (days < 30) return "Bu ay";
  return "Daha eski";
}

function relativeTime(sec: number): string {
  const diff = Date.now() / 1000 - sec;
  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} gün önce`;
  return new Date(sec * 1000).toLocaleDateString("tr-TR");
}
