import ReactDOM from "react-dom/client";
import "./lib/monaco";
// xterm's own styles hide its input textarea; loaded here so they never drop out
import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { applyAccent, storedAccent } from "./lib/theme";
import App from "./App";

// Hide the WebView's browser menu (Reload, Inspect Element…). Text fields keep
// their native copy/paste menu, and Monaco draws its own. In dev, ⌥ + right
// click still opens the inspector.
document.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest("input, textarea, .monaco-editor")) return;
  if (import.meta.env.DEV && e.altKey) return;
  e.preventDefault();
});

applyAccent(storedAccent(), false);

// No StrictMode: its double-mount would spawn every shell twice in dev
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
