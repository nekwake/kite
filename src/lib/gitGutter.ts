import { diffLines } from "diff";
import type * as monaco from "monaco-editor";

export type LineChange = { kind: "added" | "modified" | "deleted"; start: number; end: number };

/** Line ranges (1-based, in `current`) that differ from `base`, like VS Code's gutter */
export function lineChanges(base: string, current: string): LineChange[] {
  const out: LineChange[] = [];
  let line = 1;
  const parts = diffLines(base, current);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const count = p.count ?? 0;
    if (p.removed) {
      const next = parts[i + 1];
      if (next?.added) {
        const n = next.count ?? 0;
        out.push({ kind: "modified", start: line, end: line + n - 1 });
        line += n;
        i++;
      } else {
        out.push({ kind: "deleted", start: Math.max(1, line - 1), end: Math.max(1, line - 1) });
      }
    } else if (p.added) {
      out.push({ kind: "added", start: line, end: line + count - 1 });
      line += count;
    } else {
      line += count;
    }
  }
  return out;
}

export function gutterDecorations(changes: LineChange[]): monaco.editor.IModelDeltaDecoration[] {
  return changes.map((c) => ({
    range: { startLineNumber: c.start, startColumn: 1, endLineNumber: c.end, endColumn: 1 },
    options: {
      isWholeLine: true,
      linesDecorationsClassName: `gutter-${c.kind}`,
      overviewRuler: { color: c.kind === "added" ? "#4caf5099" : c.kind === "modified" ? "#4c8dff99" : "#f1484899", position: 4 },
    },
  }));
}
