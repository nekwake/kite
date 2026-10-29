import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./events";

type Window = { used_percentage?: number; resets_at?: number | string };
export type ClaudeUsage = {
  enabled: boolean;
  otherStatusLine: boolean;
  rateLimits: { five_hour?: Window; seven_day?: Window } | null;
  updated: number | null;
};

export const usageApi = {
  get: () => invoke<ClaudeUsage>("claude_usage"),
  enable: () => invoke<void>("claude_usage_enable"),
  disable: () => invoke<void>("claude_usage_disable"),
};

/** Claude's 5-hour / 7-day usage, refreshed every 30 s and on focus */
export function useClaudeUsage() {
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);
  const refresh = useCallback(() => {
    if (inTauri) usageApi.get().then(setUsage).catch(() => setUsage(null));
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("kite-usage-changed", refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("kite-usage-changed", refresh);
    };
  }, [refresh]);
  return usage;
}

/** resets_at arrives as Unix seconds or an ISO string */
export function resetTime(w?: Window): Date | null {
  if (!w?.resets_at) return null;
  const d = typeof w.resets_at === "number" ? new Date(w.resets_at * 1000) : new Date(w.resets_at);
  return isNaN(d.getTime()) ? null : d;
}

export const pct = (w?: Window) => (typeof w?.used_percentage === "number" ? Math.round(w.used_percentage) : null);

export const level = (p: number | null) => (p === null ? "" : p >= 90 ? "high" : p >= 70 ? "mid" : "low");
