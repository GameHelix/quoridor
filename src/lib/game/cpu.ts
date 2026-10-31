import { GOAL_ROW, HARD_BUDGET_MS } from "./constants";
import { ROW, pathLength, setWall, shortestPath, wallsAcross } from "./board";
import { pawnMove, wallMove } from "./moves";
import {
  distanceToGoal,
  isLegalMove,
  legalPawnMoves,
  opponent,
  wallError,
} from "./rules";
import { searchMove, type SearchOptions } from "./search";
import type { Rng } from "./rng";
import type { Difficulty, GameState, Move, Player } from "./types";

/**
 * The computer opponent's three tiers:
 *
 * - **Easy** walks a shortest path most of the time, sometimes wanders, and
 *   now and then drops a wall across your path.
 * - **Medium** runs a three-ply search over pawn moves and path-cutting
 *   walls, scored by the race margin and walls in hand, with a little noise.
 *   (Three, not two: with an even depth the opponent always has the last
 *   word, and a two-ply player dithers, afraid of walls that never come.)
 * - **Hard** runs iterative-deepening alpha-beta (PVS, killer moves, pruned
 *   walls near both pawns and along your path) under a ~1 s budget, usually
 *   completing 8–10 plies on a laptop.
 *
 * Every tier takes an immediate win when there is one and only ever returns a
 * legal move.
 */

export interface CpuOptions {
  /** Override the tier's time budget (ms). */
  timeBudgetMs?: number;
  /** Cap the search depth (Medium / Hard). */
  maxDepth?: number;
  /** Deterministic node budget instead of the clock (tests). */
  nodeLimit?: number;
  now?: () => number;
}

const MEDIUM: SearchOptions = {
  maxDepth: 3,
  wallCap: 6,
  nearWalls: false,
  exactRoot: true,
  rootNoise: 35,
  timeBudgetMs: 600,
};

const HARD: SearchOptions = {
  maxDepth: 32,
  wallCap: 8,
  nearWalls: true,
  timeBudgetMs: HARD_BUDGET_MS,
};

/** A pawn move that ends the game right now, if the side to move has one. */
export function winningMove(state: GameState): Move | null {
  const goal = GOAL_ROW[state.turn];
  for (const sq of legalPawnMoves(state)) if (ROW[sq] === goal) return pawnMove(sq);
  return null;
}

/** Choose a move for the side to move. */
export function chooseMove(
  state: GameState,
  difficulty: Difficulty,
  rng: Rng,
  options: CpuOptions = {}
): Move {
  if (state.winner !== null) throw new Error("The game is already over");
  const win = winningMove(state);
  if (win !== null) return win;

  let move: Move;
  if (difficulty === "easy") {
    move = easyMove(state, rng);
  } else {
    const preset = difficulty === "medium" ? MEDIUM : HARD;
    move = searchMove(state, { ...preset, ...definedOnly(options), rng }).move;
  }
  // Belt and braces: the generators are legal by construction, but a bad move
  // must never reach the board, so fall back to a plain step home.
  return isLegalMove(state, move) ? move : stepHome(state, null);
}

/** Only the options the caller actually set, so an `undefined` never masks a preset. */
function definedOnly(options: CpuOptions): SearchOptions {
  const out: SearchOptions = {};
  if (options.timeBudgetMs !== undefined) out.timeBudgetMs = options.timeBudgetMs;
  if (options.maxDepth !== undefined) out.maxDepth = options.maxDepth;
  if (options.nodeLimit !== undefined) out.nodeLimit = options.nodeLimit;
  if (options.now !== undefined) out.now = options.now;
  return out;
}

/* ------------------------------------------------------------------ easy */

function easyMove(state: GameState, rng: Rng): Move {
  const me = state.turn;
  const them = opponent(me);
  if (state.wallsLeft[me] > 0) {
    const dMe = distanceToGoal(state, me);
    const dThem = distanceToGoal(state, them);
    // Walls get more tempting when the opponent is ahead or nearly home.
    let chance = 0.1;
    if (dThem < dMe) chance += 0.1;
    if (dThem <= 3) chance += 0.15;
    if (rng.next() < chance) {
      const wall = bitingWall(state, them, rng);
      if (wall !== null) return wall;
    }
  }
  // Mostly a shortest-path step; sometimes any legal step at all.
  if (rng.next() < 0.12) return pawnMove(rng.pick(legalPawnMoves(state)));
  return stepHome(state, rng);
}

/**
 * A wall across `victim`'s shortest path, picked at random but weighted by
 * how many steps it costs them — so Easy is annoying, not precise.
 */
function bitingWall(state: GameState, victim: Player, rng: Rng): Move | null {
  const route = shortestPath(state.blocked, state.pawns[victim], GOAL_ROW[victim]);
  if (!route) return null;
  const before = route.length - 1;
  const options: { move: Move; gain: number }[] = [];
  const seen = new Set<number>();
  for (let i = 0; i + 1 < route.length; i++) {
    for (const [o, a] of wallsAcross(route[i], route[i + 1])) {
      const move = wallMove(o, a);
      if (seen.has(move)) continue;
      seen.add(move);
      if (wallError(state, o, a) !== null) continue;
      const trial = state.blocked.slice();
      setWall(trial, o, a, true);
      const gain = pathLength(trial, state.pawns[victim], GOAL_ROW[victim]) - before;
      if (gain > 0) options.push({ move, gain });
    }
  }
  if (options.length === 0) return null;
  return options[rng.weighted(options.map((x) => x.gain))].move;
}

/**
 * A pawn move that gets closest to the goal (ties broken by `rng`, or the
 * first one without). Always legal: a pawn that can reach its goal row always
 * has at least one move.
 */
function stepHome(state: GameState, rng: Rng | null): Move {
  const me = state.turn;
  let best: number[] = [];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const sq of legalPawnMoves(state)) {
    const d = ROW[sq] === GOAL_ROW[me] ? 0 : pathLength(state.blocked, sq, GOAL_ROW[me]);
    if (d < 0) continue;
    if (d < bestDist) {
      bestDist = d;
      best = [sq];
    } else if (d === bestDist) {
      best.push(sq);
    }
  }
  return pawnMove(rng ? rng.pick(best) : best[0]);
}
