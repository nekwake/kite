import { useEffect, useState } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { inTauri } from "./events";

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

  return { update, progress, install };
}
