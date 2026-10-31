"use client";

import { cx } from "@/lib/cx";
import { DIFFICULTY_LABEL, PLAYERS } from "@/lib/game/constants";
import { distanceToGoal, movesBy, wallsUsed } from "@/lib/game/rules";
import type { Tally } from "@/lib/game/stats";
import type { Difficulty, GameState, Mode, Player } from "@/lib/game/types";

interface ResultPanelProps {
  final: GameState;
  mode: Mode;
  difficulty: Difficulty;
  names: readonly [string, string];
  /** The (already updated) record against this tier; null in hot-seat games. */
  tally: Tally | null;
  onPlayAgain: () => void;
  onViewBoard: () => void;
  onMenu: () => void;
}

/** End-of-game summary: who won, how long it took, and how each side played it. */
export function ResultPanel({
  final,
  mode,
  difficulty,
  names,
  tally,
  onPlayAgain,
  onViewBoard,
  onMenu,
}: ResultPanelProps) {
  const winner = final.winner as Player;
  const humanLost = mode === "cpu" && winner === 1;
  const title =
    mode === "cpu" ? (humanLost ? "💀 The CPU wins" : "🏆 You win!") : `🏆 ${names[winner]} wins!`;
  const total = final.history.length;

  return (
    <div className="qd-overlay" role="dialog" aria-modal aria-label="Game over">
      <div className="qd-dialog">
        <h2 className="qd-dialog-title">{title}</h2>
        <p className={cx("qd-result-big", humanLost && "is-loss")}>
          {total} <span className="qd-result-unit">moves</span>
        </p>

        <table className="qd-result-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="qd-sr">Stat</span>
              </th>
              {PLAYERS.map((p) => (
                <th key={p} scope="col" className={cx(`is-p${p}`, winner === p && "is-winner")}>
                  {names[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Moves</th>
              {PLAYERS.map((p) => (
                <td key={p}>{movesBy(final, p)}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Walls used</th>
              {PLAYERS.map((p) => (
                <td key={p}>{wallsUsed(final, p)}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Steps left</th>
              {PLAYERS.map((p) => (
                <td key={p}>{distanceToGoal(final, p)}</td>
              ))}
            </tr>
          </tbody>
        </table>

        <p className="qd-result-note">
          {tally
            ? `${DIFFICULTY_LABEL[difficulty]} record · ${tally.wins} won, ${tally.losses} lost`
            : "Hot-seat game · no record kept"}
        </p>

        <button type="button" className="qd-primary" onClick={onPlayAgain} autoFocus>
          Play again
        </button>
        <div className="qd-menu-row">
          <button type="button" className="qd-ghost" onClick={onViewBoard}>
            View board
          </button>
          <button type="button" className="qd-ghost" onClick={onMenu}>
            Back to menu
          </button>
        </div>
      </div>
    </div>
  );
}
