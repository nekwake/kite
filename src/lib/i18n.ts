// Turkish is the source language; English strings are looked up by the Turkish text.
import { getSettings } from "./settings";
import { EN } from "./i18n.en";

export type Language = "tr" | "en";

export function t(tr: string): string {
  return getSettings().language === "en" ? EN[tr] ?? tr : tr;
}
