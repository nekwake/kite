export type FuzzyMatch = { item: string; score: number; positions: number[] };

const isBoundary = (prev: string) => prev === "/" || prev === "_" || prev === "-" || prev === "." || prev === " ";

/**
 * Subsequence match in the spirit of VS Code's quick open: every query
 * character must appear in order. Consecutive runs, word starts and hits in
 * the file name (rather than the folders) score higher.
 */
export function fuzzyMatch(query: string, item: string): FuzzyMatch | null {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return { item, score: 0, positions: [] };
  const lower = item.toLowerCase();
  const nameStart = item.lastIndexOf("/") + 1;

  // Prefer matching inside the file name: try a match that starts there first
  const positions = matchFrom(q, lower, nameStart) ?? matchFrom(q, lower, 0);
  if (!positions) return null;

  let score = 0;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    score += 1;
    if (i > 0 && positions[i - 1] === p - 1) score += 5;
    if (p === 0 || isBoundary(item[p - 1])) score += 8;
    if (p >= nameStart) score += 3;
    if (item[p] !== lower[p] && item[p] === query[i]) score += 1;
  }
  // Shorter paths win ties
  score -= item.length * 0.05;
  if (lower.slice(nameStart).startsWith(q)) score += 20;
  return { item, score, positions };
}

function matchFrom(q: string, lower: string, from: number): number[] | null {
  const positions: number[] = [];
  let j = from;
  for (const ch of q) {
    j = lower.indexOf(ch, j);
    if (j === -1) return null;
    positions.push(j++);
  }
  return positions;
}

export function fuzzyFilter(query: string, items: string[], limit = 50): FuzzyMatch[] {
  const out: FuzzyMatch[] = [];
  for (const item of items) {
    const m = fuzzyMatch(query, item);
    if (m) out.push(m);
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
