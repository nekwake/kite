import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { fuzzyFilter } from "../lib/fuzzy";
import { KiteLoader } from "./KiteLogo";

type Props = {
  root: string;
  recent: string[];
  onOpen: (path: string) => void;
  onClose: () => void;
};

export function QuickOpen({ root, recent, onOpen, onClose }: Props) {
  const [files, setFiles] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Re-listed on every open so new files show up without a watcher
  useEffect(() => {
    api.listFiles(root).then(setFiles).catch(() => setFiles([]));
  }, [root]);

  const results = useMemo(() => {
    if (!files) return [];
    if (!query.trim()) {
      // Empty query: recently opened files first, then the rest
      const rel = recent.map((p) => p.slice(root.length + 1)).filter((p) => files.includes(p));
      const rest = files.filter((f) => !rel.includes(f));
      return [...rel, ...rest].slice(0, 50).map((item) => ({ item, positions: [] as number[] }));
    }
    return fuzzyFilter(query, files);
  }, [files, query, recent, root]);

  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const pick = (rel: string | undefined) => {
    if (!rel) return;
    onOpen(`${root}/${rel}`);
    onClose();
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="palette-input"
          placeholder="Dosya adı yaz…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((s) => Math.min(s + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter") {
              pick(results[selected]?.item);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
        />
        <div className="palette-list" ref={listRef}>
          {files === null && <div className="palette-empty"><KiteLoader size={20} label="Dosyalar listeleniyor…" /></div>}
          {files && results.length === 0 && <div className="palette-empty">Eşleşen dosya yok</div>}
          {results.map((r, i) => {
            const slash = r.item.lastIndexOf("/");
            return (
              <div
                key={r.item}
                className={`palette-item ${i === selected ? "selected" : ""}`}
                onMouseMove={() => setSelected(i)}
                onClick={() => pick(r.item)}
              >
                <span className="palette-name">
                  <Highlight text={r.item} positions={r.positions} from={slash + 1} to={r.item.length} />
                </span>
                {slash > 0 && (
                  <span className="palette-dir">
                    <Highlight text={r.item} positions={r.positions} from={0} to={slash} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
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
