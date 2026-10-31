"use client";

import { useEffect } from "react";

interface RulesPanelProps {
  onClose: () => void;
}

/** The rules of two-player Quoridor and the controls, in one short dialog. */
export function RulesPanel({ onClose }: RulesPanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="qd-overlay" role="dialog" aria-modal aria-label="How to play">
      <div className="qd-dialog">
        <h2 className="qd-dialog-title">How to play</h2>
        <div className="qd-rules">
          <p>
            <b>Goal.</b> Be the first to get your pawn to <b>any square of the far row</b>. Cyan
            starts at the bottom and heads up; magenta starts at the top and heads down.
          </p>
          <p>
            <b>Your turn.</b> Do one thing: <b>move your pawn</b> one square up, down, left or
            right, or <b>place one of your 10 walls</b>.
          </p>
          <p>
            <b>Jumping.</b> If the other pawn is right next to you, you may leap straight over it.
            If a wall or the edge is behind it, step diagonally to either side of it instead,
            unless a wall is in the way there too.
          </p>
          <p>
            <b>Walls</b> are two squares long and sit in the grooves. They can&apos;t overlap,
            can&apos;t cross another wall at its centre, and can never cut off either
            pawn&apos;s last route to its goal: you may make a path longer, never impossible.
          </p>
          <p>
            <b>Controls.</b> Tap or click a glowing square to move. With a mouse, point at a groove
            to see a ghost wall (green = allowed) and click to build it. On touch, pick{" "}
            <b>Wall ─</b> or <b>Wall │</b>, tap to preview, then tap again or press Build.
          </p>
          <p>
            <b>Keys.</b> Arrows move the pawn · <b>W</b> wall mode (arrows aim, <b>Enter</b>{" "}
            builds) · <b>R</b> rotates · <b>Esc</b> cancels · <b>U</b> undo · <b>P</b> paths.
          </p>
        </div>
        <button type="button" className="qd-primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
