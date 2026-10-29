// In-app notification center: everything Kite reports lands here, whether or
// not a desktop notification was also shown.
import { useEffect, useState } from "react";

export type Notice = {
  id: number;
  kind: "info" | "success" | "error";
  title: string;
  body?: string;
  time: number;
};

let items: Notice[] = [];
let unread = 0;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const MAX = 50;

export function pushNotice(n: Omit<Notice, "id" | "time">) {
  // The same message twice in a row only bumps its time
  if (items[0] && items[0].title === n.title && items[0].body === n.body) {
    items = [{ ...items[0], time: Date.now() }, ...items.slice(1)];
  } else {
    items = [{ ...n, id: nextId++, time: Date.now() }, ...items].slice(0, MAX);
    unread++;
  }
  emit();
}

export function dismissNotice(id: number) {
  items = items.filter((n) => n.id !== id);
  emit();
}

export function clearNotices() {
  items = [];
  unread = 0;
  emit();
}

export function markNoticesRead() {
  if (!unread) return;
  unread = 0;
  emit();
}

export function useNotices() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { items, unread };
}
