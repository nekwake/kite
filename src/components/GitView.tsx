import { useEffect, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { Branches, FileChange, git, GitStatus } from "../lib/api";
import { KiteLoader } from "./KiteLogo";

type Props = {
  root: string;
  status: GitStatus | null;
  refresh: () => Promise<void>;
  onOpenDiff: (change: FileChange) => void;
  onOpenFile: (path: string) => void;
  onShowHistory: () => void;
  onDiscarded: (paths: string[]) => void;
};

const STATUS_TITLE: Record<string, string> = {
  M: "Değiştirildi", A: "Eklendi", D: "Silindi", R: "Yeniden adlandırıldı",
  U: "Takip edilmiyor", C: "Çakışma",
};

export function GitView({ root, status, refresh, onOpenDiff, onOpenFile, onShowHistory, onDiscarded }: Props) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branches | null>(null);
  const [newBranch, setNewBranch] = useState<string | null>(null);

  const loadBranches = () => git.branches(root).then(setBranches).catch(() => setBranches(null));
  useEffect(() => {
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, status?.branch]);

  /** Runs a git action with a busy label, then refreshes the status. */
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  if (!status) {
    return <Section title="KAYNAK KONTROLÜ"><div className="git-empty"><KiteLoader size={18} /></div></Section>;
  }

  if (!status.isRepo) {
    return (
      <Section title="KAYNAK KONTROLÜ">
        <div className="git-empty">
          <p>Bu klasör bir git deposu değil.</p>
          <button className="primary-btn" onClick={() => run("init", () => git.init(root))}>Depo oluştur</button>
        </div>
      </Section>
    );
  }

  const staged = status.changes.filter((c) => c.staged);
  const unstaged = status.changes.filter((c) => !c.staged);
  const commitAll = staged.length === 0;
  const canCommit = message.trim() !== "" && status.changes.length > 0 && !busy;

  const commit = async () => {
    if (!canCommit) return;
    if (await run("commit", () => git.commit(root, message.trim(), commitAll))) setMessage("");
  };

  const discard = async (changes: FileChange[]) => {
    const names = changes.length === 1 ? changes[0].rel : `${changes.length} dosya`;
    const untracked = changes.some((c) => c.status === "U");
    const ok = await ask(
      `${names} için yapılan değişiklikler geri alınsın mı?${untracked ? " Takip edilmeyen dosyalar silinecek." : ""} Bu işlem geri alınamaz.`,
      { title: "Kite", kind: "warning", okLabel: "Geri al", cancelLabel: "Vazgeç" },
    );
    if (!ok) return;
    const tracked = changes.filter((c) => c.status !== "U").map((c) => c.path);
    const fresh = changes.filter((c) => c.status === "U").map((c) => c.path);
    await run("discard", async () => {
      if (tracked.length) await git.discard(root, tracked, false);
      if (fresh.length) await git.discard(root, fresh, true);
    });
    onDiscarded(changes.map((c) => c.path));
  };

  const switchBranch = async (value: string) => {
    if (value === "__new__") {
      setNewBranch("");
      return;
    } else if (value !== branches?.current) {
      await run("branch", () => git.switchBranch(root, value, false));
    }
    loadBranches();
  };

  const syncLabel = [status.behind ? `↓${status.behind}` : "", status.ahead ? `↑${status.ahead}` : ""].join(" ").trim();

  return (
    <Section
      title="KAYNAK KONTROLÜ"
      actions={
        <>
          <button className="icon-btn" title="Geçmiş" onClick={onShowHistory}>⎇</button>
          <button className="icon-btn" title="Yenile" onClick={() => refresh()}>↻</button>
        </>
      }
    >
      <div className="git-branch-row">
        <select
          className="git-branch"
          value={branches?.current ?? status.branch ?? ""}
          onChange={(e) => switchBranch(e.target.value)}
          disabled={!!busy}
          title="Branch değiştir"
        >
          {!branches?.local.length && <option value={status.branch ?? ""}>{status.branch ?? "(branch yok)"}</option>}
          {branches?.local.map((b) => <option key={b} value={b}>⎇ {b}</option>)}
          <option value="__new__">+ Yeni branch…</option>
        </select>
        {status.upstream && (
          <>
            <button className="git-sync" disabled={!!busy} onClick={() => run("pull", () => git.sync(root, "pull"))} title={`${status.upstream} üzerinden çek (pull)`}>
              ↓{status.behind || ""}
            </button>
            <button className="git-sync" disabled={!!busy} onClick={() => run("push", () => git.sync(root, "push"))} title={`${status.upstream} hedefine gönder (push)`}>
              ↑{status.ahead || ""}
            </button>
          </>
        )}
      </div>

      {newBranch !== null && (
        <input
          autoFocus
          className="search-input git-new-branch"
          placeholder="Yeni branch adı, ↵ ile oluştur"
          value={newBranch}
          onChange={(e) => setNewBranch(e.target.value)}
          onBlur={() => setNewBranch(null)}
          onKeyDown={async (e) => {
            if (e.key === "Escape") setNewBranch(null);
            if (e.key === "Enter" && newBranch.trim()) {
              const name = newBranch.trim();
              setNewBranch(null);
              await run("branch", () => git.switchBranch(root, name, true));
              loadBranches();
            }
          }}
          spellCheck={false}
        />
      )}

      <div className="git-commit">
        <textarea
          className="git-message"
          placeholder={`Commit mesajı (⌘↵ ile commit)${branches?.current ? ` — ${branches.current}` : ""}`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) {
              e.preventDefault();
              commit();
            }
          }}
          rows={Math.min(6, Math.max(2, message.split("\n").length))}
          spellCheck={false}
        />
        <button className="primary-btn git-commit-btn" disabled={!canCommit} onClick={commit}>
          {busy === "commit" ? "Commit'leniyor…" : commitAll && status.changes.length ? "Tümünü commit'le" : "Commit"}
        </button>
        {busy && busy !== "commit" && <KiteLoader size={14} label={busyLabel(busy)} />}
        {error && <div className="git-error">{error}</div>}
        {!error && syncLabel && !busy && <div className="git-hint">{status.upstream}: {syncLabel}</div>}
      </div>

      <div className="tree">
        {staged.length > 0 && (
          <ChangeGroup
            title="Hazırlanan değişiklikler"
            changes={staged}
            groupAction={{ label: "−", title: "Tümünü geri çek", fn: () => run("unstage", () => git.unstage(root, staged.map((c) => c.path))) }}
            rowActions={(c) => [
              { label: "↗", title: "Dosyayı aç", fn: () => onOpenFile(c.path), hidden: c.status === "D" },
              { label: "−", title: "Hazırlıktan çıkar", fn: () => run("unstage", () => git.unstage(root, [c.path])) },
            ]}
            onOpen={onOpenDiff}
          />
        )}
        <ChangeGroup
          title="Değişiklikler"
          changes={unstaged}
          groupAction={unstaged.length ? { label: "+", title: "Tümünü hazırla", fn: () => run("stage", () => git.stage(root, unstaged.map((c) => c.path))) } : undefined}
          extraGroupAction={unstaged.length ? { label: "↺", title: "Tümünü geri al", fn: () => discard(unstaged) } : undefined}
          rowActions={(c) => [
            { label: "↗", title: "Dosyayı aç", fn: () => onOpenFile(c.path), hidden: c.status === "D" },
            { label: "↺", title: "Değişikliği geri al", fn: () => discard([c]) },
            { label: "+", title: "Hazırla (stage)", fn: () => run("stage", () => git.stage(root, [c.path])) },
          ]}
          onOpen={onOpenDiff}
          empty="Değişiklik yok"
        />
      </div>
    </Section>
  );
}

