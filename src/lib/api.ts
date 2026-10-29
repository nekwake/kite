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
