import { ANCHORS, CELLS } from "./constants";
import type { Move, Orientation } from "./types";

/**
 * Move encoding. A move is one small integer so the search can keep move lists
 * and killer tables in typed arrays without allocating objects:
 *
 *   0 ..  80   pawn to that square
 *  81 .. 144   horizontal wall at anchor (move - 81)
 * 145 .. 208   vertical wall at anchor (move - 145)
 */
export const H_BASE = CELLS;
export const V_BASE = CELLS + ANCHORS;
export const MOVE_SPACE = CELLS + 2 * ANCHORS;

export function pawnMove(sq: number): Move {
  return sq;
}

export function wallMove(o: Orientation, a: number): Move {
  return (o === "h" ? H_BASE : V_BASE) + a;
}

export function isPawnMove(m: Move): boolean {
  return m < H_BASE;
}

export function isWallMove(m: Move): boolean {
  return m >= H_BASE && m < MOVE_SPACE;
}

export function wallOrientation(m: Move): Orientation {
  return m < V_BASE ? "h" : "v";
}

export function wallAnchor(m: Move): number {
  return m < V_BASE ? m - H_BASE : m - V_BASE;
}
