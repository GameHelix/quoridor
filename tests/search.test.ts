import { describe, expect, it } from "vitest";
import { GOAL_ROW } from "@/lib/game/constants";
import { ROW } from "@/lib/game/board";
import { pawnMove } from "@/lib/game/moves";
import {
  applyMove,
  distanceToGoal,
  isLegalMove,
  legalMoves,
  legalPawnMoves,
  newGame,
} from "@/lib/game/rules";
import { MATE, evaluate, searchMove } from "@/lib/game/search";
import type { GameState } from "@/lib/game/types";
import { position, randomPosition, sq } from "./helpers";

/**
 * A plain, obviously-correct minimax over every legal move, scored with the
 * same evaluation and terminal rules as the engine. The pruned search, run in
 * full-width mode, must agree with it exactly.
 */
function naive(s: GameState, depth: number, ply = 0): number {
  const me = s.turn;
  const them = me === 0 ? 1 : 0;
  if (s.winner !== null) return -(MATE - ply);
  if (legalPawnMoves(s).some((t) => ROW[t] === GOAL_ROW[me])) return MATE - ply - 1;
  if (depth === 0) {
    return evaluate(distanceToGoal(s, me), distanceToGoal(s, them), s.wallsLeft[me], s.wallsLeft[them]);
  }
  let best = -Infinity;
  for (const m of legalMoves(s)) best = Math.max(best, -naive(applyMove(s, m), depth - 1, ply + 1));
  return best;
}

/** Strip the history so no root move counts as a repetition. */
const fresh = (s: GameState): GameState => ({ ...s, history: [] });

describe("evaluation", () => {
  it("rewards a shorter route and more walls in hand", () => {
    expect(evaluate(5, 7, 4, 4)).toBeGreaterThan(evaluate(6, 7, 4, 4));
    expect(evaluate(5, 7, 5, 4)).toBeGreaterThan(evaluate(5, 7, 4, 4));
  });

  it("scores a race nobody can interfere with as (nearly) decided", () => {
    // Side to move, no walls anywhere: ties go to the mover.
    expect(evaluate(6, 6, 0, 0)).toBeGreaterThan(1000);
    expect(evaluate(7, 6, 0, 0)).toBeLessThan(-1000);
    expect(evaluate(7, 6, 0, 0)).toBeGreaterThan(-MATE / 2);
  });
});

describe("alpha-beta search", () => {
  it("matches a naive minimax exactly when run full width", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = fresh(randomPosition(seed * 11, 8 + seed * 3, 0.5));
      if (legalPawnMoves(s).some((t) => ROW[t] === GOAL_ROW[s.turn])) continue;
      for (const depth of [1, 2]) {
        const r = searchMove(s, { maxDepth: depth, fullWidth: true });
        expect(r.depth).toBe(depth);
        expect(r.score).toBe(naive(s, depth));
      }
    }
  }, 60_000);

  it("matches a naive minimax deep in a wall-less race", () => {
    const s = position({ p0: "e3", p1: "e6", wallsLeft: [0, 0], turn: 0 });
    for (const depth of [3, 4, 5]) {
      expect(searchMove(s, { maxDepth: depth, fullWidth: true }).score).toBe(naive(s, depth));
    }
  });

  it("answers a winning step instantly", () => {
    const s = position({ p0: "c8", p1: "e5", turn: 0 });
    const r = searchMove(s, { timeBudgetMs: 1000 });
    expect(r.move).toBe(pawnMove(sq("c9")));
    expect(r.depth).toBe(0);
  });

  it("finds a forced win a few moves out in a pure race", () => {
    // Both out of walls and four steps from home: the mover wins by running.
    const s = position({ p0: "b5", p1: "h5", wallsLeft: [0, 0], turn: 0 });
    const r = searchMove(s, { timeBudgetMs: 1000 });
    expect(r.score).toBeGreaterThan(MATE - 100);
    expect(isLegalMove(s, r.move)).toBe(true);
    expect(distanceToGoal(applyMove(s, r.move), 0)).toBe(3);
    // One step further back and the same race is lost.
    const behind = position({ p0: "b4", p1: "h5", wallsLeft: [0, 0], turn: 0 });
    expect(searchMove(behind, { timeBudgetMs: 1000 }).score).toBeLessThan(-(MATE - 100));
  });

  it("never mutates the position it is given", () => {
    const s = randomPosition(77, 18, 0.5);
    const snapshot = JSON.stringify({ ...s, h: [...s.h], v: [...s.v], blocked: [...s.blocked] });
    searchMove(s, { maxDepth: 3 });
    expect(JSON.stringify({ ...s, h: [...s.h], v: [...s.v], blocked: [...s.blocked] })).toBe(snapshot);
  });

  it("is deterministic under a node budget", () => {
    const s = randomPosition(5, 12, 0.4);
    const a = searchMove(s, { nodeLimit: 3000 });
    const b = searchMove(s, { nodeLimit: 3000 });
    expect(a.move).toBe(b.move);
    expect(a.score).toBe(b.score);
    expect(isLegalMove(s, a.move)).toBe(true);
  });

  it("deepens past depth 3 within a short budget from the opening", () => {
    const r = searchMove(newGame(), { timeBudgetMs: 400, nearWalls: true });
    expect(r.depth).toBeGreaterThanOrEqual(3);
    expect(isLegalMove(newGame(), r.move)).toBe(true);
  });
});
