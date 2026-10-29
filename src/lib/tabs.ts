import { basename } from "./api";

export type FileTab = { kind: "file"; id: string; path: string; content: string; saved: string };

/** Working tree (`staged: false`), index (`staged: true`) or a commit (`rev`) */
export type DiffSource = { staged: boolean; rev?: string };
export type DiffTab = {
  kind: "diff";
  id: string;
  path: string;
  source: DiffSource;
  original: string;
  modified: string;
};

export type HistoryTab = { kind: "history"; id: string };

export type Tab = FileTab | DiffTab | HistoryTab;

export const HISTORY_TAB_ID = "git:history";

export const diffTabId = (path: string, s: DiffSource) =>
  s.rev ? `diff:${s.rev}:${path}` : `diff:${s.staged ? "index" : "work"}:${path}`;

export const isDirty = (t: Tab) => t.kind === "file" && t.content !== t.saved;

export function tabTitle(t: Tab): string {
  if (t.kind === "history") return "Git Geçmişi";
  if (t.kind === "file") return basename(t.path);
  const where = t.source.rev ? t.source.rev.slice(0, 7) : t.source.staged ? "Hazırlanan" : "Çalışma";
  return `${basename(t.path)} (${where})`;
}