function busyLabel(b: string) {
  return ({ pull: "Çekiliyor…", push: "Gönderiliyor…", branch: "Branch değiştiriliyor…", init: "Oluşturuluyor…" } as Record<string, string>)[b] ?? "Çalışıyor…";
}

function Section({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="sidebar-section">
      <div className="sidebar-header">
        <span>{title}</span>
        <div className="header-actions">{actions}</div>
      </div>
      {children}
    </div>
  );
}

type Action = { label: string; title: string; fn: () => void; hidden?: boolean };

function ChangeGroup({ title, changes, groupAction, extraGroupAction, rowActions, onOpen, empty }: {
  title: string;
  changes: FileChange[];
  groupAction?: Action;
  extraGroupAction?: Action;
  rowActions: (c: FileChange) => Action[];
  onOpen: (c: FileChange) => void;
  empty?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="change-group">
      <div className="tree-row change-group-head" onClick={() => setOpen(!open)}>
        <span className="tree-chevron">{open ? "▾" : "▸"}</span>
        <span>{title}</span>
        <span className="row-actions" onClick={(e) => e.stopPropagation()}>
          {[extraGroupAction, groupAction].filter(Boolean).map((a) => (
            <button key={a!.title} className="icon-btn" title={a!.title} onClick={a!.fn}>{a!.label}</button>
          ))}
        </span>
        <span className="search-count">{changes.length}</span>
      </div>
      {open && changes.length === 0 && empty && <div className="git-none">{empty}</div>}
      {open &&
        changes.map((c) => {
          const slash = c.rel.lastIndexOf("/");
          return (
            <div key={c.path + c.staged} className="tree-row change-row" onClick={() => onOpen(c)} title={c.rel}>
              <span className={`change-name ${c.status === "D" ? "deleted" : ""}`}>{c.rel.slice(slash + 1)}</span>
              <span className="change-dir">{slash > 0 ? c.rel.slice(0, slash) : ""}</span>
              <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                {rowActions(c).filter((a) => !a.hidden).map((a) => (
                  <button key={a.title} className="icon-btn" title={a.title} onClick={a.fn}>{a.label}</button>
                ))}
              </span>
              <span className={`change-status s-${c.status}`} title={STATUS_TITLE[c.status]}>{c.status}</span>
            </div>
          );
        })}
    </div>
  );
}
