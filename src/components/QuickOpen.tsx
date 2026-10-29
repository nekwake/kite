import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { fuzzyFilter, fuzzyMatch } from "../lib/fuzzy";
import { FileIcon } from "../lib/fileIcons";
import { KiteLoader } from "./KiteLogo";

export type Command = { id: string; label: string; shortcut?: string; run: () => void };

type Props = {
  root: string;
  recent: string[];
  commands: Command[];
  /** "" for files, ">" for the command palette, ":" for go-to-line */
  initialQuery: string;
  onOpen: (path: string) => void;
  onGotoLine: (line: number) => void;
  onClose: () => void;
};

type Row =
  | { kind: "file"; item: string; positions: number[] }
  | { kind: "command"; cmd: Command; positions: number[] }
  | { kind: "line"; line: number };

export function QuickOpen({ root, recent, commands, initialQuery, onOpen, onGotoLine, onClose }: Props) {
  const [files, setFiles] = useState<string[] | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Re-listed on every open so the list is never stale
  useEffect(() => {
    api.listFiles(root).then(setFiles).catch(() => setFiles([]));
  }, [root]);

  const mode = query.startsWith(">") ? "command" : query.startsWith(":") ? "line" : "file";

  const rows = useMemo((): Row[] => {
    if (mode === "command") {
      const q = query.slice(1).trim();
      return commands
        .map((cmd) => ({ cmd, m: fuzzyMatch(q, cmd.label) }))
        .filter((x) => x.m)
        .sort((a, b) => (q ? b.m!.score - a.m!.score : 0))
        .map(({ cmd, m }) => ({ kind: "command", cmd, positions: m!.positions }));
    }
    if (mode === "line") {
      const n = parseInt(query.slice(1), 10);
      return n > 0 ? [{ kind: "line", line: n }] : [];
    }
    if (!files) return [];
    if (!query.trim()) {
      // Recently opened files first, then the rest
      const rel = recent.map((p) => p.slice(root.length + 1)).filter((p) => files.includes(p));
      const rest = files.filter((f) => !rel.includes(f));
      return [...rel, ...rest].slice(0, 50).map((item) => ({ kind: "file", item, positions: [] }));
    }
    return fuzzyFilter(query, files).map((m) => ({ kind: "file", item: m.item, positions: m.positions }));
  }, [mode, files, query, recent, root, commands]);

  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const pick = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    if (row.kind === "file") onOpen(`${root}/${row.item}`);
    else if (row.kind === "command") row.cmd.run();
    else onGotoLine(row.line);
  };

  const placeholder =
    mode === "command" ? "Komut ara…" : mode === "line" ? "Satır numarası" : "Dosya ara  ·  > komutlar  ·  : satıra git";

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="palette-input"
          placeholder={placeholder}
          value={query}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((s) => Math.min(s + 1, rows.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter") {
              pick(rows[selected]);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
        />
        <div className="palette-list" ref={listRef}>
          {mode === "file" && files === null && (
            <div className="palette-empty"><KiteLoader size={20} label="Dosyalar listeleniyor…" /></div>
          )}
          {rows.length === 0 && (mode !== "file" || files) && (
            <div className="palette-empty">{mode === "line" ? "Gitmek istediğin satırı yaz" : "Sonuç yok"}</div>
          )}
          {rows.map((r, i) => (
            <div
              key={r.kind === "file" ? r.item : r.kind === "command" ? r.cmd.id : "line"}
              className={`palette-item ${i === selected ? "selected" : ""}`}
              onMouseMove={() => setSelected(i)}
              onClick={() => pick(r)}
            >
              {r.kind === "file" && <FileRow item={r.item} positions={r.positions} />}
              {r.kind === "command" && (
                <>
                  <span className="palette-name">
                    <Highlight text={r.cmd.label} positions={r.positions} from={0} to={r.cmd.label.length} />
                  </span>
                  {r.cmd.shortcut && <kbd className="palette-kbd">{r.cmd.shortcut}</kbd>}
                </>
              )}
              {r.kind === "line" && <span className="palette-name">{r.line}. satıra git</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FileRow({ item, positions }: { item: string; positions: number[] }) {
  const slash = item.lastIndexOf("/");
  return (
    <>
      <FileIcon name={item.slice(slash + 1)} />
      <span className="palette-name">
        <Highlight text={item} positions={positions} from={slash + 1} to={item.length} />
      </span>
      {slash > 0 && (
        <span className="palette-dir">
          <Highlight text={item} positions={positions} from={0} to={slash} />
        </span>
      )}
    </>
  );
}

function Highlight({ text, positions, from, to }: { text: string; positions: number[]; from: number; to: number }) {
  const hits = new Set(positions);
  const parts: React.ReactNode[] = [];
  for (let i = from; i < to; i++) {
    parts.push(hits.has(i) ? <b key={i}>{text[i]}</b> : text[i]);
  }
  return <>{parts}</>;
}
