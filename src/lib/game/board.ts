import { ANCHOR_SIZE, CELLS, SIZE } from "./constants";
import type { Orientation } from "./types";

/**
 * Low-level board geometry, shared by the rules and the search.
 *
 * Squares are numbered row-major, `sq = row * 9 + col`, row 0 at the top. Each
 * square carries a 4-bit mask of its closed sides — board edges and walls —
 * so asking "can I step up from here?" is a single AND. A wall closes exactly
 * two square-to-square edges, and the overlap rule guarantees no edge is ever
 * closed by two walls, so removing a wall can simply clear the same bits; that
 * is what lets the search place and lift walls in O(1).
 */

export const UP = 1;
export const RIGHT = 2;
export const DOWN = 4;
export const LEFT = 8;

export type Direction = typeof UP | typeof RIGHT | typeof DOWN | typeof LEFT;

export const DIRECTIONS: readonly Direction[] = [UP, RIGHT, DOWN, LEFT];

/** Square-index offset of one step in each direction (indexed by the bit). */
const OFFSET = new Int8Array(9);
OFFSET[UP] = -SIZE;
OFFSET[RIGHT] = 1;
OFFSET[DOWN] = SIZE;
OFFSET[LEFT] = -1;

export function stepOffset(dir: Direction): number {
  return OFFSET[dir];
}

/** The two directions at right angles to `dir`, for diagonal side-steps. */
export function perpendicular(dir: Direction): readonly [Direction, Direction] {
  return dir === UP || dir === DOWN ? [LEFT, RIGHT] : [UP, DOWN];
}

/** Row and column of every square, precomputed for the hot loops. */
export const ROW = Uint8Array.from({ length: CELLS }, (_, i) => Math.floor(i / SIZE));
export const COL = Uint8Array.from({ length: CELLS }, (_, i) => i % SIZE);

export function square(row: number, col: number): number {
  return row * SIZE + col;
}

export function anchor(row: number, col: number): number {
  return row * ANCHOR_SIZE + col;
}

export function anchorRow(a: number): number {
  return Math.floor(a / ANCHOR_SIZE);
}

export function anchorCol(a: number): number {
  return a % ANCHOR_SIZE;
}

/** A fresh mask array with only the four board edges closed. */
export function createBlocked(): Uint8Array {
  const blocked = new Uint8Array(CELLS);
  for (let i = 0; i < SIZE; i++) {
    blocked[square(0, i)] |= UP;
    blocked[square(SIZE - 1, i)] |= DOWN;
    blocked[square(i, 0)] |= LEFT;
    blocked[square(i, SIZE - 1)] |= RIGHT;
  }
  return blocked;
}

/**
 * Close (or reopen) the two edges a wall covers. A horizontal wall at anchor
 * (r, c) runs under squares (r, c) and (r, c+1); a vertical one runs to the
 * right of squares (r, c) and (r+1, c).
 */
export function setWall(blocked: Uint8Array, o: Orientation, a: number, closed: boolean): void {
  const r = anchorRow(a);
  const c = anchorCol(a);
  const tl = square(r, c);
  if (o === "h") {
    if (closed) {
      blocked[tl] |= DOWN;
      blocked[tl + 1] |= DOWN;
      blocked[tl + SIZE] |= UP;
      blocked[tl + SIZE + 1] |= UP;
    } else {
      blocked[tl] &= ~DOWN;
      blocked[tl + 1] &= ~DOWN;
      blocked[tl + SIZE] &= ~UP;
      blocked[tl + SIZE + 1] &= ~UP;
    }
  } else if (closed) {
    blocked[tl] |= RIGHT;
    blocked[tl + SIZE] |= RIGHT;
    blocked[tl + 1] |= LEFT;
    blocked[tl + SIZE + 1] |= LEFT;
  } else {
    blocked[tl] &= ~RIGHT;
    blocked[tl + SIZE] &= ~RIGHT;
    blocked[tl + 1] &= ~LEFT;
    blocked[tl + SIZE + 1] &= ~LEFT;
  }
}

/**
 * Does a new wall collide with the walls already down? Two parallel walls
 * overlap when their anchors are equal or adjacent along the wall's length;
 * two perpendicular walls cross when they share a centre point.
 */
export function wallClash(
  h: Uint8Array,
  v: Uint8Array,
  o: Orientation,
  a: number
): "overlap" | "cross" | null {
  const c = anchorCol(a);
  const r = anchorRow(a);
  if (o === "h") {
    if (h[a] || (c > 0 && h[a - 1]) || (c < ANCHOR_SIZE - 1 && h[a + 1])) return "overlap";
    if (v[a]) return "cross";
  } else {
    if (v[a] || (r > 0 && v[a - ANCHOR_SIZE]) || (r < ANCHOR_SIZE - 1 && v[a + ANCHOR_SIZE])) {
      return "overlap";
    }
    if (h[a]) return "cross";
  }
  return null;
}

/**
 * Every square the pawn on `me` may move to, given the opponent on `opp`:
 * one orthogonal step through an open side; over an adjacent opponent when
 * the side behind it is open; or diagonally beside it when a wall or the
 * board edge is directly behind it, unless that side is walled as well.
 */
export function pawnTargets(
  blocked: Uint8Array,
  me: number,
  opp: number,
  out: number[] = []
): number[] {
  out.length = 0;
  const mine = blocked[me];
  for (let k = 0; k < 4; k++) {
    const dir = DIRECTIONS[k];
    if (mine & dir) continue;
    const next = me + OFFSET[dir];
    if (next !== opp) {
      out.push(next);
      continue;
    }
    const theirs = blocked[opp];
    if (!(theirs & dir)) {
      out.push(opp + OFFSET[dir]);
      continue;
    }
    const [s1, s2] = perpendicular(dir);
    if (!(theirs & s1)) out.push(opp + OFFSET[s1]);
    if (!(theirs & s2)) out.push(opp + OFFSET[s2]);
  }
  return out;
}

