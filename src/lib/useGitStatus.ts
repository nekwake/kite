import { useCallback, useEffect, useState } from "react";
import { git, GitStatus } from "./api";

/** Polls `git status` while a folder is open, and right away on window focus. */
export function useGitStatus(root: string | null) {
  const [status, setStatus] = useState<GitStatus | null>(null);

  const refresh = useCallback(async () => {
    if (!root) return;
    try {
      setStatus(await git.status(root));
    } catch {
      setStatus(null);
    }
  }, [root]);

  useEffect(() => {
    setStatus(null);
    refresh();
    const timer = setInterval(refresh, 4000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  return { status, refresh };
}
