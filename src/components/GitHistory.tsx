import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { t } from "../lib/i18n";
import { Icon } from "../lib/icons";
import { Commit, CommitInfo, FileChange, git } from "../lib/api";
import { computeGraph, GraphRow, LANE_COLORS } from "../lib/graph";
import { FileIcon } from "../lib/fileIcons";
import { KiteLoader } from "./KiteLogo";

const ROW = 26;
/** Lane spacing: tighter in the sidebar, like VS Code's graph */
const LANE = 14;
const COMPACT_LANE = 11;
const FILE_ROW = 24;

const laneX = (i: number, lane = LANE) => 7 + i * lane;
/** Lanes a row actually uses, so the message starts right after them */
const rowLanes = (r: GraphRow) => Math.max(r.before.length, r.after.length, r.col + 1);
const laneColor = (i: number) => LANE_COLORS[i % LANE_COLORS.length];

type Props = {
  root: string;
  onOpenDiff: (change: FileChange, rev: string) => void;
  /** Sidebar variant: no author/date columns, files expand under the commit */
  compact?: boolean;
  /** Changes when the repo moves (commit, pull, checkout) to reload the log */
  refreshKey?: string;
};

export function GitHistory({ root, onOpenDiff, compact, refreshKey }: Props) {
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Commit | null>(null);
  const [files, setFiles] = useState<FileChange[] | null>(null);
  const hover = useCommitHover(root);

  const load = useCallback(async () => {
    try {
      setCommits(await git.log(root));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [root]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!selected) return;
    setFiles(null);
    git.commitFiles(root, selected.hash).then(setFiles).catch(() => setFiles([]));
  }, [root, selected]);

  const rows = useMemo(() => computeGraph(commits ?? []), [commits]);
  const width = Math.max(1, ...rows.map((r) => Math.max(r.before.length, r.after.length, r.col + 1))) * LANE + 8;

  if (compact) {
    if (error || !commits?.length) return <div className="git-none">{error ?? (commits ? t("Henüz commit yok") : "")}</div>;
    return (
      <div className="history-compact">
        {rows.map((row) => {
          const open = selected?.hash === row.commit.hash;
          return (
            <div key={row.commit.hash}>
              <div
                className={`history-row ${open ? "selected" : ""}`}
                onClick={() => setSelected(open ? null : row.commit)}
                {...hover.handlers(row.commit)}
              >
                <GraphCell row={row} width={rowLanes(row) * COMPACT_LANE + 4} lane={COMPACT_LANE} />
                <span className="history-subject">{row.commit.subject}</span>
                {row.commit.refs.map((r) => <RefChip key={r} name={r} />)}
              </div>
              {open && (
                <InlineFiles row={row} width={rowLanes(row) * COMPACT_LANE + 4} lane={COMPACT_LANE} files={files} onOpen={(f) => onOpenDiff(f, row.commit.hash)} />
              )}
            </div>
          );
        })}
        {hover.card}
      </div>
    );
  }

  if (error) return <div className="history-empty">{error}</div>;
  if (!commits) return <div className="history-empty"><KiteLoader size={22} label={t("Geçmiş yükleniyor…")} /></div>;
  if (commits.length === 0) return <div className="history-empty">{t("Henüz commit yok")}</div>;

  return (
    <div className="history">
      <div className="history-toolbar">
        <span>{commits.length} commit</span>
        <button className="icon-btn" onClick={load} title={t("Yenile")}><Icon name="refresh" /></button>
      </div>
      <div className="history-list">
        {rows.map((row) => (
          <div
            key={row.commit.hash}
            className={`history-row ${selected?.hash === row.commit.hash ? "selected" : ""}`}
            onClick={() => setSelected(row.commit)}
            {...hover.handlers(row.commit)}
          >
            <GraphCell row={row} width={width} />
            <span className="history-subject">
              {row.commit.refs.map((r) => <RefChip key={r} name={r} />)}
              {row.commit.subject}
            </span>
            <span className="history-author">{row.commit.author}</span>
            <span className="history-date">{relativeTime(row.commit.time)}</span>
            <span className="history-hash">{row.commit.hash.slice(0, 7)}</span>
          </div>
        ))}
      </div>
      {selected && (
        <div className="history-detail">
          <div className="history-detail-head">
            <b>{selected.subject}</b>
            <span>
              {selected.author} · {new Date(selected.time * 1000).toLocaleString()} · {selected.hash.slice(0, 10)}
            </span>
          </div>
          {files === null ? <KiteLoader size={16} /> : files.map((f) => <FileRow key={f.path} f={f} onOpen={() => onOpenDiff(f, selected.hash)} />)}
        </div>
      )}
      {hover.card}
    </div>
  );
}

