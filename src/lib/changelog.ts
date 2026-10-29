import raw from "../../CHANGELOG.md?raw";

export type Release = { version: string; notes: string[] };

/** "## 1.2.0" sections of CHANGELOG.md with their bullet lines */
export const RELEASES: Release[] = raw
  .split(/^## /m)
  .slice(1)
  .map((section) => {
    const [head, ...lines] = section.split("\n");
    return {
      version: head.trim().replace(/^v/, ""),
      notes: lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim()),
    };
  });
