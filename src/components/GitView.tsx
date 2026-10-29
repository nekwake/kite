import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { Chevron, Icon } from "../lib/icons";
import { ask } from "@tauri-apps/plugin-dialog";
import { accounts, basename, Branches, FileChange, git, GitStatus } from "../lib/api";
import { KiteLoader } from "./KiteLogo";
import { GitHistory } from "./GitHistory";
import { Resizer } from "./Chrome";

type Props = {
  root: string;
  status: GitStatus | null;
  refresh: () => Promise<void>;
  onOpenDiff: (change: FileChange) => void;
  onOpenFile: (path: string) => void;
  onShowHistory: () => void;
  onDiscarded: (paths: string[]) => void;
  onOpenCommitDiff: (change: FileChange, rev: string) => void;
  /** Signed-in GitHub user, or null when `gh` isn't connected */
  githubLogin: string | null;
  onConnectGithub: () => void;
};

const STATUS_TITLE: Record<string, string> = {
  M: "Değiştirildi", A: "Eklendi", D: "Silindi", R: "Yeniden adlandırıldı",
  U: "Takip edilmiyor", C: "Çakışma",
};

export function GitView(props: Props) {
  const { root, status, refresh, onOpenDiff, onOpenFile, onShowHistory, onDiscarded, githubLogin, onConnectGithub, onOpenCommitDiff } = props;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branches | null>(null);
  const [newBranch, setNewBranch] = useState<string | null>(null);
  const [publish, setPublish] = useState<{ name: string; private: boolean } | null>(null);
  const [graphH, setGraphH] = useState(260);
  const [graphOpen, setGraphOpen] = useState(true);

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
    return <Section title={t("KAYNAK KONTROLÜ")}><div className="git-empty"><KiteLoader size={18} /></div></Section>;
  }

  if (!status.isRepo) {
    return (
      <Section title={t("KAYNAK KONTROLÜ")}>
        <div className="git-empty">
          <p>{t("Bu klasör bir git deposu değil.")}</p>
          <button className="primary-btn" onClick={() => run("init", () => git.init(root))}>{t("Depo oluştur")}</button>
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
  const hasRemote = status.remotes.length > 0;
  const refreshKey = `${status.branch}|${status.ahead}|${status.behind}|${status.changes.length}`;

  const sync = () =>
    run("sync", async () => {
      if (status.behind) await git.sync(root, "pull");
      if (status.ahead) await git.sync(root, "push");
    });

  const doPublish = async () => {
    if (!publish?.name.trim()) return;
    const p = publish;
    setPublish(null);
    await run("publish", () => accounts.publish(root, p.name.trim(), p.private));
  };

  // The one next step for this branch, like VS Code's Publish / Sync button
  const remoteAction = !hasRemote ? (
    githubLogin ? (
      <button className="secondary-btn" disabled={!!busy} onClick={() => setPublish({ name: basename(root), private: true })}>
        {t("☁ GitHub'a yayınla")}
      </button>
    ) : (
      <button className="secondary-btn" onClick={onConnectGithub}>{t("GitHub'ı bağla")}</button>
    )
  ) : !status.upstream ? (
    <button className="secondary-btn" disabled={!!busy} onClick={() => run("publish", () => git.sync(root, "publish"))}>
      {t("☁ Branch'i yayınla")}
    </button>
  ) : syncLabel ? (
    <button className="secondary-btn" disabled={!!busy} onClick={sync}>⟳ Senkronize et {syncLabel}</button>
  ) : null;

  return (
    <Section
      title={t("KAYNAK KONTROLÜ")}
      actions={
        <>
          <button className="icon-btn" title={t("Geçmişi sekmede aç")} onClick={onShowHistory}><Icon name="history" /></button>
          <button className="icon-btn" title={t("Yenile")} onClick={() => refresh()}><Icon name="refresh" /></button>
        </>
      }
    >
      <div className="git-branch-row">
        <select
          className="git-branch"
          value={branches?.current ?? status.branch ?? ""}
          onChange={(e) => switchBranch(e.target.value)}
          disabled={!!busy}
          title={t("Branch değiştir")}
        >
          {!branches?.local.length && <option value={status.branch ?? ""}>{status.branch ?? "(branch yok)"}</option>}
          {branches?.local.map((b) => <option key={b} value={b}>⎇ {b}</option>)}
          <option value="__new__">{t("+ Yeni branch…")}</option>
        </select>
      </div>

      {newBranch !== null && (
        <input
          autoFocus
          className="search-input git-new-branch"
          placeholder={t("Yeni branch adı, ↵ ile oluştur")}
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
          placeholder={`Commit mesajı (⌘↵ ile commit)${branches?.current ? ` · ${branches.current}` : ""}`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commit();
            }
          }}
          rows={Math.min(6, Math.max(2, message.split("\n").length))}
          spellCheck={false}
        />
        <button className="primary-btn git-commit-btn" disabled={!canCommit} onClick={commit}>
          {t(busy === "commit" ? "Commit'leniyor…" : commitAll && status.changes.length ? "Tümünü commit'le" : "Commit")}
        </button>
        {remoteAction}
        {publish && (
          <div className="publish-box">
            <label>{t("Depo adı")}</label>
            <input
              autoFocus
              className="search-input"
              value={publish.name}
              onChange={(e) => setPublish({ ...publish, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") doPublish();
                if (e.key === "Escape") setPublish(null);
              }}
              spellCheck={false}
            />
            <div className="segmented">
              <button className={publish.private ? "on" : ""} onClick={() => setPublish({ ...publish, private: true })}>{t("Gizli")}</button>
              <button className={!publish.private ? "on" : ""} onClick={() => setPublish({ ...publish, private: false })}>{t("Herkese açık")}</button>
            </div>
            <div className="publish-actions">
              <button className="secondary-btn" onClick={() => setPublish(null)}>{t("Vazgeç")}</button>
              <button className="primary-btn" onClick={doPublish}>github.com/{githubLogin}/{publish.name.trim() || "…"} oluştur</button>
            </div>
          </div>
        )}
        {busy && busy !== "commit" && <KiteLoader size={14} label={busyLabel(busy)} />}
        {error && <div className="git-error">{error}</div>}
      </div>

      <div className="tree">
        {staged.length > 0 && (
          <ChangeGroup
            title={t("Hazırlanan değişiklikler")}
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
          title={t("Değişiklikler")}
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

      {graphOpen && <Resizer dir="y" onDrag={(d) => setGraphH((h) => Math.min(800, Math.max(90, h - d)))} />}
      <div className="git-graph" style={{ height: graphOpen ? graphH : undefined }}>
        <div className="tree-row change-group-head git-graph-head" onClick={() => setGraphOpen(!graphOpen)}>
          <span className="tree-chevron"><Chevron open={graphOpen} /></span>
          <span>{t("Geçmiş")}</span>
          <span className="graph-actions" onClick={(e) => e.stopPropagation()}>
            {hasRemote && (
              <>
                <button className="icon-btn" title={t("Uzak depodan getir (fetch)")} disabled={!!busy} onClick={() => run("fetch", () => git.sync(root, "fetch"))}><Icon name="fetch" /></button>
                <button className="icon-btn" title={`Çek (pull)${status.behind ? `: ${status.behind} commit` : ""}`} disabled={!!busy || !status.upstream} onClick={() => run("pull", () => git.sync(root, "pull"))}>
                  <Icon name="pull" />{status.behind || ""}
                </button>
                <button className="icon-btn" title={`Gönder (push)${status.ahead ? `: ${status.ahead} commit` : ""}`} disabled={!!busy || !status.upstream} onClick={() => run("push", () => git.sync(root, "push"))}>
                  <Icon name="push" />{status.ahead || ""}
                </button>
              </>
            )}
            <button className="icon-btn" title={t("Geçmişi sekmede aç")} onClick={onShowHistory}><Icon name="openTab" /></button>
          </span>
        </div>
        {graphOpen && (
          <div className="git-graph-body">
            <GitHistory root={root} compact refreshKey={refreshKey} onOpenDiff={onOpenCommitDiff} />
          </div>
        )}
      </div>
    </Section>
  );
}

function busyLabel(b: string) {
  return (
    {
      pull: "Çekiliyor…", push: "Gönderiliyor…", fetch: "Getiriliyor…", sync: "Senkronize ediliyor…",
      publish: "GitHub'a yayınlanıyor…", branch: "Branch değiştiriliyor…", init: "Oluşturuluyor…",
    } as Record<string, string>
  )[b] ?? "Çalışıyor…";
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
        <span className="tree-chevron"><Chevron open={open} /></span>
        <span>{t(title)}</span>
        <span className="row-actions" onClick={(e) => e.stopPropagation()}>
          {[extraGroupAction, groupAction].filter(Boolean).map((a) => (
            <button key={a!.title} className="icon-btn" title={t(a!.title)} onClick={a!.fn}>{a!.label}</button>
          ))}
        </span>
        <span className="search-count">{changes.length}</span>
      </div>
      {open && changes.length === 0 && empty && <div className="git-none">{t(empty)}</div>}
      {open &&
        changes.map((c) => {
          const slash = c.rel.lastIndexOf("/");
          return (
            <div key={c.path + c.staged} className="tree-row change-row" onClick={() => onOpen(c)} title={c.rel}>
              <span className={`change-name ${c.status === "D" ? "deleted" : ""}`}>{c.rel.slice(slash + 1)}</span>
              <span className="change-dir">{slash > 0 ? c.rel.slice(0, slash) : ""}</span>
              <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                {rowActions(c).filter((a) => !a.hidden).map((a) => (
                  <button key={a.title} className="icon-btn" title={t(a.title)} onClick={a.fn}>{a.label}</button>
                ))}
              </span>
              <span className={`change-status s-${c.status}`} title={STATUS_TITLE[c.status]}>{c.status}</span>
            </div>
          );
        })}
    </div>
  );
}
