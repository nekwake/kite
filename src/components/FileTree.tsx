import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { Chevron, Icon } from "../lib/icons";
import { listenHere } from "../lib/events";
import { ask } from "@tauri-apps/plugin-dialog";
import { api, basename, dirname, Entry, relativeTo } from "../lib/api";
import { startPathDrag } from "../lib/drag";
import { FileIcon } from "../lib/fileIcons";
import { MenuItem } from "./ContextMenu";

type Props = {
  root: string;
  activePath: string | null;
  onOpenFile: (path: string, preview?: boolean) => void;
  decorations: { files: Map<string, string>; dirs: Set<string> };
  openMenu: (e: React.MouseEvent, items: MenuItem[]) => void;
  onRenamed: (from: string, to: string) => void;
  onDeleted: (path: string) => void;
  onOpenTerminal: (dir: string) => void;
  onSendToClaude: (paths: string[]) => void;
  onError: (msg: string) => void;
};

/** Inline name field: a new entry inside `dir`, or renaming `path` */
type Editing = { kind: "file" | "folder"; dir: string } | { kind: "rename"; path: string };

export function FileTree(props: Props) {
  const { root, activePath, onOpenFile, decorations, openMenu, onError } = props;
  const [children, setChildren] = useState<Record<string, Entry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set([root]));
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const load = useCallback(async (dir: string) => {
    try {
      const entries = await api.readDir(dir);
      setChildren((c) => ({ ...c, [dir]: entries }));
    } catch {
      // A folder that vanished drops out of the tree
      setChildren((c) => {
        const { [dir]: _gone, ...rest } = c;
        return rest;
      });
    }
  }, []);

  useEffect(() => {
    setChildren({});
    setExpanded(new Set([root]));
    load(root);
  }, [root, load]);

  // Reload the open folders that contain anything the watcher saw change
  useEffect(() => {
    const unlisten = listenHere<string[]>("fs-changed", (e) => {
      const dirs = new Set(e.payload.filter((p) => !p.includes("/.git/") && !p.endsWith("/.git")).map(dirname));
      expandedRef.current.forEach((d) => dirs.has(d) && load(d));
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [load]);

  const expand = (dir: string) => {
    setExpanded((prev) => new Set(prev).add(dir));
    load(dir);
  };

  const toggle = (dir: string) => {
    if (expanded.has(dir)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(dir);
        return next;
      });
    } else expand(dir);
  };

  // Reveal the active file: expand its ancestors
  useEffect(() => {
    if (!activePath?.startsWith(root + "/")) return;
    setSelected(activePath);
    for (let d = dirname(activePath); d.length > root.length; d = dirname(d)) {
      if (!expandedRef.current.has(d)) expand(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, root]);

  const startCreate = (kind: "file" | "folder", dir: string) => {
    if (dir !== root && !expanded.has(dir)) expand(dir);
    setEditing({ kind, dir });
  };

  const commitEdit = async (name: string) => {
    const e = editing;
    setEditing(null);
    name = name.trim();
    if (!e || !name || name.includes("/")) return;
    try {
      if (e.kind === "rename") {
        if (name === basename(e.path)) return;
        const to = `${dirname(e.path)}/${name}`;
        await api.renamePath(e.path, to);
        props.onRenamed(e.path, to);
        load(dirname(e.path));
      } else {
        const path = `${e.dir}/${name}`;
        await (e.kind === "file" ? api.createFile(path) : api.createDir(path));
        await load(e.dir);
        if (e.kind === "file") onOpenFile(path);
        setSelected(path);
      }
    } catch (err) {
      onError(String(err));
    }
  };

  const remove = async (entry: Entry) => {
    const ok = await ask(`"${entry.name}" çöp kutusuna taşınsın mı?`, {
      title: "Kite",
      kind: "warning",
      okLabel: "Çöpe taşı",
      cancelLabel: "Vazgeç",
    });
    if (!ok) return;
    try {
      await api.trashPath(entry.path);
      props.onDeleted(entry.path);
      load(dirname(entry.path));
    } catch (err) {
      onError(String(err));
    }
  };

  const copy = (text: string) => navigator.clipboard.writeText(text).catch(() => {});

  const menuFor = (entry: Entry): MenuItem[] => {
    const dir = entry.isDir ? entry.path : dirname(entry.path);
    return [
      { label: "Yeni Dosya…", onClick: () => startCreate("file", dir) },
      { label: "Yeni Klasör…", onClick: () => startCreate("folder", dir) },
      "separator",
      { label: "Claude oturumuna ekle", onClick: () => props.onSendToClaude([entry.path]) },
      { label: "Terminalde aç", onClick: () => props.onOpenTerminal(dir) },
      { label: "Finder'da göster", onClick: () => api.revealInFinder(entry.path) },
      "separator",
      { label: "Yolu kopyala", onClick: () => copy(entry.path) },
      { label: "Göreli yolu kopyala", onClick: () => copy(relativeTo(root, entry.path)) },
      "separator",
      { label: "Yeniden adlandır…", shortcut: "↵", onClick: () => setEditing({ kind: "rename", path: entry.path }) },
      { label: "Çöpe taşı", shortcut: "⌘⌫", danger: true, onClick: () => remove(entry) },
    ];
  };

  const rootMenu: MenuItem[] = [
    { label: "Yeni Dosya…", onClick: () => startCreate("file", root) },
    { label: "Yeni Klasör…", onClick: () => startCreate("folder", root) },
    "separator",
    { label: "Terminalde aç", onClick: () => props.onOpenTerminal(root) },
    { label: "Finder'da göster", onClick: () => api.revealInFinder(root) },
    { label: "Yolu kopyala", onClick: () => copy(root) },
  ];

  const findEntry = (path: string) => children[dirname(path)]?.find((e) => e.path === path);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing || !selected) return;
    const entry = findEntry(selected);
    if (!entry) return;
    if (e.key === "Enter") {
      e.preventDefault();
      setEditing({ kind: "rename", path: entry.path });
    } else if (e.key === "Backspace" && e.metaKey) {
      e.preventDefault();
      remove(entry);
    }
  };

  const nameInput = (initial: string, depth: number, kind: "file" | "folder") => (
    <div className="tree-row editing" style={{ paddingLeft: 8 + depth * 12 }}>
      <span className="tree-chevron" />
      <FileIcon name={initial || "x"} dir={kind === "folder"} />
      <NameField initial={initial} onCommit={commitEdit} onCancel={() => setEditing(null)} />
    </div>
  );

  const renderDir = (dir: string, depth: number): React.ReactNode => {
    const creating = editing && editing.kind !== "rename" && editing.dir === dir ? editing : null;
    return (
      <>
        {creating && nameInput("", depth, creating.kind === "folder" ? "folder" : "file")}
        {(children[dir] ?? []).map((entry) => {
          const isOpen = expanded.has(entry.path);
          const status = entry.isDir ? undefined : decorations.files.get(entry.path);
          const changed = status ?? (entry.isDir && decorations.dirs.has(entry.path) ? "dir" : undefined);
          if (editing?.kind === "rename" && editing.path === entry.path) {
            return <div key={entry.path}>{nameInput(entry.name, depth, entry.isDir ? "folder" : "file")}</div>;
          }
          return (
            <div key={entry.path}>
              <div
                className={`tree-row ${entry.path === activePath ? "active" : ""} ${entry.path === selected ? "selected" : ""}`}
                style={{ paddingLeft: 8 + depth * 12 }}
                onClick={() => {
                  setSelected(entry.path);
                  if (entry.isDir) toggle(entry.path);
                  else onOpenFile(entry.path, true);
                }}
                onDoubleClick={() => !entry.isDir && onOpenFile(entry.path)}
                onContextMenu={(e) => {
                  setSelected(entry.path);
                  openMenu(e, menuFor(entry));
                }}
                onPointerDown={(e) => startPathDrag(e, [entry.path], entry.name)}
                title={relativeTo(root, entry.path)}
              >
                <span className="tree-chevron">{entry.isDir && <Chevron open={isOpen} />}</span>
                <FileIcon name={entry.name} dir={entry.isDir} open={isOpen} />
                <span className={`${entry.isDir ? "tree-dir" : "tree-file"} ${changed ? `git-${changed}` : ""}`}>
                  {entry.name}
                </span>
                {status && <span className={`tree-status change-status s-${status}`}>{status}</span>}
              </div>
              {entry.isDir && isOpen && renderDir(entry.path, depth + 1)}
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="sidebar-section">
      <div className="sidebar-header">
        <span>{basename(root).toUpperCase()}</span>
        <div className="header-actions">
          <button className="icon-btn" onClick={() => startCreate("file", selectedDir())} title={t("Yeni dosya")}><Icon name="filePlus" /></button>
          <button className="icon-btn" onClick={() => startCreate("folder", selectedDir())} title={t("Yeni klasör")}><Icon name="folderPlus" /></button>
          <button className="icon-btn" onClick={() => expanded.forEach(load)} title={t("Yenile")}><Icon name="refresh" /></button>
          <button className="icon-btn" onClick={() => setExpanded(new Set([root]))} title={t("Tümünü daralt")}><Icon name="collapse" /></button>
        </div>
      </div>
      <div
        className="tree"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.target === e.currentTarget && openMenu(e, rootMenu)}
      >
        {renderDir(root, 0)}
      </div>
    </div>
  );

  // New entries go next to the selection: inside it if it's a folder
  function selectedDir() {
    if (!selected) return root;
    return findEntry(selected)?.isDir ? selected : dirname(selected);
  }
}

function NameField({ initial, onCommit, onCancel }: { initial: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current!;
    el.focus();
    // Select the name without its extension, like Finder
    const dot = initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(ref.current!.value);
    else onCancel();
  };
  return (
    <input
      ref={ref}
      className="tree-input"
      defaultValue={initial}
      spellCheck={false}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
    />
  );
}