function RefChip({ name }: { name: string }) {
  const head = name.startsWith("HEAD");
  return (
    <span className={`ref ${head ? "ref-head" : name.includes("/") ? "ref-remote" : ""}`}>
      {name.replace("HEAD -> ", "")}
    </span>
  );
}

function FileRow({ f, onOpen, indent = 0 }: { f: FileChange; onOpen: () => void; indent?: number }) {
  const slash = f.rel.lastIndexOf("/");
  const name = f.rel.slice(slash + 1);
  return (
    <div className="history-file" style={{ paddingLeft: indent }} onClick={onOpen} title={f.rel}>
      <FileIcon name={name} />
      <span className={`history-file-name ${f.status === "D" ? "deleted" : ""}`}>{name}</span>
      <span className="history-file-dir">{slash > 0 ? f.rel.slice(0, slash) : ""}</span>
      <span className={`change-status s-${f.status}`}>{f.status}</span>
    </div>
  );
}

/** Files of an expanded commit; the graph's lanes keep running down beside them */
function InlineFiles({ row, width, lane, files, onOpen }: { row: GraphRow; width: number; lane: number; files: FileChange[] | null; onOpen: (f: FileChange) => void }) {
  const height = (files?.length || 1) * FILE_ROW;
  return (
    <div className="history-inline-files">
      <svg className="history-lanes" width={width} height={height} fill="none" strokeWidth="2">
        {row.after.map((h, i) => h && <path key={i} d={`M${laneX(i, lane)} 0V${height}`} style={{ stroke: laneColor(i) }} />)}
      </svg>
      {files === null ? (
        <div className="history-file" style={{ paddingLeft: width }}><KiteLoader size={14} /></div>
      ) : (
        files.map((f) => <FileRow key={f.path} f={f} indent={width} onOpen={() => onOpen(f)} />)
      )}
    </div>
  );
}

