import type { Difficulty, Player } from "./types";

/** Squares per side of the board. */
export const SIZE = 9;

/** Number of squares on the board (row-major, row 0 at the top). */
export const CELLS = SIZE * SIZE;

/**
 * Walls sit on the 8×8 grid of groove crossings between squares. A wall is
 * identified by that crossing (its centre) — its *anchor* — plus orientation.
 */
export const ANCHOR_SIZE = SIZE - 1;
export const ANCHORS = ANCHOR_SIZE * ANCHOR_SIZE;

/** Walls each player starts with in the standard two-player game. */
export const WALLS_PER_PLAYER = 10;

/**
 * Player 0 starts at the bottom centre and races to the top row; player 1
 * starts at the top centre and races to the bottom row.
 */
export const START_SQUARE: readonly [number, number] = [(SIZE - 1) * SIZE + 4, 4];
export const GOAL_ROW: readonly [number, number] = [0, SIZE - 1];

export const PLAYERS: readonly Player[] = [0, 1];

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/** Search budget for the hardest tier: comfortably under the ~1.2 s ceiling. */
export const HARD_BUDGET_MS = 1000;

/** The computer never answers faster than this, so its move reads as a reply. */
export const CPU_MIN_DELAY_MS = 450;

export const STATS_KEY = "quoridor.stats.v1";
export const SETTINGS_KEY = "quoridor.settings.v1";
