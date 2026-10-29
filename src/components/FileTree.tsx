import { useCallback, useEffect, useState } from "react";
import { api, basename, Entry } from "../lib/api";

type Props = {
  root: string;
  activePath: string | null;
  onOpenFile: (path: string) => void;
  decorations: { files: Map<string, string>; dirs: Set<string> };
};

export function FileTree({ root, activePath, onOpenFile, decorations }: Props) {
  const [children, setChildren] = useState<Record<string, Entry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set([root]));

  const load = useCallback(async (dir: string) => {
    try {
      const entries = await api.readDir(dir);
      setChildren((c) => ({ ...c, [dir]: entries }));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const refresh = useCallback(() => {
    expanded.forEach(load);
  }, [expanded, load]);

  useEffect(() => {
    setChildren({});
    setExpanded(new Set([root]));
    load(root);
  }, [root, load]);

  const toggle = (dir: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else {
        next.add(dir);
        load(dir);
      }
      return next;
    });
  };

  const renderDir = (dir: string, depth: number): React.ReactNode =>
    (children[dir] ?? []).map((entry) => {
      const isOpen = expanded.has(entry.path);
      const status = entry.isDir ? undefined : decorations.files.get(entry.path);
      const changed = status ?? (entry.isDir && decorations.dirs.has(entry.path) ? "dir" : undefined);
      return (
        <div key={entry.path}>
          <div
            className={`tree-row ${entry.path === activePath ? "active" : ""}`}
            style={{ paddingLeft: 8 + depth * 12 }}
            onClick={() => (entry.isDir ? toggle(entry.path) : onOpenFile(entry.path))}
            title={entry.path}
          >
            <span className="tree-chevron">{entry.isDir ? (isOpen ? "▾" : "▸") : ""}</span>
            <span className={`${entry.isDir ? "tree-dir" : "tree-file"} ${changed ? `git-${changed}` : ""}`}>
              {entry.name}
            </span>
            {status && <span className={`tree-status change-status s-${status}`}>{status}</span>}
          </div>
          {entry.isDir && isOpen && renderDir(entry.path, depth + 1)}
        </div>
      );
    });

  return (
    <div className="sidebar-section">
      <div className="sidebar-header">
        <span>{basename(root).toUpperCase()}</span>
        <button className="icon-btn" onClick={refresh} title="Yenile">
          ↻
        </button>
      </div>
      <div className="tree">{renderDir(root, 0)}</div>
    </div>
  );
}
