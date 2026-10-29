import { useEffect, useState } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { inTauri } from "./events";

/** The running Kite's version ("0.4.1"), or null outside the app */
export function useAppVersion() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    if (inTauri) getVersion().then(setVersion).catch(() => {});
  }, []);
  return version;
}

export type UpdateCheck = "available" | "latest" | "error";

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Checks GitHub Releases for a newer Kite (release builds only) */
export function useUpdate() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!inTauri || import.meta.env.DEV) return;
    const run = () => check().then((u) => u && setUpdate(u)).catch(() => {});
    run();
    const t = setInterval(run, SIX_HOURS);
    return () => clearInterval(t);
  }, []);

  const install = async () => {
    if (!update) return;
    let total = 0;
    let done = 0;
    setProgress(0);
    await update.downloadAndInstall((e) => {
      if (e.event === "Started") total = e.data.contentLength ?? 0;
      if (e.event === "Progress") {
        done += e.data.chunkLength;
        if (total) setProgress(Math.round((done / total) * 100));
      }
    });
    await relaunch();
  };

  /** Manual check from Settings › About */
  const checkNow = async (): Promise<UpdateCheck> => {
    if (!inTauri) return "error";
    try {
      const u = await check();
      if (u) setUpdate(u);
      return u ? "available" : "latest";
    } catch {
      return "error";
    }
  };

  return { update, progress, install, checkNow };
}
