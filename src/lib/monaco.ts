import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import cssWorker from "monaco-editor/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/language/html/html.worker?worker";
import tsWorker from "monaco-editor/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

// Bundle Monaco locally instead of loading it from a CDN
loader.config({ monaco });

// Files are opened without their node_modules, so semantic errors would be noise.
// Syntax errors still show.
for (const defaults of [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]) {
  defaults.setDiagnosticsOptions({ noSemanticValidation: true });
  defaults.setCompilerOptions({
    jsx: monaco.typescript.JsxEmit.ReactJSX,
    target: monaco.typescript.ScriptTarget.ESNext,
    allowNonTsExtensions: true,
  });
}

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
  },
});

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", jsonc: "json", md: "markdown", mdx: "markdown",
  css: "css", scss: "scss", less: "less", html: "html", htm: "html", vue: "html",
  py: "python", rs: "rust", go: "go", java: "java", kt: "kotlin", swift: "swift",
  c: "c", h: "c", cpp: "cpp", hpp: "cpp", cs: "csharp", rb: "ruby", php: "php",
  sh: "shell", bash: "shell", zsh: "shell", yml: "yaml", yaml: "yaml", toml: "ini",
  ini: "ini", env: "ini", sql: "sql", xml: "xml", svg: "xml", dockerfile: "dockerfile",
  graphql: "graphql", gql: "graphql", lua: "lua", dart: "dart",
};

export function languageFor(path: string): string {
  const name = path.split("/").pop()!.toLowerCase();
  if (name === "dockerfile") return "dockerfile";
  if (name.startsWith(".env")) return "ini";
  return EXT_LANG[name.split(".").pop() ?? ""] ?? "plaintext";
}
