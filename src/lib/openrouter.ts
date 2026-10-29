// OpenRouter chat: OpenAI-compatible API, called straight from the webview.
import { invoke } from "@tauri-apps/api/core";

const API = "https://openrouter.ai/api/v1";

export type Model = { id: string; name: string; context: number; free: boolean; tools: boolean };

export type ToolCall = { id: string; name: string; arguments: string };

/** Messages in the API's shape */
export type ApiMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

export const getKey = () => invoke<string | null>("secret_get", { name: "openrouter" });
export const setKey = (value: string) => invoke<void>("secret_set", { name: "openrouter", value });

let modelCache: Model[] | null = null;

/** All models, free ones first; cached for the session */
export async function listModels(): Promise<Model[]> {
  if (modelCache) return modelCache;
  const res = await fetch(`${API}/models`);
  if (!res.ok) throw new Error(`OpenRouter modelleri alınamadı (${res.status})`);
  const { data } = await res.json();
  modelCache = (data as any[])
    .map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      context: m.context_length ?? 0,
      free: m.pricing?.prompt === "0" && m.pricing?.completion === "0",
      tools: (m.supported_parameters ?? []).includes("tools"),
    }))
    .sort((a, b) => Number(b.free) - Number(a.free) || Number(b.tools) - Number(a.tools) || a.name.localeCompare(b.name));
  return modelCache;
}

/** Read-only tools the model can call to look at the open project */
export const TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file from the project. Path is relative to the project root.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List project files (respects .gitignore). Optionally filter by a substring of the path.",
      parameters: { type: "object", properties: { filter: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "search",
      description: "Search the project for text (case-insensitive, literal). Returns matching lines with file and line number.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "git_diff",
      description: "Show uncommitted changes of the project (git status and diffs of changed files).",
      parameters: { type: "object", properties: {} },
    },
  },
] as const;

type StreamResult = { content: string; toolCalls: ToolCall[] };

/** Streams one completion; text arrives through onText as it is generated */
export async function streamChat(opts: {
  key: string;
  model: string;
  messages: ApiMessage[];
  tools: boolean;
  signal: AbortSignal;
  onText: (full: string) => void;
}): Promise<StreamResult> {
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    signal: opts.signal,
    headers: {
      Authorization: `Bearer ${opts.key}`,
      "Content-Type": "application/json",
      "X-Title": "Kite",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
      ...(opts.tools ? { tools: TOOLS } : {}),
    }),
  });
  if (!res.ok || !res.body) {
    let msg = `${res.status}`;
    try {
      msg = (await res.json()).error?.message ?? msg;
    } catch {}
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const calls: ToolCall[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue; // ": OPENROUTER PROCESSING" keep-alives
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      let chunk: any;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) throw new Error(chunk.error.message ?? "OpenRouter hatası");
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        content += delta.content;
        opts.onText(content);
      }
      // Tool calls arrive in pieces, keyed by index
      for (const tc of delta.tool_calls ?? []) {
        const c = (calls[tc.index ?? 0] ??= { id: "", name: "", arguments: "" });
        if (tc.id) c.id = tc.id;
        if (tc.function?.name) c.name += tc.function.name;
        if (tc.function?.arguments) c.arguments += tc.function.arguments;
      }
    }
  }
  return { content, toolCalls: calls.filter(Boolean) };
}
