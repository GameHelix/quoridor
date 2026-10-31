"use client";

import { cx } from "@/lib/cx";
import { PLAYERS, WALLS_PER_PLAYER } from "@/lib/game/constants";
import type { Player } from "@/lib/game/types";

interface HudProps {
  names: readonly [string, string];
  wallsLeft: readonly [number, number];
  /** Shortest-path length to the goal row for each player. */
  distances: readonly [number, number];
  turn: Player;
  winner: Player | null;
  thinking: boolean;
}

/**
 * Two player cards side by side. The one to move glows in its pawn colour
 * (and pulses while the computer thinks); each shows the walls still in hand
 * as pips and the steps its pawn still needs.
 */
export function Hud({ names, wallsLeft, distances, turn, winner, thinking }: HudProps) {
  return (
    <div className="qd-hud">
      {PLAYERS.map((p) => {
        const active = winner === null && turn === p;
        const walls = wallsLeft[p];
        const steps = distances[p];
        return (
          <div
            key={p}
            className={cx(
              "qd-card",
              `is-p${p}`,
              active && "is-active",
              winner === p && "is-winner",
              active && thinking && "is-thinking"
            )}
            aria-current={active ? "true" : undefined}
          >
            <div className="qd-card-top">
              <span className="qd-card-dot" aria-hidden />
              <span className="qd-card-name">{names[p]}</span>
            </div>
            <div className="qd-card-bottom">
              <span
                className="qd-pips"
                role="img"
                aria-label={`${walls} wall${walls === 1 ? "" : "s"} left`}
                title={`${walls} wall${walls === 1 ? "" : "s"} left`}
              >
                {Array.from({ length: WALLS_PER_PLAYER }, (_, i) => (
                  <span key={i} className={cx("qd-pip", i < walls && "is-on")} />
                ))}
              </span>
              <span className="qd-card-path" title="Shortest route to the goal row">
                <b>{steps}</b> {steps === 1 ? "step" : "steps"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
