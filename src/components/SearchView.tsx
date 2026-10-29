import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { Chevron } from "../lib/icons";
import { api, SearchOptions, SearchResult } from "../lib/api";
import { KiteLoader } from "./KiteLogo";

type Props = {
  root: string;
  focusNonce: number;
  onOpenMatch: (path: string, line: number, start: number, end: number) => void;
};

export function SearchView({ root, focusNonce, onOpenMatch }: Props) {
  const [query, setQuery] = useState("");
  const [opts, setOpts] = useState<SearchOptions>({ caseSensitive: false, regex: false, wholeWord: false });
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusNonce]);

  // Search as you type, debounced; stale responses are dropped
  useEffect(() => {
    const id = ++seq.current;
    if (!query) {
      setResult(null);
      setError(null);
      setBusy(false);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api.search(root, query, opts);
        if (id === seq.current) {
          setResult(r);
          setError(null);
          setCollapsed(new Set());
        }
      } catch (e) {
        if (id === seq.current) setError(String(e));
      } finally {
        if (id === seq.current) setBusy(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, opts, root]);

  const total = result?.files.reduce((n, f) => n + f.matches.length, 0) ?? 0;
  const toggle = (k: keyof SearchOptions) => setOpts((o) => ({ ...o, [k]: !o[k] }));

  return (
    <div className="sidebar-section">
      <div className="sidebar-header">
        <span>{t("ARA")}</span>
      </div>
      <div className="search-box">
        <input
          ref={inputRef}
          className="search-input"
          placeholder={t("Ara")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
        <div className="search-toggles">
          <button className={opts.caseSensitive ? "on" : ""} onClick={() => toggle("caseSensitive")} title={t("Büyük/küçük harf duyarlı")}>{t("Aa")}</button>
          <button className={opts.wholeWord ? "on" : ""} onClick={() => toggle("wholeWord")} title={t("Tam kelime")}><u>{t("ab")}</u></button>
          <button className={opts.regex ? "on" : ""} onClick={() => toggle("regex")} title={t("Regex")}>.*</button>
        </div>
      </div>
      <div className="search-summary">
        {error
          ? <span className="search-error">{error}</span>
          : busy
            ? <KiteLoader size={16} label={t("Aranıyor…")} />
            : result && (total === 0
              ? "Sonuç yok"
              : `${result.files.length} dosyada ${total} sonuç${result.truncated ? " (ilk 5000)" : ""}`)}
      </div>
      <div className="tree">
        {result?.files.map((f) => {
          const open = !collapsed.has(f.path);
          const slash = f.relative.lastIndexOf("/");
          return (
            <div key={f.path}>
              <div
                className="tree-row search-file"
                onClick={() =>
                  setCollapsed((c) => {
                    const n = new Set(c);
                    if (open) n.add(f.path);
                    else n.delete(f.path);
                    return n;
                  })
                }
                title={f.relative}
              >
                <span className="tree-chevron"><Chevron open={open} /></span>
                <span className="tree-file">{f.relative.slice(slash + 1)}</span>
                {slash > 0 && <span className="search-dir">{f.relative.slice(0, slash)}</span>}
                <span className="search-count">{f.matches.length}</span>
              </div>
              {open &&
                f.matches.map((m, i) => (
                  <div
                    key={i}
                    className="tree-row search-line"
                    onClick={() => onOpenMatch(f.path, m.line, m.start, m.end)}
                    title={`${m.line}. satır`}
                  >
                    <span>{m.text.slice(0, m.start).trimStart()}</span>
                    <mark>{m.text.slice(m.start, m.end)}</mark>
                    <span>{m.text.slice(m.end)}</span>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
