// Prettier, bundled and loaded on first use. Reads the project's JSON
// .prettierrc when there is one.
import { api } from "./api";
import { getSettings } from "./settings";

const PARSERS: Record<string, string> = {
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  js: "babel", jsx: "babel", mjs: "babel", cjs: "babel",
  json: "json", jsonc: "json", css: "css", scss: "scss", less: "less",
  html: "html", htm: "html", vue: "vue", md: "markdown", mdx: "mdx",
  yml: "yaml", yaml: "yaml", graphql: "graphql", gql: "graphql",
};

export const parserFor = (path: string) => PARSERS[path.split(".").pop()?.toLowerCase() ?? ""] ?? null;

async function loadPrettier() {
  const [prettier, ...plugins] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/babel"),
    import("prettier/plugins/estree"),
    import("prettier/plugins/typescript"),
    import("prettier/plugins/postcss"),
    import("prettier/plugins/html"),
    import("prettier/plugins/markdown"),
    import("prettier/plugins/yaml"),
    import("prettier/plugins/graphql"),
  ]);
  return { prettier, plugins: plugins.map((p) => (p as any).default ?? p) };
}

async function projectConfig(root: string): Promise<Record<string, unknown>> {
  for (const name of [".prettierrc", ".prettierrc.json"]) {
    try {
      return JSON.parse(await api.readFile(`${root}/${name}`));
    } catch {}
  }
  return {};
}

/** Formatted text, or null when the file type isn't supported */
export async function formatText(path: string, text: string, root: string): Promise<string | null> {
  const parser = parserFor(path);
  if (!parser) return null;
  const { prettier, plugins } = await loadPrettier();
  return prettier.format(text, {
    parser,
    plugins,
    tabWidth: getSettings().tabSize,
    ...(await projectConfig(root)),
  });
}
