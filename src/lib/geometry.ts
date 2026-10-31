import { ANCHOR_SIZE, SIZE } from "@/lib/game/constants";
import { COL, ROW, anchor, anchorCol, anchorRow, square } from "@/lib/game/board";
import type { Orientation } from "@/lib/game/types";

/**
 * Board geometry in SVG user units, plus pointer hit-testing. Kept free of
 * React and the DOM so the "which groove did I point at?" maths is testable.
 *
 * The board is 9 squares of `SQ` separated by grooves of `GAP`, with a `PAD`
 * margin. Walls fill a groove and span two squares plus the crossing between.
 */
export const SQ = 10;
export const GAP = 2.5;
export const PAD = 2.5;
export const PITCH = SQ + GAP;
export const BOARD = PAD * 2 + SIZE * SQ + (SIZE - 1) * GAP;

/** Chess-style square name: files a–i from the left, ranks 1–9 from the bottom. */
export function squareName(sq: number): string {
  return `${"abcdefghi"[COL[sq]]}${SIZE - ROW[sq]}`;
}

/** Top-left corner of a square. */
export function squareOrigin(sq: number): { x: number; y: number } {
  return { x: PAD + COL[sq] * PITCH, y: PAD + ROW[sq] * PITCH };
}

export function squareCenter(sq: number): { x: number; y: number } {
  const o = squareOrigin(sq);
  return { x: o.x + SQ / 2, y: o.y + SQ / 2 };
}

/** Centre of a groove crossing, i.e. of any wall anchored there. */
export function anchorCenter(a: number): { x: number; y: number } {
  return {
    x: PAD + anchorCol(a) * PITCH + SQ + GAP / 2,
    y: PAD + anchorRow(a) * PITCH + SQ + GAP / 2,
  };
}

/** The rectangle a wall occupies (it fills its groove end to end). */
export function wallRect(o: Orientation, a: number): { x: number; y: number; w: number; h: number } {
  const c = anchorCenter(a);
  const long = 2 * SQ + GAP;
  return o === "h"
    ? { x: c.x - long / 2, y: c.y - GAP / 2, w: long, h: GAP }
    : { x: c.x - GAP / 2, y: c.y - long / 2, w: GAP, h: long };
}

export type Hit = { kind: "square"; sq: number } | { kind: "wall"; o: Orientation; a: number };

/** What a pointer is aiming at: pawn moves (walls by groove) or one wall orientation. */
export type Aim = "move" | Orientation;

/**
 * How close (in units) a fine pointer must be to a groove's centre line for
 * the groove to win over the square: the half-groove plus a forgiving margin.
 */
const GROOVE_REACH = GAP / 2 + 1.6;

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * Map a pointer position (board units) to a square or a wall.
 *
 * - Aiming a wall orientation: the wall centred on the nearest crossing, from
 *   anywhere on the board — generous enough for a fingertip.
 * - Aiming moves with a fine pointer (mouse, pen): near a groove line you get
 *   the wall along that groove, centred on the nearest crossing; near a
 *   crossing, where both grooves are close, `preferred` breaks the tie.
 * - Aiming moves by touch: always the square under the finger.
 */
export function hitTest(
  x: number,
  y: number,
  aim: Aim,
  fine: boolean,
  preferred: Orientation
): Hit | null {
  if (x < 0 || y < 0 || x > BOARD || y > BOARD) return null;
  const ax = clamp(Math.round((x - PAD - SQ - GAP / 2) / PITCH), 0, ANCHOR_SIZE - 1);
  const ay = clamp(Math.round((y - PAD - SQ - GAP / 2) / PITCH), 0, ANCHOR_SIZE - 1);
  const crossing = anchor(ay, ax);
  if (aim !== "move") return { kind: "wall", o: aim, a: crossing };

  if (fine) {
    const c = anchorCenter(crossing);
    const dy = Math.abs(y - c.y);
    const dx = Math.abs(x - c.x);
    const nearH = dy <= GROOVE_REACH;
    const nearV = dx <= GROOVE_REACH;
    if (nearH || nearV) {
      let o: Orientation;
      if (nearH && nearV) o = Math.abs(dx - dy) < 0.6 ? preferred : dy < dx ? "h" : "v";
      else o = nearH ? "h" : "v";
      return { kind: "wall", o, a: crossing };
    }
  }

  // Each square owns half of the grooves around it.
  const col = clamp(Math.floor((x - PAD + GAP / 2) / PITCH), 0, SIZE - 1);
  const row = clamp(Math.floor((y - PAD + GAP / 2) / PITCH), 0, SIZE - 1);
  return { kind: "square", sq: square(row, col) };
}
