import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@xterm/xterm/css/xterm.css";
import { api } from "../lib/api";
import { currentAccent } from "../lib/theme";
import { getSettings, Settings } from "../lib/settings";
import { DROP_ATTR, DROP_EVENT } from "../lib/drag";

export type TermTab = { id: number; title: string; cwd: string; command?: string };

type Props = {
  tabs: TermTab[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onClose: (id: number) => void;
  onHide: () => void;
};

export function TerminalPanel({ tabs, activeId, onSelect, onNew, onClose, onHide }: Props) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-tabs">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={`panel-tab ${t.id === activeId ? "active" : ""}`}
              onClick={() => onSelect(t.id)}
            >
              <span>{t.title}</span>
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.id);
                }}
              >
                <span className="x">×</span>
              </button>
            </div>
          ))}
        </div>
        <div className="panel-actions">
          <button className="icon-btn" onClick={onNew} title="Yeni terminal (⌘T)">+</button>
          <button className="icon-btn" onClick={onHide} title="Paneli gizle (⌘J)">⌄</button>
        </div>
      </div>
      <div className="panel-body">
        {tabs.map((t) => (
          <TerminalView
            key={t.id}
            tab={t}
            active={t.id === activeId}
            onExit={() => onClose(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

const THEME = {
  background: "#141414",
  foreground: "#d4d4d4",
  cursor: "#c6e05a",
  cursorAccent: "#141414",
  selectionBackground: "#ffffff30",
  black: "#1e1e1e", red: "#f14c4c", green: "#23d18b", yellow: "#f5f543",
  blue: "#3b8eea", magenta: "#d670d6", cyan: "#29b8db", white: "#e5e5e5",
  brightBlack: "#666666", brightRed: "#f14c4c", brightGreen: "#23d18b",
  brightYellow: "#f5f543", brightBlue: "#3b8eea", brightMagenta: "#d670d6",
  brightCyan: "#29b8db", brightWhite: "#ffffff",
};

type ViewProps = { tab: Pick<TermTab, "cwd" | "command">; active: boolean; onExit: () => void };

/** Text to type for dropped paths: `@relative` mentions for Claude, quoted paths for a shell */
export function pathsForTerminal(paths: string[], cwd: string, claude: boolean): string {
  return (
    paths
      .map((p) => {
        const rel = p.startsWith(cwd + "/") ? p.slice(cwd.length + 1) : p;
        if (claude) return `@${rel}`;
        return /[^\w@%+=:,./-]/.test(rel) ? `'${rel.replace(/'/g, "'\\''")}'` : rel;
      })
      .join(" ") + " "
  );
}

export function TerminalView({ tab, active, onExit }: ViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    const term = new Terminal({
      fontFamily: "'SF Mono', Menlo, monospace",
      fontSize: getSettings().terminalFontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      allowProposedApi: true,
      macOptionIsMeta: true,
      scrollback: 10000,
      theme: { ...THEME, cursor: currentAccent() },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((_e, uri) => openUrl(uri)));
    term.open(hostRef.current!);
    termRef.current = term;
    fitRef.current = fit;
    try {
      fit.fit();
    } catch {}

    let ptyId: number | null = null;
    let disposed = false;

    api
      .ptySpawn(tab.cwd, term.cols, term.rows, (e) => {
        if (e.type === "output") term.write(e.data);
        else if (!disposed) onExitRef.current();
      })
      .then((id) => {
        if (disposed) {
          api.ptyKill(id);
          return;
        }
        ptyId = id;
        if (tab.command) api.ptyWrite(id, tab.command + "\r");
      })
      .catch((err) => term.write(`\r\n\x1b[31mTerminal açılamadı: ${err}\x1b[0m\r\n`));

    term.onData((data) => ptyId !== null && api.ptyWrite(ptyId, data));
    term.onResize(({ cols, rows }) => ptyId !== null && api.ptyResize(ptyId, cols, rows));

    const ro = new ResizeObserver(() => {
      if (hostRef.current?.offsetParent) {
        try {
          fit.fit();
        } catch {}
      }
    });
    ro.observe(hostRef.current!);

    const onAccent = (e: Event) => {
      term.options.theme = { ...THEME, cursor: (e as CustomEvent<string>).detail };
    };
    window.addEventListener("kite-accent", onAccent);

    const onSettings = (e: Event) => {
      term.options.fontSize = (e as CustomEvent<Settings>).detail.terminalFontSize;
      try {
        fit.fit();
      } catch {}
    };
    window.addEventListener("kite-settings", onSettings);

    // Files dragged from the tree or Finder are typed in as paths
    const host = hostRef.current!;
    const onDrop = (e: Event) => {
      const paths = (e as CustomEvent<string[]>).detail;
      if (ptyId === null || !paths.length) return;
      api.ptyWrite(ptyId, pathsForTerminal(paths, tab.cwd, !!tab.command?.startsWith("claude")));
      term.focus();
    };
    host.addEventListener(DROP_EVENT, onDrop);

    return () => {
      disposed = true;
      ro.disconnect();
      window.removeEventListener("kite-accent", onAccent);
      window.removeEventListener("kite-settings", onSettings);
      host.removeEventListener(DROP_EVENT, onDrop);
      if (ptyId !== null) api.ptyKill(ptyId);
      term.dispose();
    };
    // A terminal lives for the lifetime of its tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {}
      termRef.current?.focus();
    });
  }, [active]);

  return (
    <div
      ref={hostRef}
      className="terminal-host"
      {...{ [DROP_ATTR]: "" }}
      style={{ display: active ? "block" : "none" }}
    />
  );
}
