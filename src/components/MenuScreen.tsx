"use client";

import { cx } from "@/lib/cx";
import { DIFFICULTIES, DIFFICULTY_LABEL } from "@/lib/game/constants";
import { tallyOf, type Stats } from "@/lib/game/stats";
import type { Settings } from "@/lib/settings";

interface MenuScreenProps {
  settings: Settings;
  stats: Stats;
  onChange: (patch: Partial<Settings>) => void;
  onStart: () => void;
  onRules: () => void;
}

/** The opening screen: opponent, tier and move order, the record so far, and Start. */
export function MenuScreen({ settings, stats, onChange, onStart, onRules }: MenuScreenProps) {
  const vsCpu = settings.mode === "cpu";
  return (
    <>
      <h1 className="qd-title">{"🧱 QUORIDOR"}</h1>
      <p className="qd-subtitle">Race to the far side. Wall your rival in, but never shut them out.</p>

      <div className="qd-card-panel">
        <span className="qd-field-label">Opponent</span>
        <div className="qd-seg qd-seg-2">
          <button
            type="button"
            className={cx("qd-chip", vsCpu && "is-on")}
            onClick={() => onChange({ mode: "cpu" })}
            aria-pressed={vsCpu}
          >
            vs CPU
          </button>
          <button
            type="button"
            className={cx("qd-chip", !vsCpu && "is-on")}
            onClick={() => onChange({ mode: "local" })}
            aria-pressed={!vsCpu}
          >
            2 players
          </button>
        </div>

        {vsCpu ? (
          <>
            <span className="qd-field-label">Difficulty</span>
            <div className="qd-seg qd-seg-3">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={cx("qd-chip", settings.difficulty === d && "is-on")}
                  onClick={() => onChange({ difficulty: d })}
                  aria-pressed={settings.difficulty === d}
                >
                  {DIFFICULTY_LABEL[d]}
                </button>
              ))}
            </div>

            <span className="qd-field-label">You move</span>
            <div className="qd-seg qd-seg-2">
              <button
                type="button"
                className={cx("qd-chip", settings.humanFirst && "is-on")}
                onClick={() => onChange({ humanFirst: true })}
                aria-pressed={settings.humanFirst}
              >
                First
              </button>
              <button
                type="button"
                className={cx("qd-chip", !settings.humanFirst && "is-on")}
                onClick={() => onChange({ humanFirst: false })}
                aria-pressed={!settings.humanFirst}
              >
                Second
              </button>
            </div>
          </>
        ) : (
          <p className="qd-menu-note">
            Hot-seat: take turns on one device. Player 1 (cyan) starts at the bottom and moves
            first; Player 2 (magenta) starts at the top.
          </p>
        )}

        <button type="button" className="qd-primary" onClick={onStart}>
          Start game
        </button>

        <span className="qd-field-label">Record vs CPU</span>
        <div className="qd-record-grid">
          {DIFFICULTIES.map((d) => {
            const t = tallyOf(stats, d);
            const played = t.wins + t.losses;
            return (
              <div key={d} className={cx("qd-record", vsCpu && settings.difficulty === d && "is-on")}>
                <span className="qd-record-tier">{DIFFICULTY_LABEL[d]}</span>
                <span className="qd-record-score">
                  {played === 0 ? "—" : `${t.wins}–${t.losses}`}
                </span>
                <span className="qd-record-sub">{played === 0 ? "no games" : "won–lost"}</span>
              </div>
            );
          })}
        </div>

        <div className="qd-menu-row">
          <button type="button" className="qd-ghost" onClick={onRules}>
            How to play
          </button>
          <button
            type="button"
            className="qd-ghost"
            onClick={() => onChange({ sound: !settings.sound })}
            aria-pressed={settings.sound}
          >
            {settings.sound ? "🔊 Sound on" : "🔇 Sound off"}
          </button>
        </div>
      </div>
    </>
  );
}