function GraphCell({ row, width, lane = LANE }: { row: GraphRow; width: number; lane?: number }) {
  const x = (i: number) => laneX(i, lane);
  const mid = ROW / 2;
  const curve = (x1: number, y1: number, x2: number, y2: number) =>
    `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;
  const paths: React.ReactNode[] = [];

  row.before.forEach((h, i) => {
    if (h === null) return;
    if (h === row.commit.hash) {
      paths.push(<path key={`in${i}`} d={curve(x(i), 0, x(row.col), mid)} style={{ stroke: laneColor(i) }} />);
    } else {
      // Lanes waiting for the same commit stay side by side until it is reached
      const j = row.after[i] === h ? i : row.after.indexOf(h);
      if (j !== -1) paths.push(<path key={`pass${i}`} d={curve(x(i), 0, x(j), ROW)} style={{ stroke: laneColor(j) }} />);
    }
  });
  row.commit.parents.forEach((p, k) => {
    const j = k === 0 && row.after[row.col] === p ? row.col : row.after.indexOf(p);
    if (j !== -1) paths.push(<path key={`out${k}`} d={curve(x(row.col), mid, x(j), ROW)} style={{ stroke: laneColor(j) }} />);
  });

  const merge = row.commit.parents.length > 1;
  return (
    <svg className="graph-cell" width={width} height={ROW} fill="none" strokeWidth="2">
      {paths}
      {merge ? (
        <circle cx={x(row.col)} cy={mid} r="4" fill="#181818" strokeWidth="2" style={{ stroke: laneColor(row.col) }} />
      ) : (
        <circle cx={x(row.col)} cy={mid} r="4" style={{ fill: laneColor(row.col) }} stroke="#181818" strokeWidth="2" />
      )}
    </svg>
  );
}

// ---- Hover card ----------------------------------------------------------

const infoCache = new Map<string, Promise<CommitInfo>>();

/** Shows a commit card after a short hover; the card stays while the pointer is on it */
function useCommitHover(root: string) {
  const [state, setState] = useState<{ commit: Commit; rect: DOMRect } | null>(null);
  const showTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);

  const cancel = () => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
  };
  const hideSoon = () => {
    window.clearTimeout(showTimer.current);
    hideTimer.current = window.setTimeout(() => setState(null), 180);
  };
  useEffect(() => cancel, []);

  const handlers = (commit: Commit) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      cancel();
      const rect = e.currentTarget.getBoundingClientRect();
      showTimer.current = window.setTimeout(() => setState({ commit, rect }), state ? 80 : 450);
    },
    onMouseLeave: hideSoon,
    onMouseDown: () => {
      cancel();
      setState(null);
    },
  });

  const card = state && (
    <CommitCard root={root} commit={state.commit} anchor={state.rect} onEnter={cancel} onLeave={hideSoon} />
  );
  return { handlers, card };
}

function CommitCard({ root, commit, anchor, onEnter, onLeave }: { root: string; commit: Commit; anchor: DOMRect; onEnter: () => void; onLeave: () => void }) {
  const [info, setInfo] = useState<CommitInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.right + 8, top: anchor.top });

  useEffect(() => {
    const key = `${root}:${commit.hash}`;
    if (!infoCache.has(key)) infoCache.set(key, git.commitInfo(root, commit.hash));
    let live = true;
    infoCache.get(key)!.then((i) => live && setInfo(i)).catch(() => {});
    return () => {
      live = false;
    };
  }, [root, commit.hash]);

  // Beside the row, kept inside the window
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = anchor.right + 8;
    if (left + r.width > window.innerWidth - 8) left = Math.max(8, anchor.left + 40);
    const top = Math.max(8, Math.min(anchor.top - 8, window.innerHeight - r.height - 8));
    setPos({ left, top });
  }, [anchor, info]);

  const date = new Date(commit.time * 1000);
  return (
    <div ref={ref} className="commit-card" style={pos} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="commit-card-head">
        <Avatar name={commit.author} email={commit.email} />
        <b>{commit.author}</b>
        <span className="commit-card-time" title={date.toLocaleString()}>
          <Icon name="history" size={13} /> {relativeTime(commit.time)} ({date.toLocaleString(undefined, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })})
        </span>
      </div>
      <div className="commit-card-subject">{commit.subject}</div>
      {info?.body && <MessageBody text={info.body} />}
      {commit.refs.length > 0 && (
        <div className="commit-card-refs">{commit.refs.map((r) => <RefChip key={r} name={r} />)}</div>
      )}
      <div className="commit-card-stats">
        {info ? (
          <>
            {info.files} {t("dosya değişti")}
            {info.insertions > 0 && <span className="stat-add">, {info.insertions} {t("ekleme")}(+)</span>}
            {info.deletions > 0 && <span className="stat-del">, {info.deletions} {t("silme")}(-)</span>}
          </>
        ) : (
          <KiteLoader size={12} />
        )}
      </div>
      <div className="commit-card-foot">
        <span className="commit-card-hash">
          <Icon name="commit" size={13} />
          {commit.hash.slice(0, 7)}
          <button
            title={t("Hash'i kopyala")}
            onClick={() => {
              navigator.clipboard.writeText(commit.hash);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? "✓" : <Icon name="copy" size={12} />}
          </button>
        </span>
        {info?.webUrl && (
          <>
            <span className="commit-card-sep">|</span>
            <button className="link-btn" onClick={() => openUrl(info.webUrl!)}>
              {info.webUrl.includes("github.com") ? t("GitHub'da aç") : t("Web'de aç")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Commit body: "- " / "* " lines as bullets, the rest as paragraphs */
function MessageBody({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{l}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split("\n")) {
    const item = line.match(/^\s*[-*•]\s+(.*)/);
    if (item) list.push(item[1]);
    else if (list.length && /^\s{2,}\S/.test(line)) list[list.length - 1] += " " + line.trim();
    else {
      flush();
      if (line.trim()) blocks.push(<p key={blocks.length}>{line.trim()}</p>);
    }
  }
  flush();
  return <div className="commit-card-body">{blocks}</div>;
}

/** GitHub avatar for GitHub no-reply addresses; otherwise the initial */
function Avatar({ name, email }: { name: string; email: string }) {
  const login = email.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/)?.[1];
  const [failed, setFailed] = useState(false);
  if (login && !failed) {
    return <img className="commit-avatar" src={`https://github.com/${login}.png?size=48`} alt="" onError={() => setFailed(true)} />;
  }
  return <span className="commit-avatar initial">{name.trim()[0]?.toLocaleUpperCase() ?? "?"}</span>;
}

function relativeTime(sec: number): string {
  const diff = Date.now() / 1000 - sec;
  if (diff < 60) return t("az önce");
  if (diff < 3600) return `${Math.floor(diff / 60)} ${t("dk önce")}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ${t("sa önce")}`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} ${t("gün önce")}`;
  return new Date(sec * 1000).toLocaleDateString();
}
