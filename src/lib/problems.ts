import { useEffect, useState } from "react";
import * as monaco from "monaco-editor";

export type Problem = {
  path: string;
  line: number;
  col: number;
  endCol: number;
  message: string;
  severity: "error" | "warning" | "info";
  source?: string;
};

function collect(): Problem[] {
  return monaco.editor
    .getModelMarkers({})
    .filter((m) => !m.resource.path.startsWith("/__diff__") && m.severity >= monaco.MarkerSeverity.Info)
    .map((m): Problem => ({
      path: m.resource.path,
      line: m.startLineNumber,
      col: m.startColumn,
      endCol: m.startLineNumber === m.endLineNumber ? m.endColumn : m.startColumn,
      message: m.message,
      severity:
        m.severity === monaco.MarkerSeverity.Error ? "error" : m.severity === monaco.MarkerSeverity.Warning ? "warning" : "info",
      source: m.source,
    }))
    .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}

/** Diagnostics Monaco's language workers report for open files */
export function useProblems(): Problem[] {
  const [problems, setProblems] = useState<Problem[]>([]);
  useEffect(() => {
    setProblems(collect());
    const sub = monaco.editor.onDidChangeMarkers(() => setProblems(collect()));
    return () => sub.dispose();
  }, []);
  return problems;
}
