import { DIFFICULTIES } from "./constants";
import type { Difficulty } from "./types";

/** Games won and lost against one computer tier. */
export interface Tally {
  wins: number;
  losses: number;
}

/** Win/loss records per tier, as persisted in localStorage. */
export type Stats = Partial<Record<Difficulty, Tally>>;

const EMPTY: Tally = { wins: 0, losses: 0 };

function count(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/**
 * The record for one tier. Stored data is untrusted (an older version, a
 * hand-edited value), so anything malformed reads as zero rather than NaN.
 */
export function tallyOf(stats: unknown, difficulty: Difficulty): Tally {
  if (!stats || typeof stats !== "object") return EMPTY;
  const raw = (stats as Record<string, unknown>)[difficulty];
  if (!raw || typeof raw !== "object") return EMPTY;
  const t = raw as Record<string, unknown>;
  return { wins: count(t.wins), losses: count(t.losses) };
}

/** A new stats object with one more win or loss against `difficulty`. */
export function recordResult(stats: unknown, difficulty: Difficulty, won: boolean): Stats {
  const next: Stats = {};
  for (const d of DIFFICULTIES) next[d] = tallyOf(stats, d);
  const t = next[difficulty] ?? EMPTY;
  next[difficulty] = won ? { ...t, wins: t.wins + 1 } : { ...t, losses: t.losses + 1 };
  return next;
}
