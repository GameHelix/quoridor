"use client";

import {
  memo,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cx } from "@/lib/cx";
import { ANCHORS, CELLS, PLAYERS } from "@/lib/game/constants";
import { ROW } from "@/lib/game/board";
import { isPawnMove, wallMove } from "@/lib/game/moves";
import { shortestRoute } from "@/lib/game/rules";
import type { GameState, Orientation, Player } from "@/lib/game/types";
import {
  BOARD,
  SQ,
  hitTest,
  squareCenter,
  squareName,
  squareOrigin,
  wallRect,
  type Aim,
  type Hit,
} from "@/lib/geometry";

export interface Ghost {
  o: Orientation;
  a: number;
  /** `pointer`: following a mouse; `pick`: a tapped or keyed preview awaiting confirmation. */
  source: "pointer" | "pick";
}

interface BoardProps {
  game: GameState;
  /** Squares the side to move may step to (empty when it is not a human's turn). */
  targets: readonly number[];
  /** Diagonal options awaiting a keyboard choice. */
  choice: readonly number[] | null;
  ghost: Ghost | null;
  ghostOk: boolean;
  hoverSq: number | null;
  showPaths: boolean;
  interactive: boolean;
  aim: Aim;
  preferred: Orientation;
  names: readonly [string, string];
  onHover: (hit: Hit | null) => void;
  onActivate: (hit: Hit, touch: boolean) => void;
}

/** Nudge the two route overlays apart so a shared stretch shows both colours. */
const ROUTE_OFFSET: readonly [number, number] = [-0.9, 0.9];

/**
 * The board as one SVG in board units. Pointer input is mapped through the
 * pure `hitTest`, so the same maths decides between a square and a groove for
 * a mouse and snaps a fingertip to the nearest crossing on touch; the board
 * itself holds no game state, only the last pointer type of a click.
 */
