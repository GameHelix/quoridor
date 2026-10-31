import type { Difficulty, GameState, Move } from "@/lib/game/types";

/** Main thread → worker: "find a move for the side to move in `state`". */
export interface CpuRequest {
  id: number;
  state: GameState;
  difficulty: Difficulty;
  seed: number;
}

/** Worker → main thread: the answer to request `id`. */
export interface CpuResponse {
  id: number;
  move: Move;
}
