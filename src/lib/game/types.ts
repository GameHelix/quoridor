/**
 * Core value types for Quoridor. Everything here is framework-free so the
 * rules and the computer opponent can be unit-tested without React in the loop.
 */

/** Player 0 starts at the bottom (moves up); player 1 starts at the top. */
export type Player = 0 | 1;

/** A wall lies along a horizontal groove (`h`) or a vertical one (`v`). */
export type Orientation = "h" | "v";

/** Computer opponent strength tiers. */
export type Difficulty = "easy" | "medium" | "hard";

/** One human against the computer, or two humans sharing a device. */
export type Mode = "cpu" | "local";

/**
 * A move packed into one small integer so the search can store it in typed
 * arrays: `0..80` is a pawn move to that square, `81..144` a horizontal wall
 * and `145..208` a vertical wall at anchor `move - base`. See `moves.ts`.
 */
export type Move = number;

/** A move as it was played, with enough context to draw and undo it. */
export interface Ply {
  readonly player: Player;
  readonly move: Move;
  /** The mover's pawn square before the move (unchanged by a wall). */
  readonly from: number;
}

/**
 * The complete state of a game. Transitions never mutate a state: every rule
 * function returns a fresh one, so React can compare by reference and undo is
 * a replay.
 */
export interface GameState {
  /** Pawn square of each player. */
  readonly pawns: readonly [number, number];
  /** Walls each player still holds. */
  readonly wallsLeft: readonly [number, number];
  /** Horizontal walls by anchor: 0 = none, 1 = placed by player 0, 2 = by player 1. */
  readonly h: Uint8Array;
  /** Vertical walls by anchor, same encoding as `h`. */
  readonly v: Uint8Array;
  /**
   * Per-square bitmask of closed sides (board edges and walls); see `board.ts`.
   * Derived from `h`/`v`, kept alongside so move generation is a lookup.
   */
  readonly blocked: Uint8Array;
  /** Whose turn it is. */
  readonly turn: Player;
  /** Who moved first (needed to replay the history for undo). */
  readonly first: Player;
  /** Set once a pawn reaches its goal row; no further moves are allowed. */
  readonly winner: Player | null;
  readonly history: readonly Ply[];
}

/** Why a wall cannot go where it was asked to. */
export type WallError = "no-walls" | "overlap" | "cross" | "blocks-path";
