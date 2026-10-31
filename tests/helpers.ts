import { ANCHORS, SIZE } from "@/lib/game/constants";
import { anchor, createBlocked, setWall } from "@/lib/game/board";
import { isPawnMove } from "@/lib/game/moves";
import { applyMove, legalMoves, newGame } from "@/lib/game/rules";
import { makeRng } from "@/lib/game/rng";
import type { GameState, Orientation, Player } from "@/lib/game/types";

/** Square from chess-style notation: files a–i left to right, ranks 1–9 bottom to top. */
export function sq(name: string): number {
  const col = name.charCodeAt(0) - 97;
  const rank = Number(name.slice(1));
  return (SIZE - rank) * SIZE + col;
}

/** The anchor whose top-left square is `name` (so the wall touches that square). */
export function at(name: string): number {
  const s = sq(name);
  return anchor(Math.floor(s / SIZE), s % SIZE);
}

export interface WallSpec {
  o: Orientation;
  /** Top-left square of the wall's 2×2 block: `h` runs under it and its right neighbour, `v` to its right and below. */
  topLeft: string;
  by?: Player;
}

/** A hand-built position with an empty history. */
export function position(opts: {
  p0: string;
  p1: string;
  walls?: WallSpec[];
  turn?: Player;
  wallsLeft?: [number, number];
}): GameState {
  const base = newGame(opts.turn ?? 0);
  const h = new Uint8Array(ANCHORS);
  const v = new Uint8Array(ANCHORS);
  const blocked = createBlocked();
  for (const w of opts.walls ?? []) {
    const a = at(w.topLeft);
    (w.o === "h" ? h : v)[a] = (w.by ?? 0) + 1;
    setWall(blocked, w.o, a, true);
  }
  return {
    ...base,
    pawns: [sq(opts.p0), sq(opts.p1)],
    h,
    v,
    blocked,
    wallsLeft: opts.wallsLeft ?? [10, 10],
  };
}

/** A legal position reached by seeded random play, mixing pawn moves and walls. */
export function randomPosition(seed: number, plies: number, wallRate = 0.35): GameState {
  const rng = makeRng(seed);
  let s = newGame(seed % 2 === 0 ? 0 : 1);
  for (let i = 0; i < plies && s.winner === null; i++) {
    const moves = legalMoves(s);
    const pawns = moves.filter(isPawnMove);
    const walls = moves.filter((m) => !isPawnMove(m));
    const next = walls.length > 0 && rng.next() < wallRate ? rng.pick(walls) : rng.pick(pawns);
    const after = applyMove(s, next);
    // Stop just short of a finished game so every position still has a mover.
    if (after.winner !== null) break;
    s = after;
  }
  return s;
}
