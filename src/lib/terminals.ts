// Terminal sessions live outside React: each owns a detached <div> that whatever
// slot shows it appends. Moving a tab between editor groups then re-parents the
// element instead of remounting, so the shell (and Claude) keeps running.

import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "./api";
import { currentAccent } from "./theme";
import { getSettings, Settings } from "./settings";
import { DROP_ATTR, DROP_EVENT } from "./drag";

export type TerminalSession = {
  el: HTMLDivElement;
  refit: () => void;
  focus: () => void;
  dispose: () => void;
};

const THEME = {
  background: "#141414",
  foreground: "#d4d4d4",
  cursorAccent: "#141414",
  selectionBackground: "#ffffff30",
  black: "#1e1e1e", red: "#f14c4c", green: "#23d18b", yellow: "#f5f543",
  blue: "#3b8eea", magenta: "#d670d6", cyan: "#29b8db", white: "#e5e5e5",
  brightBlack: "#666666", brightRed: "#f14c4c", brightGreen: "#23d18b",
  brightYellow: "#f5f543", brightBlue: "#3b8eea", brightMagenta: "#d670d6",
  brightCyan: "#29b8db", brightWhite: "#ffffff",
};

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

export function createTerminal(opts: { cwd: string; command?: string; onExit: () => void }): TerminalSession {
  const el = document.createElement("div");
  el.className = "terminal-host";
  el.setAttribute(DROP_ATTR, "");

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
  term.open(el);

  const refit = () => {
    if (!el.isConnected || !el.offsetParent) return;
    try {
      fit.fit();
    } catch {}
  };

  let ptyId: number | null = null;
  let disposed = false;

  // Start the shell once the element is on screen and measured, so its first
  // prompt is drawn at the real width (a wrong width leaves stray "%" lines)
  const spawn = () =>
    api
      .ptySpawn(opts.cwd, term.cols, term.rows, (e) => {
        if (e.type === "output") term.write(e.data);
        else if (!disposed) opts.onExit();
      })
      .then((id) => {
        if (disposed) {
          api.ptyKill(id);
          return;
        }
        ptyId = id;
        if (opts.command) api.ptyWrite(id, opts.command + "\r");
      })
      .catch((err) => term.write(`\r\n\x1b[31mTerminal açılamadı: ${err}\x1b[0m\r\n`));
  requestAnimationFrame(() => {
    if (disposed) return;
    refit();
    spawn();
  });

  term.onData((data) => ptyId !== null && api.ptyWrite(ptyId, data));
  term.onResize(({ cols, rows }) => ptyId !== null && api.ptyResize(ptyId, cols, rows));

  const ro = new ResizeObserver(refit);
  ro.observe(el);

  const onAccent = (e: Event) => {
    term.options.theme = { ...THEME, cursor: (e as CustomEvent<string>).detail };
  };
  const onSettings = (e: Event) => {
    term.options.fontSize = (e as CustomEvent<Settings>).detail.terminalFontSize;
    refit();
  };
  // Files dragged from the tree or Finder are typed in as paths
  const onDrop = (e: Event) => {
    const paths = (e as CustomEvent<string[]>).detail;
    if (ptyId === null || !paths.length) return;
    api.ptyWrite(ptyId, pathsForTerminal(paths, opts.cwd, !!opts.command?.startsWith("claude")));
    term.focus();
  };
  window.addEventListener("kite-accent", onAccent);
  window.addEventListener("kite-settings", onSettings);
  el.addEventListener(DROP_EVENT, onDrop);

  return {
    el,
    refit,
    focus: () => term.focus(),
    dispose: () => {
      disposed = true;
      ro.disconnect();
      window.removeEventListener("kite-accent", onAccent);
      window.removeEventListener("kite-settings", onSettings);
      el.removeEventListener(DROP_EVENT, onDrop);
      if (ptyId !== null) api.ptyKill(ptyId);
      term.dispose();
      el.remove();
    },
  };
}

// Editor-area terminals (Claude sessions), keyed by tab id
const registry = new Map<string, TerminalSession>();

export function ensureTerminal(id: string, opts: Parameters<typeof createTerminal>[0]): TerminalSession {
  let s = registry.get(id);
  if (!s) {
    s = createTerminal(opts);
    registry.set(id, s);
  }
  return s;
}

/** Disposes registry terminals whose tab is gone */
export function pruneTerminals(liveIds: Set<string>) {
  for (const [id, s] of registry) {
    if (!liveIds.has(id)) {
      s.dispose();
      registry.delete(id);
    }
  }
}

export const terminalElement = (id: string) => registry.get(id)?.el ?? null;
