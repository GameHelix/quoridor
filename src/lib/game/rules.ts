import {
  ANCHORS,
  GOAL_ROW,
  START_SQUARE,
  WALLS_PER_PLAYER,
} from "./constants";
import {
  ROW,
  createBlocked,
  pathLength,
  pawnTargets,
  setWall,
  shortestPath as routeOnBoard,
  wallClash,
} from "./board";
import {
  isPawnMove,
  isWallMove,
  pawnMove,
  wallAnchor,
  wallMove,
  wallOrientation,
} from "./moves";
import type { GameState, Move, Orientation, Player, WallError } from "./types";

/**
 * The rules of two-player Quoridor over immutable `GameState`s. This is the
 * layer the UI talks to; the search in `search.ts` works on its own mutable
 * copy but uses the same `board.ts` primitives, so both agree by construction.
 */

export function opponent(p: Player): Player {
  return p === 0 ? 1 : 0;
}

/** A new game with both pawns home, ten walls each, and `first` to move. */
export function newGame(first: Player = 0): GameState {
  return {
    pawns: [START_SQUARE[0], START_SQUARE[1]],
    wallsLeft: [WALLS_PER_PLAYER, WALLS_PER_PLAYER],
    h: new Uint8Array(ANCHORS),
    v: new Uint8Array(ANCHORS),
    blocked: createBlocked(),
    turn: first,
    first,
    winner: null,
    history: [],
  };
}

/** Squares the given player's pawn may move to (the side to move by default). */
export function legalPawnMoves(state: GameState, player: Player = state.turn): number[] {
  if (state.winner !== null) return [];
  return pawnTargets(state.blocked, state.pawns[player], state.pawns[opponent(player)]);
}

/**
 * Why the side to move may not place this wall, or `null` when it may. The
 * path check temporarily closes the wall on a scratch copy and asks whether
 * both pawns can still reach their goal rows.
 */
export function wallError(state: GameState, o: Orientation, a: number): WallError | null {
  if (state.wallsLeft[state.turn] <= 0) return "no-walls";
  const clash = wallClash(state.h, state.v, o, a);
  if (clash) return clash;
  const trial = state.blocked.slice();
  setWall(trial, o, a, true);
  if (
    pathLength(trial, state.pawns[0], GOAL_ROW[0]) < 0 ||
    pathLength(trial, state.pawns[1], GOAL_ROW[1]) < 0
  ) {
    return "blocks-path";
  }
  return null;
}

export function canPlaceWall(state: GameState, o: Orientation, a: number): boolean {
  return state.winner === null && a >= 0 && a < ANCHORS && wallError(state, o, a) === null;
}

export function isLegalMove(state: GameState, move: Move): boolean {
  if (state.winner !== null || !Number.isInteger(move)) return false;
  if (isPawnMove(move)) return move >= 0 && legalPawnMoves(state).includes(move);
  if (isWallMove(move)) return canPlaceWall(state, wallOrientation(move), wallAnchor(move));
  return false;
}

/** Every legal move for the side to move: pawn moves first, then walls. */
export function legalMoves(state: GameState): Move[] {
  if (state.winner !== null) return [];
  const moves: Move[] = legalPawnMoves(state).map(pawnMove);
  if (state.wallsLeft[state.turn] > 0) {
    for (const o of ["h", "v"] as const) {
      for (let a = 0; a < ANCHORS; a++) {
        if (wallError(state, o, a) === null) moves.push(wallMove(o, a));
      }
    }
  }
  return moves;
}

/**
 * Play a move and return the next state. Throws on an illegal move: callers
 * validate first (the UI to explain the problem, the computer by construction),
 * so reaching here with a bad move is a bug worth surfacing loudly.
 */
export function applyMove(state: GameState, move: Move): GameState {
  if (!isLegalMove(state, move)) throw new Error(`Illegal move ${move}`);
  const me = state.turn;
  const from = state.pawns[me];
  const ply = { player: me, move, from };

  if (isPawnMove(move)) {
    const pawns: [number, number] = [state.pawns[0], state.pawns[1]];
    pawns[me] = move;
    const won = ROW[move] === GOAL_ROW[me];
    return {
      ...state,
      pawns,
      turn: opponent(me),
      winner: won ? me : null,
      history: [...state.history, ply],
    };
  }

  const o = wallOrientation(move);
  const a = wallAnchor(move);
  const h = o === "h" ? state.h.slice() : state.h;
  const v = o === "v" ? state.v.slice() : state.v;
  (o === "h" ? h : v)[a] = me + 1;
  const blocked = state.blocked.slice();
  setWall(blocked, o, a, true);
  const wallsLeft: [number, number] = [state.wallsLeft[0], state.wallsLeft[1]];
  wallsLeft[me] -= 1;
  return {
    ...state,
    h,
    v,
    blocked,
    wallsLeft,
    turn: opponent(me),
    history: [...state.history, ply],
  };
}

/** Take back the last `count` plies by replaying the rest from the start. */
export function undoMoves(state: GameState, count = 1): GameState {
  const keep = Math.max(0, state.history.length - count);
  let next = newGame(state.first);
  for (let i = 0; i < keep; i++) next = applyMove(next, state.history[i].move);
  return next;
}

/** Steps the player still needs to reach the goal row, walls considered. */
export function distanceToGoal(state: GameState, player: Player): number {
  return pathLength(state.blocked, state.pawns[player], GOAL_ROW[player]);
}

/** One shortest route for the player, as squares from the pawn to the goal. */
export function shortestRoute(state: GameState, player: Player): number[] {
  return routeOnBoard(state.blocked, state.pawns[player], GOAL_ROW[player]) ?? [];
}

export function wallsUsed(state: GameState, player: Player): number {
  return WALLS_PER_PLAYER - state.wallsLeft[player];
}

/** Turns taken by a player so far (pawn moves and walls alike). */
export function movesBy(state: GameState, player: Player): number {
  let n = 0;
  for (const ply of state.history) if (ply.player === player) n++;
  return n;
}

/**
 * A compact key for "the same position": walls only ever accumulate, so within
 * one game the wall count pins down the wall layout and a repeat can only come
 * from pawns shuffling. The computer uses this to avoid going round in circles.
 */
export function positionKey(pawns: readonly number[], wallCount: number, turn: Player): string {
  return `${pawns[0]}:${pawns[1]}:${wallCount}:${turn}`;
}

/**
 * How often each position has occurred in the game so far, the current one
 * included. Walks the history backwards from the present, so it works for any
 * state, including hand-built ones in tests.
 */
export function positionCounts(state: GameState): Map<string, number> {
  const counts = new Map<string, number>();
  const pawns = [state.pawns[0], state.pawns[1]];
  let walls = 0;
  for (let a = 0; a < ANCHORS; a++) walls += (state.h[a] ? 1 : 0) + (state.v[a] ? 1 : 0);
  let turn = state.turn;
  const bump = () => {
    const key = positionKey(pawns, walls, turn);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  bump();
  for (let i = state.history.length - 1; i >= 0; i--) {
    const ply = state.history[i];
    if (isPawnMove(ply.move)) pawns[ply.player] = ply.from;
    else walls--;
    turn = ply.player;
    bump();
  }
  return counts;
}

/** The wall that a ply placed, if it was a wall. */
export function plyWall(move: Move): { o: Orientation; a: number } | null {
  return isWallMove(move) ? { o: wallOrientation(move), a: wallAnchor(move) } : null;
}
