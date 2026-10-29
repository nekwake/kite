import { useEffect, useState } from "react";

export type Settings = {
  editorFontSize: number;
  terminalFontSize: number;
  autoSave: boolean;
  minimap: boolean;
  wordWrap: boolean;
  tabSize: number;
  language: "tr" | "en";
  /** Desktop notifications from terminals (Claude finished, bell, OSC 9/777) */
  notifyTerminal: boolean;
  /** Only notify while Kite is in the background */
  notifyOnlyUnfocused: boolean;
  /** Bottom panel spans the whole width, or only the left editor group */
  panelFullWidth: boolean;
  formatOnSave: boolean;
};

const KEY = "kite.settings";
export const DEFAULT_SETTINGS: Settings = {
  editorFontSize: 13,
  terminalFontSize: 13,
  autoSave: false,
  minimap: false,
  wordWrap: false,
  tabSize: 2,
  language: "tr",
  notifyTerminal: true,
  notifyOnlyUnfocused: true,
  panelFullWidth: false,
  formatOnSave: false,
};

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let current = loadSettings();

export const getSettings = () => current;

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  current.editorFontSize = Math.min(28, Math.max(9, current.editorFontSize));
  current.terminalFontSize = Math.min(28, Math.max(9, current.terminalFontSize));
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {}
  window.dispatchEvent(new CustomEvent("kite-settings", { detail: current }));
}

/** ⌘= / ⌘- / ⌘0 scale editor and terminal together */
export function zoom(delta: number | "reset") {
  if (delta === "reset") {
    updateSettings({ editorFontSize: DEFAULT_SETTINGS.editorFontSize, terminalFontSize: DEFAULT_SETTINGS.terminalFontSize });
  } else {
    updateSettings({ editorFontSize: current.editorFontSize + delta, terminalFontSize: current.terminalFontSize + delta });
  }
}

export function useSettings(): Settings {
  const [s, setS] = useState(current);
  useEffect(() => {
    const on = (e: Event) => setS((e as CustomEvent<Settings>).detail);
    window.addEventListener("kite-settings", on);
    return () => window.removeEventListener("kite-settings", on);
  }, []);
  return s;
}
