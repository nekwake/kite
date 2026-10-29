import { Channel, invoke } from "@tauri-apps/api/core";

export type Entry = { name: string; path: string; isDir: boolean };

export type PtyEvent = { type: "output"; data: string } | { type: "exit" };

export type SearchOptions = { caseSensitive: boolean; regex: boolean; wholeWord: boolean };
export type LineMatch = { line: number; text: string; start: number; end: number };
export type FileMatches = { path: string; relative: string; matches: LineMatch[] };
export type SearchResult = { files: FileMatches[]; truncated: boolean };

export const api = {
  initialDir: () => invoke<string | null>("initial_dir"),
  readDir: (path: string) => invoke<Entry[]>("read_dir", { path }),
  readFile: (path: string) => invoke<string>("read_file", { path }),
  writeFile: (path: string, contents: string) =>
    invoke<void>("write_file", { path, contents }),
  createFile: (path: string) => invoke<void>("create_file", { path }),
  createDir: (path: string) => invoke<void>("create_dir", { path }),
  renamePath: (from: string, to: string) => invoke<void>("rename_path", { from, to }),
  trashPath: (path: string) => invoke<void>("trash_path", { path }),
  revealInFinder: (path: string) => invoke<void>("reveal_in_finder", { path }),
  watchRoot: (root: string) => invoke<void>("watch_root", { root }),

  ptySpawn: (cwd: string, cols: number, rows: number, onEvent: (e: PtyEvent) => void) => {
    const channel = new Channel<PtyEvent>();
    channel.onmessage = onEvent;
    return invoke<number>("pty_spawn", { cwd, cols, rows, onEvent: channel });
  },
  ptyWrite: (id: number, data: string) => invoke<void>("pty_write", { id, data }),
  ptyResize: (id: number, cols: number, rows: number) =>
    invoke<void>("pty_resize", { id, cols, rows }),
  ptyKill: (id: number) => invoke<void>("pty_kill", { id }),

  listFiles: (root: string) => invoke<string[]>("list_files", { root }),
  search: (root: string, query: string, options: SearchOptions) =>
    invoke<SearchResult>("search", { root, query, options }),
};

export const basename = (path: string) => path.split("/").filter(Boolean).pop() ?? path;
export const dirname = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";
export const relativeTo = (root: string, path: string) =>
  path === root ? "." : path.startsWith(root + "/") ? path.slice(root.length + 1) : path;

export type FileChange = { path: string; rel: string; status: string; staged: boolean };
export type GitStatus = {
  isRepo: boolean;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  changes: FileChange[];
  remotes: string[];
};
export type FileVersions = { original: string; modified: string };
export type Branches = { current: string | null; local: string[] };
export type Commit = {
  hash: string;
  parents: string[];
  author: string;
  time: number;
  refs: string[];
  subject: string;
};

export type ClaudeSession = {
  id: string;
  title: string;
  lastPrompt: string | null;
  cwd: string;
  cwdExists: boolean;
  branch: string | null;
  entrypoint: string | null;
  prompts: number;
  updated: number;
};

export type GithubAccount = { installed: boolean; login: string | null; name: string | null; avatarUrl: string | null };
export type ClaudeAccount = { installed: boolean; version: string | null; email: string | null; name: string | null; plan: string | null };

export const accounts = {
  github: () => invoke<GithubAccount>("github_account"),
  claude: () => invoke<ClaudeAccount>("claude_account"),
  publish: (root: string, name: string, isPrivate: boolean) =>
    invoke<string>("github_publish", { root, name, private: isPrivate }),
};

export const claude = {
  sessions: (root: string | null) => invoke<ClaudeSession[]>("claude_sessions", { root }),
};

export const git = {
  status: (root: string) => invoke<GitStatus>("git_status", { root }),
  fileVersions: (root: string, path: string, staged: boolean, rev?: string) =>
    invoke<FileVersions>("git_file_versions", { root, path, staged, rev: rev ?? null }),
  stage: (root: string, paths: string[]) => invoke<void>("git_stage", { root, paths }),
  unstage: (root: string, paths: string[]) => invoke<void>("git_unstage", { root, paths }),
  discard: (root: string, paths: string[], untracked: boolean) =>
    invoke<void>("git_discard", { root, paths, untracked }),
  commit: (root: string, message: string, all: boolean) =>
    invoke<void>("git_commit", { root, message, all }),
  branches: (root: string) => invoke<Branches>("git_branches", { root }),
  switchBranch: (root: string, branch: string, create: boolean) =>
    invoke<void>("git_switch", { root, branch, create }),
  init: (root: string) => invoke<void>("git_init", { root }),
  sync: (root: string, op: "pull" | "push" | "fetch" | "publish") => invoke<string>("git_sync", { root, op }),
  log: (root: string, limit = 300) => invoke<Commit[]>("git_log", { root, limit }),
  commitFiles: (root: string, hash: string) => invoke<FileChange[]>("git_commit_files", { root, hash }),
};
