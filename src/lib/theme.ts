import * as monaco from "monaco-editor";

export type AccentPreset = { id: string; name: string; color: string };

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "lemon", name: "Limon", color: "#c6e05a" },
  { id: "white", name: "Beyaz", color: "#ececec" },
  { id: "mint", name: "Nane", color: "#3ddc97" },
  { id: "sky", name: "Gökyüzü", color: "#4c8dff" },
  { id: "violet", name: "Mor", color: "#a78bfa" },
  { id: "coral", name: "Mercan", color: "#ff7a59" },
  { id: "rose", name: "Gül", color: "#ff6fae" },
];

const ACCENT_KEY = "kite.accent";
export const DEFAULT_ACCENT = ACCENT_PRESETS[0].color;

// Neon was retired; anyone who had picked it moves to the default (Lemon)
const RETIRED = new Set(["#ddff00"]);

export function storedAccent(): string {
  try {
    const c = localStorage.getItem(ACCENT_KEY) ?? DEFAULT_ACCENT;
    return RETIRED.has(c.toLowerCase()) ? DEFAULT_ACCENT : c;
  } catch {
    return DEFAULT_ACCENT;
  }
}

/** Dark text on light accents, light text on dark ones (WCAG relative luminance). */
function onAccent(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#12140a" : "#ffffff";
}

export function defineMonacoTheme(accent: string) {
  monaco.editor.defineTheme("kite-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#181818",
      "editorGutter.background": "#181818",
      "editor.lineHighlightBackground": "#ffffff08",
      "editorLineNumber.foreground": "#5a5a5a",
      "editorLineNumber.activeForeground": "#c8c8c8",
      "editorIndentGuide.background1": "#ffffff10",
      "editorWidget.background": "#202020",
      "editorWidget.border": "#2e2e2e",
      "editorCursor.foreground": accent,
    },
  });
}

/** Applies the accent everywhere: CSS variables, Monaco, and open terminals (via event). */
export function applyAccent(color: string, persist = true) {
  const root = document.documentElement.style;
  root.setProperty("--accent", color);
  root.setProperty("--on-accent", onAccent(color));
  root.setProperty("--accent-soft", `${color}17`);
  root.setProperty("--accent-border", `${color}70`);
  defineMonacoTheme(color);
  monaco.editor.setTheme("kite-dark");
  window.dispatchEvent(new CustomEvent("kite-accent", { detail: color }));
  if (persist) {
    try {
      localStorage.setItem(ACCENT_KEY, color);
    } catch {}
  }
}

export const currentAccent = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || DEFAULT_ACCENT;
