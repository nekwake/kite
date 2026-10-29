import { Icon } from "./icons";

// Small colored glyphs per file type, in the spirit of the Seti icons Cursor ships.

type Icon = { text: string; color: string };

const BY_EXT: Record<string, Icon> = {
  ts: { text: "TS", color: "#4b9ae8" }, tsx: { text: "⚛", color: "#4fc3f7" },
  js: { text: "JS", color: "#e8d44d" }, jsx: { text: "⚛", color: "#4fc3f7" },
  mjs: { text: "JS", color: "#e8d44d" }, cjs: { text: "JS", color: "#e8d44d" },
  json: { text: "{}", color: "#e8c04d" }, md: { text: "M↓", color: "#5fa8d3" }, mdx: { text: "M↓", color: "#f0a33a" },
  css: { text: "#", color: "#5fa8d3" }, scss: { text: "#", color: "#e06c9f" }, less: { text: "#", color: "#5fa8d3" },
  html: { text: "<>", color: "#e8774d" }, vue: { text: "V", color: "#41b883" }, svelte: { text: "S", color: "#ff5d2d" },
  py: { text: "py", color: "#4b8bbe" }, rs: { text: "rs", color: "#dea584" }, go: { text: "go", color: "#00add8" },
  java: { text: "J", color: "#e76f00" }, kt: { text: "K", color: "#a97bff" }, swift: { text: "◆", color: "#f05138" },
  rb: { text: "rb", color: "#cc342d" }, php: { text: "php", color: "#8892bf" }, c: { text: "C", color: "#5c6bc0" },
  h: { text: "h", color: "#a074c4" }, cpp: { text: "C+", color: "#5c6bc0" }, cs: { text: "C#", color: "#68217a" },
  sh: { text: "$", color: "#8fbf6a" }, zsh: { text: "$", color: "#8fbf6a" }, bash: { text: "$", color: "#8fbf6a" },
  yml: { text: "≡", color: "#cb6f6f" }, yaml: { text: "≡", color: "#cb6f6f" }, toml: { text: "≡", color: "#9c8a7a" },
  sql: { text: "db", color: "#e8a24d" }, svg: { text: "◇", color: "#f0a33a" }, png: { text: "▣", color: "#a074c4" },
  jpg: { text: "▣", color: "#a074c4" }, jpeg: { text: "▣", color: "#a074c4" }, gif: { text: "▣", color: "#a074c4" },
  webp: { text: "▣", color: "#a074c4" }, ico: { text: "▣", color: "#a074c4" }, icns: { text: "▣", color: "#a074c4" },
  lock: { text: "🔒", color: "#8a8a8a" }, txt: { text: "≡", color: "#9a9a9a" }, env: { text: "⚙", color: "#e8c04d" },
  graphql: { text: "◈", color: "#e535ab" }, dart: { text: "◢", color: "#40c4ff" }, lua: { text: "☾", color: "#5c6bc0" },
};

const BY_NAME: Record<string, Icon> = {
  "package.json": { text: "⬢", color: "#8bc34a" }, "package-lock.json": { text: "⬢", color: "#8a8a8a" },
  "cargo.toml": { text: "rs", color: "#dea584" }, "cargo.lock": { text: "rs", color: "#8a8a8a" },
  dockerfile: { text: "🐳", color: "#2496ed" }, ".gitignore": { text: "◆", color: "#e8774d" },
  "readme.md": { text: "ℹ", color: "#5fa8d3" }, "tsconfig.json": { text: "TS", color: "#4b9ae8" },
  "vite.config.ts": { text: "⚡", color: "#bd8cff" }, license: { text: "§", color: "#e8c04d" },
};

export function FileIcon({ name, dir, open }: { name: string; dir?: boolean; open?: boolean }) {
  if (dir) {
    return (
      <svg className="ficon-svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c9a86b" strokeWidth="1.8" strokeLinejoin="round">
        {open ? (
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1H7.5a2 2 0 0 0-1.9 1.4L3 19V7zM3 19l2.6-7.6A2 2 0 0 1 7.5 10H21l-2.7 8a2 2 0 0 1-1.9 1H3z" />
        ) : (
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        )}
      </svg>
    );
  }
  const lower = name.toLowerCase();
  const icon = BY_NAME[lower] ?? (lower.startsWith(".env") ? BY_EXT.env : BY_EXT[lower.split(".").pop() ?? ""]);
  if (!icon) return <Icon name="file" size={15} className="ficon-svg ficon-plain" />;
  return (
    <span className="ficon" style={{ color: icon.color }}>
      {icon.text}
    </span>
  );
}
