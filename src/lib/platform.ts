// macOS vs Windows differences on the UI side. Paths always use "/" here; the
// Rust side converts Windows paths before they reach the UI.
import * as monaco from "monaco-editor";

export const isMac = navigator.userAgent.includes("Mac");
export const isWindows = navigator.userAgent.includes("Windows");

/** Forward slashes, as the UI expects (paths from native dialogs use "\" on Windows) */
export const toSlash = (p: string) => p.replace(/\\/g, "/");

/** Monaco reads "C:/x" as a URI scheme; give Windows paths a leading "/" */
export const modelPath = (p: string) => (p.startsWith("/") ? p : `/${p}`);

export const findModel = (path: string) => monaco.editor.getModels().find((m) => m.uri.path === modelPath(path));

/** ⌘ on macOS, Ctrl on Windows */
export const hasMod = (e: KeyboardEvent | React.KeyboardEvent) => (isMac ? e.metaKey : e.ctrlKey);

/** Shortcut labels are written with Mac symbols; Windows shows them as Ctrl+Shift+… */
export function shortcutText(s: string): string {
  if (isMac) return s;
  return s
    .replace(/⌘⇧/g, "Ctrl+Shift+")
    .replace(/⌥⌘/g, "Ctrl+Alt+")
    .replace(/⌘/g, "Ctrl+")
    .replace(/⇧/g, "Shift+")
    .replace(/⌥/g, "Alt+")
    .replace(/⌫/g, "Backspace")
    .replace(/↵/g, "Enter");
}

export const revealLabel = isWindows ? "Gezgin'de göster" : "Finder'da göster";
