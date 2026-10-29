import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, basename, git, relativeTo } from "../lib/api";
import { ApiMessage, getKey, listModels, Model, setKey, streamChat, ToolCall } from "../lib/openrouter";
import { ChatItem, DEFAULT_MODEL_KEY, getChat, updateChat, useChat } from "../lib/chatStore";
import { DROP_ATTR, DROP_EVENT } from "../lib/drag";
import { Icon } from "../lib/icons";
import { t } from "../lib/i18n";
import { KiteLoader } from "./KiteLogo";

type Props = {
  id: string;
  root: string;
  activeFile: string | null;
  onOpenFile: (path: string) => void;
};

const MAX_FILE_CHARS = 40_000;
const MAX_TOOL_ROUNDS = 8;

export function ChatView({ id, root, activeFile, onOpenFile }: Props) {
  const chat = useChat(id);
  const [key, setKeyState] = useState<string | null | undefined>(undefined);
  const [models, setModels] = useState<Model[] | null>(null);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getKey().then(setKeyState).catch(() => setKeyState(null));
    listModels()
      .then((m) => {
        setModels(m);
        // First chat: pick a free model that can use tools
        if (!getChat(id).model) {
          const pick = m.find((x) => x.free && x.tools) ?? m.find((x) => x.free) ?? m[0];
          if (pick) updateChat(id, (c) => ({ ...c, model: pick.id }));
        }
      })
      .catch(() => setModels([]));
  }, [id]);

  // Files dropped from the tree or Finder become attachments
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const onDrop = (e: Event) => setFiles((f) => [...new Set([...f, ...(e as CustomEvent<string[]>).detail])]);
    el.addEventListener(DROP_EVENT, onDrop);
    return () => el.removeEventListener(DROP_EVENT, onDrop);
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.items]);

  const model = models?.find((m) => m.id === chat.model);

  const send = async () => {
    const text = input.trim();
    if (!text || chat.busy || !key) return;
    setInput("");
    const attached = files;
    setFiles([]);

    // File contents go to the model, the chat shows just their names
    const parts = [text];
    for (const f of attached) {
      try {
        const body = await api.readFile(f);
        parts.push(`\n\nFile ${relativeTo(root, f)}:\n\`\`\`\n${body.slice(0, MAX_FILE_CHARS)}\n\`\`\``);
      } catch (e) {
        parts.push(`\n\n(Could not read ${relativeTo(root, f)}: ${e})`);
      }
    }
    const history: ApiMessage[] = chat.history.length
      ? [...chat.history]
      : [{ role: "system", content: systemPrompt(root) }];
    history.push({ role: "user", content: parts.join("") });
    updateChat(id, (c) => ({ ...c, items: [...c.items, { kind: "user", text, files: attached }], history }));
    run(history);
  };

  /** Streams replies, running tool calls until the model answers in text */
  const run = async (history: ApiMessage[]) => {
    const abort = new AbortController();
    updateChat(id, (c) => ({ ...c, busy: true, abort }));
    let useTools = model?.tools ?? true;
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        updateChat(id, (c) => ({ ...c, items: [...c.items, { kind: "assistant", text: "", streaming: true }] }));
        let result: { content: string; toolCalls: ToolCall[] };
        try {
          result = await streamChat({
            key: key!,
            model: getChat(id).model,
            messages: history,
            tools: useTools,
            signal: abort.signal,
            onText: (full) => setLastAssistant(full, true),
          });
        } catch (e) {
          // Some free models reject tools; retry the same turn without them
          if (useTools && /tool/i.test(String(e))) {
            useTools = false;
            dropLastAssistant();
            round--;
            continue;
          }
          throw e;
        }
        setLastAssistant(result.content, false);
        if (!result.toolCalls.length) {
          history.push({ role: "assistant", content: result.content });
          break;
        }
        if (!result.content) dropLastAssistant();
        history.push({
          role: "assistant",
          content: result.content || null,
          tool_calls: result.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })),
        });
        for (const call of result.toolCalls) {
          const { output, summary } = await runTool(call, root);
          updateChat(id, (c) => ({ ...c, items: [...c.items, { kind: "tool", name: call.name, summary }] }));
          history.push({ role: "tool", tool_call_id: call.id, content: output });
        }
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        dropEmptyAssistant();
        updateChat(id, (c) => ({ ...c, items: [...c.items, { kind: "error", text: String(e).replace(/^Error: /, "") }] }));
      }
    } finally {
      setLastAssistant(null, false);
      updateChat(id, (c) => ({ ...c, busy: false, abort: null, history }));
    }
  };

  const setLastAssistant = (text: string | null, streaming: boolean) =>
    updateChat(id, (c) => {
      const items = [...c.items];
      const i = items.map((x) => x.kind).lastIndexOf("assistant");
      if (i >= 0) {
        const cur = items[i] as Extract<ChatItem, { kind: "assistant" }>;
        items[i] = { kind: "assistant", text: text ?? cur.text, streaming };
      }
      return { ...c, items };
    });

  const dropLastAssistant = () =>
    updateChat(id, (c) => {
      const items = [...c.items];
      const i = items.map((x) => x.kind).lastIndexOf("assistant");
      if (i >= 0) items.splice(i, 1);
      return { ...c, items };
    });

  const dropEmptyAssistant = () =>
    updateChat(id, (c) => ({ ...c, items: c.items.filter((x) => !(x.kind === "assistant" && !x.text)) }));

  if (key === undefined) return <div className="chat-center"><KiteLoader size={22} /></div>;
  if (key === null) return <KeySetup onSaved={setKeyState} />;

  return (
    <div className="chat">
      <div className="chat-top">
        <ModelPicker
          models={models}
          value={chat.model}
          onChange={(m) => {
            updateChat(id, (c) => ({ ...c, model: m }));
            try {
              localStorage.setItem(DEFAULT_MODEL_KEY, m);
            } catch {}
          }}
        />
        {model && !model.tools && <span className="chat-note" title={t("Bu model araç kullanamıyor; dosyaları sürükleyip ekleyebilirsin")}>{t("araçsız")}</span>}
        <button
          className="icon-btn"
          title={t("Sohbeti temizle")}
          onClick={() => updateChat(id, (c) => ({ ...c, items: [], history: [] }))}
          disabled={chat.busy}
        >
          <Icon name="trash" />
        </button>
      </div>

      <div className="chat-list" ref={listRef}>
        {chat.items.length === 0 && (
          <div className="chat-empty">
            <Icon name="sparkle" size={28} />
            <p>{t("Projen hakkında soru sor. Model dosyaları okuyup arama yapabilir.")}</p>
            <small>{t("Dosyaları ağaçtan buraya sürükleyerek ekleyebilirsin.")}</small>
          </div>
        )}
        {chat.items.map((item, i) => (
          <ChatRow key={i} item={item} root={root} onOpenFile={onOpenFile} />
        ))}
      </div>

      <div className="chat-composer" ref={composerRef} {...{ [DROP_ATTR]: "" }}>
        {files.length > 0 && (
          <div className="chat-files">
            {files.map((f) => (
              <span key={f} className="chat-chip" title={f}>
                {basename(f)}
                <button onClick={() => setFiles((x) => x.filter((y) => y !== f))}><Icon name="close" size={11} /></button>
              </span>
            ))}
          </div>
        )}
        <textarea
          className="chat-input"
          placeholder={t("Mesaj yaz… (↵ gönder, ⇧↵ yeni satır)")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={Math.min(8, Math.max(2, input.split("\n").length))}
          spellCheck={false}
        />
        <div className="chat-actions">
          <button
            className="icon-btn"
            title={t("Aktif dosyayı ekle")}
            disabled={!activeFile}
            onClick={() => activeFile && setFiles((f) => [...new Set([...f, activeFile])])}
          >
            <Icon name="filePlus" />
          </button>
          <span className="chat-model-name">{model?.name ?? chat.model}</span>
          {chat.busy ? (
            <button className="secondary-btn" onClick={() => chat.abort?.abort()}>{t("Durdur")}</button>
          ) : (
            <button className="primary-btn" disabled={!input.trim()} onClick={send}>{t("Gönder")}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function systemPrompt(root: string) {
  return [
    "You are a coding assistant inside Kite, a lightweight code editor.",
    `The user's project is at ${root}. Use the tools to read files, list files, search and see git changes before answering questions about the code.`,
    "Paths you pass to tools are relative to the project root. Be concise. Use Markdown with fenced code blocks. Reply in the language the user writes in.",
  ].join(" ");
}

async function runTool(call: ToolCall, root: string): Promise<{ output: string; summary: string }> {
  let args: any = {};
  try {
    args = JSON.parse(call.arguments || "{}");
  } catch {}
  const abs = (p: string) => (p?.startsWith("/") ? p : `${root}/${String(p ?? "").replace(/^\.\//, "")}`);
  try {
    switch (call.name) {
      case "read_file": {
        const body = await api.readFile(abs(args.path));
        return { output: body.slice(0, MAX_FILE_CHARS), summary: `${args.path} ${t("okundu")}` };
      }
      case "list_files": {
        const all = await api.listFiles(root);
        const f = String(args.filter ?? "").toLowerCase();
        const hits = all.filter((x) => x.toLowerCase().includes(f));
        return { output: hits.slice(0, 500).join("\n") || "(no files)", summary: `${hits.length} ${t("dosya listelendi")}` };
      }
      case "search": {
        const r = await api.search(root, String(args.query ?? ""), { caseSensitive: false, regex: false, wholeWord: false });
        const lines = r.files.flatMap((f) => f.matches.map((m) => `${f.relative}:${m.line}: ${m.text.trim()}`));
        return { output: lines.slice(0, 200).join("\n") || "(no matches)", summary: `"${args.query}" ${t("arandı")}, ${lines.length} ${t("sonuç")}` };
      }
      case "git_diff": {
        const s = await git.status(root);
        const parts = [`branch: ${s.branch}`, ...s.changes.map((c) => `${c.status} ${c.rel}${c.staged ? " (staged)" : ""}`)];
        for (const c of s.changes.slice(0, 15)) {
          const v = await git.fileVersions(root, c.path, c.staged).catch(() => null);
          if (v) parts.push(`\n--- ${c.rel} (before)\n${v.original.slice(0, 4000)}\n+++ ${c.rel} (after)\n${v.modified.slice(0, 4000)}`);
        }
        return { output: parts.join("\n"), summary: `${t("git değişiklikleri okundu")} (${s.changes.length})` };
      }
    }
    return { output: `Unknown tool ${call.name}`, summary: call.name };
  } catch (e) {
    return { output: `Error: ${e}`, summary: `${call.name}: ${t("hata")}` };
  }
}

function ChatRow({ item, root, onOpenFile }: { item: ChatItem; root: string; onOpenFile: (p: string) => void }) {
  if (item.kind === "user") {
    return (
      <div className="chat-msg user">
        <div className="chat-bubble">{item.text}</div>
        {item.files.length > 0 && (
          <div className="chat-files right">
            {item.files.map((f) => (
              <button key={f} className="chat-chip" onClick={() => onOpenFile(f)}>{relativeTo(root, f)}</button>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (item.kind === "tool") {
    return (
      <div className="chat-tool">
        <Icon name={item.name === "search" ? "search" : item.name === "git_diff" ? "history" : "file"} size={13} />
        {item.summary}
      </div>
    );
  }
  if (item.kind === "error") return <div className="chat-error">{item.text}</div>;
  return (
    <div className="chat-msg assistant">
      {item.text ? <Markdown text={item.text} /> : item.streaming && <KiteLoader size={18} />}
    </div>
  );
}

/** Minimal, safe Markdown: fenced code, headings, lists, inline code, bold, links */
function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => text.split(/(```[\s\S]*?(?:```|$))/g), [text]);
  return (
    <div className="md">
      {blocks.map((b, i) => {
        if (b.startsWith("```")) {
          const body = b.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
          const lang = b.match(/^```(\w+)/)?.[1];
          return <CodeBlock key={i} code={body} lang={lang} />;
        }
        return <Paragraphs key={i} text={b} />;
      })}
    </div>
  );
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="md-code">
      <div className="md-code-head">
        <span>{lang ?? ""}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? t("Kopyalandı") : t("Kopyala")}
        </button>
      </div>
      <pre>{code}</pre>
    </div>
  );
}

function Paragraphs({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`l${out.length}`}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  lines.forEach((line, i) => {
    const li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
    if (li) return list.push(li[1]);
    flush();
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) out.push(<div key={i} className={`md-h md-h${h[1].length}`}>{inline(h[2])}</div>);
    else if (line.trim()) out.push(<p key={i}>{inline(line)}</p>);
  });
  flush();
  return <>{out}</>;
}

function inline(s: string): ReactNode[] {
  const parts = s.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((p, i) => {
    if (p.startsWith("`") && p.endsWith("`") && p.length > 1) return <code key={i}>{p.slice(1, -1)}</code>;
    if (p.startsWith("**") && p.endsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
    const link = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <a key={i} href="#" onClick={(e) => { e.preventDefault(); openUrl(link[2]); }}>{link[1]}</a>
      );
    }
    return p;
  });
}

function KeySetup({ onSaved }: { onSaved: (k: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="chat-center">
      <div className="chat-setup">
        <Icon name="sparkle" size={28} />
        <h3>OpenRouter</h3>
        <p>{t("Ücretsiz modelleri kullanmak için bir OpenRouter API anahtarı gerekiyor. Anahtar macOS Anahtar Zinciri'nde saklanır.")}</p>
        <button className="link-btn" onClick={() => openUrl("https://openrouter.ai/keys")}>openrouter.ai/keys ↗</button>
        <input
          className="search-input"
          placeholder="sk-or-v1-…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
          type="password"
        />
        {error && <div className="git-error">{error}</div>}
        <button
          className="primary-btn"
          disabled={!value.trim()}
          onClick={() =>
            setKey(value.trim())
              .then(() => onSaved(value.trim()))
              .catch((e) => setError(String(e)))
          }
        >
          {t("Kaydet")}
        </button>
      </div>
    </div>
  );
}

function ModelPicker({ models, value, onChange }: { models: Model[] | null; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [freeOnly, setFreeOnly] = useState(true);
  const current = models?.find((m) => m.id === value);
  const shown = (models ?? [])
    .filter((m) => (!freeOnly || m.free) && `${m.name} ${m.id}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 200);
  return (
    <div className="model-picker">
      <button className="model-btn" onClick={() => setOpen(!open)}>
        <span>{current?.name ?? (value || t("Model seç"))}</span>
        {current?.free && <span className="badge-free">{t("ücretsiz")}</span>}
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div className="model-menu" onMouseLeave={() => setOpen(false)}>
          <input autoFocus className="search-input" placeholder={t("Model ara")} value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="model-free">
            <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> {t("Sadece ücretsiz")}
          </label>
          <div className="model-list">
            {models === null && <KiteLoader size={16} />}
            {shown.map((m) => (
              <button
                key={m.id}
                className={`model-item ${m.id === value ? "on" : ""}`}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                title={m.id}
              >
                <span className="model-name">{m.name}</span>
                <span className="model-meta">
                  {m.tools && <span title={t("Araç kullanabilir")}>⚒</span>}
                  {m.context ? `${Math.round(m.context / 1000)}k` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
