"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board, type Ghost } from "./Board";
import { Hud } from "./Hud";
import { cx } from "@/lib/cx";
import { ANCHOR_SIZE, CPU_MIN_DELAY_MS, DIFFICULTY_LABEL } from "@/lib/game/constants";
import {
  COL,
  DOWN,
  LEFT,
  RIGHT,
  ROW,
  UP,
  anchor,
  anchorCol,
  anchorRow,
  perpendicular,
  stepOffset,
  targetsToward,
  wallsAcross,
  type Direction,
} from "@/lib/game/board";
import { chooseMove } from "@/lib/game/cpu";
import { isPawnMove, pawnMove, wallMove } from "@/lib/game/moves";
import { makeRng } from "@/lib/game/rng";
import {
  applyMove,
  distanceToGoal,
  isLegalMove,
  legalPawnMoves,
  newGame,
  opponent,
  shortestRoute,
  undoMoves,
  wallError,
} from "@/lib/game/rules";
import type { Difficulty, GameState, Mode, Move, Orientation, Player, WallError } from "@/lib/game/types";
import type { Aim, Hit } from "@/lib/geometry";
import { useCpu } from "@/lib/hooks/useCpu";
import { useSound } from "@/lib/hooks/useSound";

export interface Session {
  /** Bumped on every new game so the play screen remounts clean. */
  nonce: number;
  mode: Mode;
  difficulty: Difficulty;
  /** Who moves first: the human chooses when playing the computer. */
  first: Player;
  /** Seeds the computer's tie-breaks; created on the Start click, never during render. */
  seed: number;
}

/** Against the computer the human always plays the bottom (cyan) pawn. */
export const HUMAN: Player = 0;
export const CPU: Player = 1;

/** Display names for the bottom and top pawns in a given kind of game. */
export function playerNames(mode: Mode, difficulty: Difficulty): readonly [string, string] {
  return mode === "cpu" ? ["You", `CPU · ${DIFFICULTY_LABEL[difficulty]}`] : ["Player 1", "Player 2"];
}

const WALL_ERROR_TEXT: Record<WallError, string> = {
  "no-walls": "No walls left — move your pawn",
  overlap: "Walls can't overlap",
  cross: "Walls can't cross",
  "blocks-path": "That would seal off a pawn's last route",
};

const ARROWS: Record<string, Direction> = {
  ArrowUp: UP,
  ArrowRight: RIGHT,
  ArrowDown: DOWN,
  ArrowLeft: LEFT,
};

const ARROW_GLYPH: Record<Direction, string> = { 1: "↑", 2: "→", 4: "↓", 8: "←" };

interface PlayScreenProps {
  session: Session;
  soundOn: boolean;
  /** A dialog covers the board: no input, and the computer waits. */
  paused: boolean;
  showPaths: boolean;
  /** The game is over and its result panel has been dismissed. */
  resultHidden: boolean;
  onTogglePaths: () => void;
  onToggleSound: () => void;
  onRules: () => void;
  onGameOver: (final: GameState) => void;
  onShowResult: () => void;
  onRestart: () => void;
  onExit: () => void;
}

/** A sensible first preview for keyboard wall mode: across the opponent's route. */
function defaultAnchor(game: GameState, o: Orientation): number {
  const victim = opponent(game.turn);
  const route = shortestRoute(game, victim);
  for (let i = 0; i + 1 < route.length; i++) {
    for (const [wo, a] of wallsAcross(route[i], route[i + 1])) {
      if (wo === o && wallError(game, wo, a) === null) return a;
    }
  }
  const sq = game.pawns[victim];
  return anchor(Math.min(ROW[sq], ANCHOR_SIZE - 1), Math.min(COL[sq], ANCHOR_SIZE - 1));
}

function nudgeAnchor(a: number, dir: Direction): number {
  const clampA = (n: number) => Math.max(0, Math.min(ANCHOR_SIZE - 1, n));
  const r = anchorRow(a) + (dir === DOWN ? 1 : dir === UP ? -1 : 0);
  const c = anchorCol(a) + (dir === RIGHT ? 1 : dir === LEFT ? -1 : 0);
  return anchor(clampA(r), clampA(c));
}

