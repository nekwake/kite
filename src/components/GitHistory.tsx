import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "../lib/i18n";
import { Icon } from "../lib/icons";
import { Commit, FileChange, git } from "../lib/api";
import { computeGraph, GraphRow, LANE_COLORS } from "../lib/graph";
import { KiteLoader } from "./KiteLogo";

const ROW = 26;
const LANE = 14;

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

  const fileRows = (hash: string) =>
    files === null ? (
      <div className="history-files"><KiteLoader size={14} /></div>
    ) : (
      files.map((f) => (
        <div key={f.path} className="tree-row change-row" onClick={() => onOpenDiff(f, hash)} title={f.rel}>
          <span className="change-name">{f.rel.split("/").pop()}</span>
          <span className="change-dir">{f.rel.split("/").slice(0, -1).join("/")}</span>
          <span className={`change-status s-${f.status}`}>{f.status}</span>
        </div>
      ))
    );

  if (compact) {
    if (error || !commits?.length) return <div className="git-none">{error ?? (commits ? "Henüz commit yok" : "")}</div>;
    return (
      <div className="history-compact">
        {rows.map((row) => {
          const open = selected?.hash === row.commit.hash;
          return (
            <div key={row.commit.hash}>
              <div
                className={`history-row ${open ? "selected" : ""}`}
                onClick={() => setSelected(open ? null : row.commit)}
                title={`${row.commit.subject}\n${row.commit.author} · ${new Date(row.commit.time * 1000).toLocaleString("tr-TR")} · ${row.commit.hash.slice(0, 7)}`}
              >
                <GraphCell row={row} width={width} />
                <AuthorBadge name={row.commit.author} />
                <span className="history-subject">{row.commit.subject}</span>
                {row.commit.refs.map((r) => (
                  <span key={r} className={`ref ${r.startsWith("HEAD") ? "ref-head" : r.includes("/") ? "ref-remote" : ""}`}>
                    {r.replace("HEAD -> ", "")}
                  </span>
                ))}
              </div>
              {open && <div className="history-inline-files">{fileRows(row.commit.hash)}</div>}
            </div>
          );
        })}
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
          >
            <GraphCell row={row} width={width} />
            <AuthorBadge name={row.commit.author} />
            <span className="history-subject">
              {row.commit.refs.map((r) => (
                <span key={r} className={`ref ${r.startsWith("HEAD") ? "ref-head" : r.includes("/") ? "ref-remote" : ""}`}>
                  {r.replace("HEAD -> ", "")}
                </span>
              ))}
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
              {selected.author} · {new Date(selected.time * 1000).toLocaleString("tr-TR")} · {selected.hash.slice(0, 10)}
            </span>
          </div>
          {files === null ? (
            <KiteLoader size={16} />
          ) : (
            files.map((f) => (
              <div key={f.path} className="tree-row change-row" onClick={() => onOpenDiff(f, selected.hash)}>
                <span className="change-name">{f.rel.split("/").pop()}</span>
                <span className="change-dir">{f.rel.split("/").slice(0, -1).join("/")}</span>
                <span className={`change-status s-${f.status}`}>{f.status}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** A stable color per author, so commits by different people stand apart */
function authorColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 62%)`;
}

const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase("tr"))
    .join("") || "?";

function AuthorBadge({ name }: { name: string }) {
  return (
    <span className="author-badge" style={{ background: authorColor(name) }} title={name}>
      {initials(name)}
    </span>
  );
}

function GraphCell({ row, width }: { row: GraphRow; width: number }) {
  const x = (i: number) => 8 + i * LANE;
  const mid = ROW / 2;
  const color = (i: number) => LANE_COLORS[i % LANE_COLORS.length];
  const curve = (x1: number, y1: number, x2: number, y2: number) =>
    `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;
  const paths: React.ReactNode[] = [];

  row.before.forEach((h, i) => {
    if (h === null) return;
    if (h === row.commit.hash) {
      paths.push(<path key={`in${i}`} d={curve(x(i), 0, x(row.col), mid)} style={{ stroke: color(i) }} />);
    } else {
      // Lanes waiting for the same commit stay side by side until it is reached
      const j = row.after[i] === h ? i : row.after.indexOf(h);
      if (j !== -1) paths.push(<path key={`pass${i}`} d={curve(x(i), 0, x(j), ROW)} style={{ stroke: color(j) }} />);
    }
  });
  row.commit.parents.forEach((p, k) => {
    const j = k === 0 && row.after[row.col] === p ? row.col : row.after.indexOf(p);
    if (j !== -1) paths.push(<path key={`out${k}`} d={curve(x(row.col), mid, x(j), ROW)} style={{ stroke: color(j) }} />);
  });

  return (
    <svg className="graph-cell" width={width} height={ROW} fill="none" strokeWidth="2">
      {paths}
      {/* Lanes are colored by branch, the dot by who made the commit */}
      <circle cx={x(row.col)} cy={mid} r="4.5" style={{ fill: authorColor(row.commit.author) }} stroke="#181818" strokeWidth="2" />
    </svg>
  );
}

function relativeTime(sec: number): string {
  const diff = Date.now() / 1000 - sec;
  if (diff < 60) return "az önce";
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} gün önce`;
  return new Date(sec * 1000).toLocaleDateString("tr-TR");
}
