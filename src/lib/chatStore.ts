// Chat state lives outside React so a reply keeps streaming while its tab is hidden.
import { useEffect, useState } from "react";
import { ApiMessage } from "./openrouter";

export type ChatItem =
  | { kind: "user"; text: string; files: string[] }
  | { kind: "assistant"; text: string; streaming?: boolean }
  | { kind: "tool"; name: string; summary: string }
  | { kind: "error"; text: string };

export type Chat = {
  items: ChatItem[];
  /** What is sent to the API (includes file contents and tool results) */
  history: ApiMessage[];
  model: string;
  busy: boolean;
  abort: AbortController | null;
};

const chats = new Map<string, Chat>();
const listeners = new Map<string, Set<() => void>>();

export const DEFAULT_MODEL_KEY = "kite.openrouterModel";

export function getChat(id: string): Chat {
  let c = chats.get(id);
  if (!c) {
    let model = "";
    try {
      model = localStorage.getItem(DEFAULT_MODEL_KEY) ?? "";
    } catch {}
    c = { items: [], history: [], model, busy: false, abort: null };
    chats.set(id, c);
  }
  return c;
}

export function updateChat(id: string, fn: (c: Chat) => Chat) {
  chats.set(id, fn(getChat(id)));
  listeners.get(id)?.forEach((l) => l());
}

export function dropChat(id: string) {
  getChat(id).abort?.abort();
  chats.delete(id);
}

export function useChat(id: string): Chat {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    if (!listeners.has(id)) listeners.set(id, new Set());
    listeners.get(id)!.add(l);
    return () => {
      listeners.get(id)?.delete(l);
    };
  }, [id]);
  return getChat(id);
}