/**
 * One game in progress. Owns the position, the input mode (move, or aim a
 * horizontal / vertical wall), the ghost wall, keyboard control and the
 * computer's turns; the parent owns stats, dialogs and settings.
 */
export function PlayScreen({
  session,
  soundOn,
  paused,
  showPaths,
  resultHidden,
  onTogglePaths,
  onToggleSound,
  onRules,
  onGameOver,
  onShowResult,
  onRestart,
  onExit,
}: PlayScreenProps) {
  const [game, setGame] = useState<GameState>(() => newGame(session.first));
  const [aim, setAim] = useState<Aim>("move");
  /** Orientation used where a fine pointer sits on a groove crossing. */
  const [preferred, setPreferred] = useState<Orientation>("h");
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [hoverSq, setHoverSq] = useState<number | null>(null);
  const [choice, setChoice] = useState<{ dir: Direction; options: number[] } | null>(null);
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const noticeTimer = useRef(0);
  const noticeSeq = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const play = useSound(soundOn);
  const requestCpu = useCpu();

  const cpuSide: Player | null = session.mode === "cpu" ? CPU : null;
  const over = game.winner !== null;
  const thinking = !over && cpuSide !== null && game.turn === cpuSide;
  const interactive = !over && !thinking && !paused;

  const names = useMemo(
    () => playerNames(session.mode, session.difficulty),
    [session.mode, session.difficulty]
  );
  const targets = useMemo(() => (interactive ? legalPawnMoves(game) : []), [interactive, game]);
  const distances = useMemo<readonly [number, number]>(
    () => [distanceToGoal(game, 0), distanceToGoal(game, 1)],
    [game]
  );
  const ghostError = useMemo(
    () => (ghost ? wallError(game, ghost.o, ghost.a) : null),
    [ghost, game]
  );

  /** Plies to take back: one in hot-seat; back to your previous turn vs the CPU. */
  const undoPlies = useMemo(() => {
    if (over) return 0;
    const h = game.history;
    if (cpuSide === null) return h.length > 0 ? 1 : 0;
    let i = h.length;
    while (i > 0 && h[i - 1].player === cpuSide) i--;
    return i === 0 ? 0 : h.length - (i - 1);
  }, [game, cpuSide, over]);

  /* ------------------------------------------------------------ feedback */

  const say = useCallback((text: string) => {
    window.clearTimeout(noticeTimer.current);
    const id = ++noticeSeq.current;
    setNotice({ text, id });
    noticeTimer.current = window.setTimeout(
      () => setNotice((n) => (n && n.id === id ? null : n)),
      2400
    );
  }, []);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const reject = useCallback(
    (text: string) => {
      play("bump");
      say(text);
      const el = wrapRef.current;
      if (!el || typeof el.animate !== "function") return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      el.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-5px)" },
          { transform: "translateX(5px)" },
          { transform: "translateX(-3px)" },
          { transform: "translateX(0)" },
        ],
        { duration: 320, easing: "ease-in-out" }
      );
    },
    [play, say]
  );

  /* ------------------------------------------------------------- actions */

  /** Play `move` from `from` (which must be the current position). */
  const commit = useCallback(
    (from: GameState, move: Move) => {
      const next = applyMove(from, move);
      setGame(next);
      setGhost(null);
      setChoice(null);
      setHoverSq(null);
      setNotice(null);
      if (next.winner !== null) {
        play(cpuSide !== null && next.winner === cpuSide ? "lose" : "win");
      } else if (isPawnMove(move)) {
        const a = from.pawns[from.turn];
        const reach = Math.abs(ROW[a] - ROW[move]) + Math.abs(COL[a] - COL[move]);
        play(reach > 1 ? "jump" : "step");
      } else {
        play("wall");
      }
    },
    [cpuSide, play]
  );

  const moveTo = useCallback(
    (sq: number) => {
      if (!interactive) return;
      if (!legalPawnMoves(game).includes(sq)) {
        reject("Your pawn can't move there");
        return;
      }
      setAim("move");
      commit(game, pawnMove(sq));
    },
    [interactive, game, commit, reject]
  );

  const build = useCallback(
    (o: Orientation, a: number) => {
      if (!interactive) return;
      const err = wallError(game, o, a);
      if (err) {
        reject(WALL_ERROR_TEXT[err]);
        return;
      }
      setAim("move");
      commit(game, wallMove(o, a));
    },
    [interactive, game, commit, reject]
  );

  const chooseAim = useCallback(
    (next: Aim) => {
      setChoice(null);
      setAim(next);
      if (next === "move") setGhost(null);
      else {
        setPreferred(next);
        // Keep a tapped preview where it is, just turned to the new orientation.
        setGhost((g) => (g && g.source === "pick" ? { ...g, o: next } : null));
      }
      play("tick");
    },
    [play]
  );

  const undo = useCallback(() => {
    if (undoPlies === 0) return;
    setGame(undoMoves(game, undoPlies));
    setGhost(null);
    setChoice(null);
    setHoverSq(null);
    setAim("move");
    play("undo");
  }, [undoPlies, game, play]);

  /* -------------------------------------------------------- board events */

  const onHover = useCallback(
    (hit: Hit | null) => {
      if (!interactive) return;
      if (hit && hit.kind === "wall") {
        setGhost((g) =>
          g && g.source === "pointer" && g.o === hit.o && g.a === hit.a
            ? g
            : { o: hit.o, a: hit.a, source: "pointer" }
        );
        setHoverSq(null);
      } else {
        setGhost((g) => (g && g.source === "pointer" ? null : g));
        setHoverSq(hit ? hit.sq : null);
      }
    },
    [interactive]
  );

  const onActivate = useCallback(
    (hit: Hit, touch: boolean) => {
      if (!interactive) return;
      if (hit.kind === "square") {
        if (targets.includes(hit.sq)) moveTo(hit.sq);
        else if (touch && hit.sq !== game.pawns[game.turn]) {
          say("Tap a glowing square, or choose a wall below");
        }
        return;
      }
      if (!touch) {
        build(hit.o, hit.a);
        return;
      }
      // Touch: the first tap previews, a second tap on the same spot builds.
      if (ghost && ghost.source === "pick" && ghost.o === hit.o && ghost.a === hit.a) {
        build(hit.o, hit.a);
      } else {
        setGhost({ o: hit.o, a: hit.a, source: "pick" });
        play("tick");
      }
    },
    [interactive, targets, game, ghost, moveTo, build, say, play]
  );

  /* ------------------------------------------------------------ keyboard */

  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey) return;
      const k = e.key;
      if ((k === "z" || k === "Z") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        undo();
        return;
      }
      if (e.metaKey || e.ctrlKey) return;
      if (k === "u" || k === "U") {
        undo();
        return;
      }
      if (k === "p" || k === "P") {
        onTogglePaths();
        return;
      }
      if (!interactive) return;

      if (k === "w" || k === "W") {
        if (aim === "move" && game.wallsLeft[game.turn] === 0) {
          reject(WALL_ERROR_TEXT["no-walls"]);
        } else if (aim === "move") {
          const o = preferred;
          setAim(o);
          setChoice(null);
          setGhost({ o, a: defaultAnchor(game, o), source: "pick" });
          play("tick");
        } else {
          setAim("move");
          setGhost(null);
          play("tick");
        }
        return;
      }
      if (k === "r" || k === "R") {
        const current = aim === "move" ? (ghost?.o ?? preferred) : aim;
        const o: Orientation = current === "h" ? "v" : "h";
        setPreferred(o);
        if (aim !== "move") setAim(o);
        setGhost((g) => (g ? { ...g, o } : g));
        play("tick");
        return;
      }
      if (k === "Escape") {
        if (choice) setChoice(null);
        else if (aim !== "move") {
          setAim("move");
          setGhost(null);
        } else setGhost(null);
        return;
      }

      const dir = ARROWS[k];
      if (dir !== undefined) {
        e.preventDefault();
        if (aim !== "move") {
          setGhost((g) =>
            g
              ? { ...g, a: nudgeAnchor(g.a, dir), source: "pick" }
              : { o: aim, a: defaultAnchor(game, aim), source: "pick" }
          );
          return;
        }
        const me = game.pawns[game.turn];
        const them = game.pawns[opponent(game.turn)];
        if (choice) {
          // Waiting for a side: the arrow must point along the opponent's flank.
          const pick = them + stepOffset(dir);
          if (perpendicular(choice.dir).includes(dir) && choice.options.includes(pick)) moveTo(pick);
          else if (dir !== choice.dir) reject("Pick one of the glowing squares");
          return;
        }
        const options = targetsToward(game.blocked, me, them, dir);
        if (options.length === 0) reject("Blocked that way");
        else if (options.length === 1) moveTo(options[0]);
        else {
          setNotice(null);
          setChoice({ dir, options });
          play("tick");
        }
        return;
      }

      if ((k === "Enter" || k === " ") && aim !== "move" && ghost) {
        e.preventDefault();
        build(ghost.o, ghost.a);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    paused,
    interactive,
    aim,
    preferred,
    ghost,
    choice,
    game,
    undo,
    onTogglePaths,
    moveTo,
    build,
    reject,
    play,
  ]);

  /* ------------------------------------------------------- computer turn */

  useEffect(() => {
    if (!thinking || paused) return;
    const started = performance.now();
    let timer = 0;
    const seed = (session.seed + game.history.length * 7919) >>> 0;
    const cancel = requestCpu(game, session.difficulty, seed, (move) => {
      // Never trust a move across a thread boundary blindly.
      const safe = isLegalMove(game, move) ? move : chooseMove(game, "easy", makeRng(seed));
      const wait = Math.max(0, CPU_MIN_DELAY_MS - (performance.now() - started));
      timer = window.setTimeout(() => commit(game, safe), wait);
    });
    return () => {
      cancel();
      window.clearTimeout(timer);
    };
  }, [thinking, paused, game, session.difficulty, session.seed, requestCpu, commit]);

  // Hand the finished game up after a beat, so the winning move is seen.
  useEffect(() => {
    if (game.winner === null) return;
    const t = window.setTimeout(() => onGameOver(game), 900);
    return () => window.clearTimeout(t);
  }, [game, onGameOver]);

  /* -------------------------------------------------------------- render */

  const picking = interactive && aim !== "move" && ghost !== null && ghost.source === "pick";
  const moverName = names[game.turn];

  let status: string;
  let tone: "plain" | "bad" | "good" | "think" = "plain";
  if (over) {
    const w = game.winner as Player;
    status = cpuSide === null ? `${names[w]} wins!` : w === HUMAN ? "You win!" : "The CPU wins";
    tone = cpuSide !== null && w === cpuSide ? "bad" : "good";
  } else if (thinking) {
    status = paused ? "CPU is waiting" : "CPU is thinking";
    tone = "think";
  } else if (notice) {
    status = notice.text;
    tone = "bad";
  } else if (choice) {
    const [a, b] = perpendicular(choice.dir);
    status = `Jump blocked · ${ARROW_GLYPH[a]} or ${ARROW_GLYPH[b]} to sidestep, Esc cancels`;
  } else if (ghost && ghostError) {
    status = WALL_ERROR_TEXT[ghostError];
    tone = "bad";
  } else if (aim !== "move") {
    status = `Wall ${aim === "h" ? "─" : "│"} · tap a spot, tap again to build`;
  } else {
    const who = cpuSide === null ? `${moverName} to move` : "Your move";
    status = game.wallsLeft[game.turn] > 0 ? `${who} · step or build a wall` : `${who} · out of walls`;
  }

  return (
    <>
      <Hud
        names={names}
        wallsLeft={game.wallsLeft}
        distances={distances}
        turn={game.turn}
        winner={game.winner}
        thinking={thinking}
      />

      <div className={cx("qd-board-wrap", thinking && "is-thinking")} ref={wrapRef}>
        <Board
          game={game}
          targets={targets}
          choice={choice ? choice.options : null}
          ghost={ghost}
          ghostOk={ghostError === null}
          hoverSq={hoverSq}
          showPaths={showPaths}
          interactive={interactive}
          aim={aim}
          preferred={preferred}
          names={names}
          onHover={onHover}
          onActivate={onActivate}
        />
      </div>

      {picking ? (
        <div className="qd-confirm">
          <button
            type="button"
            className="qd-primary qd-confirm-go"
            onClick={() => build(ghost.o, ghost.a)}
            disabled={ghostError !== null}
          >
            {ghostError === null ? "✓ Build wall" : WALL_ERROR_TEXT[ghostError]}
          </button>
          <button
            type="button"
            className="qd-ghost qd-confirm-x"
            onClick={() => setGhost(null)}
            aria-label="Cancel wall preview"
          >
            ✕
          </button>
        </div>
      ) : (
        <p className={cx("qd-status", `is-${tone}`)} role="status" aria-live="polite">
          {status}
          {tone === "think" && !paused ? <span className="qd-dots" aria-hidden /> : null}
        </p>
      )}

      {over && resultHidden ? (
        <div className="qd-footer">
          <button type="button" className="qd-primary" onClick={onShowResult}>
            🏁 Result
          </button>
          <button type="button" className="qd-ghost" onClick={onRestart}>
            New game
          </button>
          <button type="button" className="qd-ghost" onClick={onExit}>
            Menu
          </button>
        </div>
      ) : (
        <>
          <div className="qd-actions">
            <button
              type="button"
              className={cx("qd-btn", aim === "move" && "is-on")}
              onClick={() => chooseAim("move")}
              disabled={!interactive}
              aria-pressed={aim === "move"}
            >
              <span className="qd-glyph qd-glyph-pawn" aria-hidden />
              Move
            </button>
            <button
              type="button"
              className={cx("qd-btn", aim === "h" && "is-on")}
              onClick={() => chooseAim("h")}
              disabled={!interactive || game.wallsLeft[game.turn] === 0}
              aria-pressed={aim === "h"}
              aria-label="Horizontal wall"
            >
              <span className="qd-glyph qd-glyph-h" aria-hidden />
              Wall ─
            </button>
            <button
              type="button"
              className={cx("qd-btn", aim === "v" && "is-on")}
              onClick={() => chooseAim("v")}
              disabled={!interactive || game.wallsLeft[game.turn] === 0}
              aria-pressed={aim === "v"}
              aria-label="Vertical wall"
            >
              <span className="qd-glyph qd-glyph-v" aria-hidden />
              Wall │
            </button>
            <button type="button" className="qd-btn" onClick={undo} disabled={undoPlies === 0}>
              <span className="qd-btn-glyph" aria-hidden>
                ↶
              </span>
              Undo
            </button>
            <button
              type="button"
              className={cx("qd-btn", showPaths && "is-on")}
              onClick={onTogglePaths}
              aria-pressed={showPaths}
            >
              <span className="qd-glyph qd-glyph-path" aria-hidden />
              Paths
            </button>
          </div>

          <div className="qd-footer">
            <button type="button" className="qd-ghost" onClick={onRestart}>
              New game
            </button>
            <button
              type="button"
              className="qd-ghost qd-icon"
              onClick={onRules}
              aria-label="How to play"
            >
              ?
            </button>
            <button
              type="button"
              className="qd-ghost qd-icon"
              onClick={onToggleSound}
              aria-pressed={soundOn}
              aria-label={soundOn ? "Sound on" : "Sound off"}
            >
              {soundOn ? "🔊" : "🔇"}
            </button>
            <button type="button" className="qd-ghost" onClick={onExit}>
              Menu
            </button>
          </div>
        </>
      )}
    </>
  );
}
