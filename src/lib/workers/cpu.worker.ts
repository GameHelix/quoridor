import { chooseMove } from "@/lib/game/cpu";
import { makeRng } from "@/lib/game/rng";
import type { CpuRequest, CpuResponse } from "./protocol";

/**
 * Runs the computer's search off the main thread, so the board, the
 * "thinking…" pulse and every button stay responsive while Hard spends its
 * full second. Typed arrays in the state survive the structured clone intact.
 */
interface WorkerScope {
  onmessage: ((event: MessageEvent<CpuRequest>) => void) | null;
  postMessage(message: CpuResponse): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { id, state, difficulty, seed } = event.data;
  const move = chooseMove(state, difficulty, makeRng(seed));
  scope.postMessage({ id, move });
};