function BoardComponent({
  game,
  targets,
  choice,
  ghost,
  ghostOk,
  hoverSq,
  showPaths,
  interactive,
  aim,
  preferred,
  names,
  onHover,
  onActivate,
}: BoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pointerKind = useRef<string>("mouse");

  const routes = useMemo(
    () => (showPaths ? PLAYERS.map((p) => shortestRoute(game, p)) : null),
    [showPaths, game]
  );

  const last = game.history.length > 0 ? game.history[game.history.length - 1] : null;
  const lastWall = last && !isPawnMove(last.move) ? last.move : null;

  const toBoard = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: ((e.clientX - r.left) / r.width) * BOARD, y: ((e.clientY - r.top) / r.height) * BOARD };
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch") return;
    const p = toBoard(e);
    onHover(p ? hitTest(p.x, p.y, aim, true, preferred) : null);
  };

  const onPointerLeave = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== "touch") onHover(null);
  };

  const onClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    const touch = pointerKind.current === "touch";
    const p = toBoard(e);
    if (!p) return;
    const hit = hitTest(p.x, p.y, aim, !touch, preferred);
    if (hit) onActivate(hit, touch);
  };

  const walls: { o: Orientation; a: number; owner: Player; move: number }[] = [];
  for (let a = 0; a < ANCHORS; a++) {
    if (game.h[a]) walls.push({ o: "h", a, owner: (game.h[a] - 1) as Player, move: wallMove("h", a) });
    if (game.v[a]) walls.push({ o: "v", a, owner: (game.v[a] - 1) as Player, move: wallMove("v", a) });
  }

  const wallsDown = walls.length;
  const label = `${names[0]} on ${squareName(game.pawns[0])}, ${names[1]} on ${squareName(
    game.pawns[1]
  )}, ${wallsDown} wall${wallsDown === 1 ? "" : "s"} on the board`;

  const showGhost = interactive && ghost !== null;
  const hoverWall = showGhost && ghost.source === "pointer";
  const pointerTarget = interactive && hoverSq !== null && targets.includes(hoverSq);

  return (
    <svg
      ref={svgRef}
      className={cx(
        "qd-board",
        (hoverWall || pointerTarget) && "is-pointing",
        aim !== "move" && interactive && "is-aiming"
      )}
      viewBox={`0 0 ${BOARD} ${BOARD}`}
      role="img"
      aria-label={label}
      onPointerDown={(e) => {
        pointerKind.current = e.pointerType;
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
    >
      <defs>
        <radialGradient id="qd-pawn-grad-0" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#ecfeff" />
          <stop offset="38%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#0e7490" />
        </radialGradient>
        <radialGradient id="qd-pawn-grad-1" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#fdf4ff" />
          <stop offset="38%" stopColor="#f0abfc" />
          <stop offset="100%" stopColor="#a21caf" />
        </radialGradient>
        <filter id="qd-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="0.9" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="qd-glow-soft" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      <rect className="qd-plate" x={0} y={0} width={BOARD} height={BOARD} rx={3} />

      {Array.from({ length: CELLS }, (_, sq) => {
        const o = squareOrigin(sq);
        const row = ROW[sq];
        return (
          <rect
            key={sq}
            className={cx(
              "qd-sq",
              row === 0 && "is-goal-0",
              row === 8 && "is-goal-1",
              pointerTarget && hoverSq === sq && "is-hover"
            )}
            x={o.x}
            y={o.y}
            width={SQ}
            height={SQ}
            rx={1.5}
          />
        );
      })}

      {last && isPawnMove(last.move) ? (
        <g className={cx("qd-trail", `is-p${last.player}`)} key={`trail-${game.history.length}`}>
          <line
            x1={squareCenter(last.from).x}
            y1={squareCenter(last.from).y}
            x2={squareCenter(last.move).x}
            y2={squareCenter(last.move).y}
          />
          <circle cx={squareCenter(last.from).x} cy={squareCenter(last.from).y} r={2.3} />
        </g>
      ) : null}

      {routes
        ? routes.map((route, p) =>
            route.length > 1 ? (
              <polyline
                key={`route-${p}`}
                className={cx("qd-route", `is-p${p}`)}
                points={route
                  .map((sq) => {
                    const c = squareCenter(sq);
                    return `${c.x + ROUTE_OFFSET[p]},${c.y + ROUTE_OFFSET[p]}`;
                  })
                  .join(" ")}
              />
            ) : null
          )
        : null}

      {interactive && aim === "move"
        ? targets.map((sq) => {
            const c = squareCenter(sq);
            const picked = choice !== null && choice.includes(sq);
            return (
              <circle
                key={`t-${sq}`}
                className={cx(
                  "qd-dot",
                  `is-p${game.turn}`,
                  picked && "is-choice",
                  hoverSq === sq && "is-hover"
                )}
                cx={c.x}
                cy={c.y}
                r={1.9}
              />
            );
          })
        : null}

      {walls.map(({ o, a, owner, move }) => {
        const r = wallRect(o, a);
        return (
          <rect
            key={`w-${move}`}
            className={cx("qd-wall", `is-p${owner}`, move === lastWall && "is-last")}
            x={r.x + (o === "h" ? 0.35 : 0.2)}
            y={r.y + (o === "h" ? 0.2 : 0.35)}
            width={r.w - (o === "h" ? 0.7 : 0.4)}
            height={r.h - (o === "h" ? 0.4 : 0.7)}
            rx={0.9}
          />
        );
      })}

      {showGhost
        ? (() => {
            const r = wallRect(ghost.o, ghost.a);
            return (
              <rect
                className={cx("qd-phantom", ghostOk ? "is-ok" : "is-bad", ghost.source === "pick" && "is-pick")}
                x={r.x + 0.2}
                y={r.y + 0.2}
                width={r.w - 0.4}
                height={r.h - 0.4}
                rx={0.9}
              />
            );
          })()
        : null}

      {PLAYERS.map((p) => {
        const c = squareCenter(game.pawns[p]);
        const active = game.winner === null && game.turn === p;
        return (
          <g
            key={`pawn-${p}`}
            className={cx(
              "qd-pawn",
              `is-p${p}`,
              active && "is-active",
              game.winner === p && "is-winner"
            )}
            style={{ transform: `translate(${c.x}px, ${c.y}px)` }}
          >
            <circle className="qd-pawn-halo" r={4.4} filter="url(#qd-glow-soft)" />
            <circle className="qd-pawn-ring" r={4.3} />
            <circle className="qd-pawn-body" r={3.4} fill={`url(#qd-pawn-grad-${p})`} />
            <circle className="qd-pawn-shine" cx={-1.1} cy={-1.25} r={0.95} />
          </g>
        );
      })}
    </svg>
  );
}

export const Board = memo(BoardComponent);