/**
 * Squares reached by pressing one arrow key: the plain step, the straight
 * jump, or the diagonal side-steps when the jump is blocked (zero to two).
 */
export function targetsToward(
  blocked: Uint8Array,
  me: number,
  opp: number,
  dir: Direction
): number[] {
  if (blocked[me] & dir) return [];
  const next = me + OFFSET[dir];
  if (next !== opp) return [next];
  const theirs = blocked[opp];
  if (!(theirs & dir)) return [opp + OFFSET[dir]];
  const out: number[] = [];
  for (const side of perpendicular(dir)) if (!(theirs & side)) out.push(opp + OFFSET[side]);
  return out;
}

/**
 * The walls (one or two) that would close the edge between two adjacent
 * squares: horizontal walls under a vertical step, vertical walls beside a
 * horizontal one.
 */
export function wallsAcross(a: number, b: number): [Orientation, number][] {
  const lo = Math.min(a, b);
  const r = ROW[lo];
  const c = COL[lo];
  const out: [Orientation, number][] = [];
  if (Math.abs(a - b) === SIZE) {
    if (c > 0) out.push(["h", anchor(r, c - 1)]);
    if (c < ANCHOR_SIZE) out.push(["h", anchor(r, c)]);
  } else {
    if (r > 0) out.push(["v", anchor(r - 1, c)]);
    if (r < ANCHOR_SIZE) out.push(["v", anchor(r, c)]);
  }
  return out;
}

/*
 * Breadth-first search scratch space. A generation stamp marks visited squares
 * so nothing has to be cleared between searches; the search runs thousands of
 * these per move, so allocation-free matters.
 */
const seen = new Uint32Array(CELLS);
const queue = new Int16Array(CELLS);
const depthOf = new Uint8Array(CELLS);
let stamp = 0;

function nextStamp(): number {
  stamp++;
  if (stamp === 0xffffffff) {
    seen.fill(0);
    stamp = 1;
  }
  return stamp;
}

/**
 * Length of the shortest walk from `from` to any square of `goalRow`, ignoring
 * pawns (they move, walls do not), or -1 when walls cut the goal off.
 */
export function pathLength(blocked: Uint8Array, from: number, goalRow: number): number {
  if (ROW[from] === goalRow) return 0;
  const mark = nextStamp();
  let head = 0;
  let tail = 0;
  queue[tail++] = from;
  seen[from] = mark;
  depthOf[from] = 0;
  while (head < tail) {
    const sq = queue[head++];
    const d = depthOf[sq] + 1;
    const b = blocked[sq];
    for (let k = 0; k < 4; k++) {
      const dir = DIRECTIONS[k];
      if (b & dir) continue;
      const n = sq + OFFSET[dir];
      if (seen[n] === mark) continue;
      if (ROW[n] === goalRow) return d;
      seen[n] = mark;
      depthOf[n] = d;
      queue[tail++] = n;
    }
  }
  return -1;
}

/** Marker for squares that cannot reach the goal row at all. */
export const UNREACHABLE = 255;

/**
 * Distance from every square to `goalRow` (multi-source BFS from the goal).
 * Walls only change when one is placed, so the search computes this once per
 * wall and then answers every pawn move along that line with a lookup.
 */
export function distanceField(blocked: Uint8Array, goalRow: number, out: Uint8Array): Uint8Array {
  out.fill(UNREACHABLE);
  let head = 0;
  let tail = 0;
  for (let c = 0; c < SIZE; c++) {
    const sq = square(goalRow, c);
    out[sq] = 0;
    queue[tail++] = sq;
  }
  while (head < tail) {
    const sq = queue[head++];
    const d = out[sq] + 1;
    const b = blocked[sq];
    for (let k = 0; k < 4; k++) {
      const dir = DIRECTIONS[k];
      if (b & dir) continue;
      const n = sq + OFFSET[dir];
      if (out[n] !== UNREACHABLE) continue;
      out[n] = d;
      queue[tail++] = n;
    }
  }
  return out;
}

/**
 * One shortest route from `from` to the goal row as a list of squares
 * (including `from`), read off a distance field by always stepping downhill.
 * Prefers heading straight for the goal, so the drawn path looks natural.
 */
export function pathFromField(
  blocked: Uint8Array,
  field: Uint8Array,
  from: number,
  goalRow: number
): number[] | null {
  if (field[from] === UNREACHABLE) return null;
  const forward: Direction = goalRow === 0 ? UP : DOWN;
  const order: readonly Direction[] = [forward, LEFT, RIGHT, forward === UP ? DOWN : UP];
  const path = [from];
  let sq = from;
  while (field[sq] > 0) {
    const b = blocked[sq];
    let stepped = false;
    for (const dir of order) {
      if (b & dir) continue;
      const n = sq + OFFSET[dir];
      if (field[n] === field[sq] - 1) {
        sq = n;
        path.push(n);
        stepped = true;
        break;
      }
    }
    if (!stepped) return null; // cannot happen for a consistent field
  }
  return path;
}

/** Convenience wrapper: a shortest route without keeping the field around. */
export function shortestPath(blocked: Uint8Array, from: number, goalRow: number): number[] | null {
  const field = distanceField(blocked, goalRow, new Uint8Array(CELLS));
  return pathFromField(blocked, field, from, goalRow);
}
