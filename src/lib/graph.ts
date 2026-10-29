import type { Commit } from "./api";

/** Lane layout for one history row. Lanes hold the hash each one is waiting for. */
export type GraphRow = { commit: Commit; col: number; before: (string | null)[]; after: (string | null)[] };

export function computeGraph(commits: Commit[]): GraphRow[] {
  let lanes: (string | null)[] = [];
  return commits.map((commit) => {
    const before = lanes.slice();
    let col = lanes.indexOf(commit.hash);
    const after = lanes.slice();
    if (col === -1) {
      // A branch tip nobody pointed at yet: take the first free lane
      col = after.indexOf(null);
      if (col === -1) col = after.length;
    }
    // Every lane that was waiting for this commit ends here
    for (let i = 0; i < after.length; i++) if (after[i] === commit.hash) after[i] = null;
    after[col] = commit.parents[0] ?? null;
    for (const p of commit.parents.slice(1)) {
      if (after.includes(p)) continue;
      const free = after.indexOf(null);
      if (free === -1) after.push(p);
      else after[free] = p;
    }
    while (after.length && after[after.length - 1] === null) after.pop();
    lanes = after;
    return { commit, col, before, after };
  });
}

export const LANE_COLORS = ["var(--accent)", "#4c8dff", "#e5a33a", "#3fbf7f", "#d670d6", "#f06a6a", "#29b8db", "#c8b04a"];
