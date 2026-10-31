import { describe, expect, it } from "vitest";
import { ANCHORS, WALLS_PER_PLAYER } from "@/lib/game/constants";
import { isPawnMove, pawnMove, wallMove } from "@/lib/game/moves";
import {
  applyMove,
  distanceToGoal,
  isLegalMove,
  legalMoves,
  legalPawnMoves,
  movesBy,
  newGame,
  positionCounts,
  positionKey,
  shortestRoute,
  undoMoves,
  wallError,
  wallsUsed,
} from "@/lib/game/rules";
import type { GameState, Move } from "@/lib/game/types";
import { at, position, randomPosition, sq } from "./helpers";

function play(state: GameState, ...moves: Move[]): GameState {
  return moves.reduce((s, m) => applyMove(s, m), state);
}

describe("new game", () => {
  it("puts both pawns home with ten walls each", () => {
    const s = newGame();
    expect(s.pawns).toEqual([sq("e1"), sq("e9")]);
    expect(s.wallsLeft).toEqual([WALLS_PER_PLAYER, WALLS_PER_PLAYER]);
    expect(s.turn).toBe(0);
    expect(s.winner).toBeNull();
    expect(newGame(1).turn).toBe(1);
  });

  it("offers three pawn steps and all 128 walls on the first turn", () => {
    const moves = legalMoves(newGame());
    expect(moves.filter(isPawnMove).length).toBe(3);
    expect(moves.length).toBe(3 + 2 * ANCHORS);
  });
});

describe("wall legality", () => {
  it("rejects overlapping and crossing walls", () => {
    const s = play(newGame(), wallMove("h", at("d5")));
    expect(wallError(s, "h", at("d5"))).toBe("overlap");
    expect(wallError(s, "h", at("c5"))).toBe("overlap");
    expect(wallError(s, "h", at("e5"))).toBe("overlap");
    expect(wallError(s, "v", at("d5"))).toBe("cross");
    expect(wallError(s, "h", at("f5"))).toBeNull();
    expect(wallError(s, "v", at("c5"))).toBeNull();
  });

  it("rejects a wall that would seal either pawn off, the mover's own included", () => {
    // a1 and b1 are capped from above; closing b1's right side seals them in.
    const own = position({ p0: "a1", p1: "e9", walls: [{ o: "h", topLeft: "a2" }] });
    expect(wallError(own, "v", at("b2"))).toBe("blocks-path");
    // The same trap around the opponent in the opposite corner.
    const theirs = position({ p0: "e5", p1: "a9", walls: [{ o: "h", topLeft: "a9" }] });
    expect(wallError(theirs, "v", at("b9"))).toBe("blocks-path");
    // One square over it leaves a gap, so it is fine.
    expect(wallError(theirs, "v", at("c9"))).toBeNull();
  });

  it("allows a wall that only lengthens a route", () => {
    const s = position({ p0: "a1", p1: "e9", walls: [{ o: "h", topLeft: "a2" }] });
    expect(distanceToGoal(s, 0)).toBe(10);
    expect(wallError(s, "h", at("c2"))).toBeNull();
    const after = applyMove(s, wallMove("h", at("c2")));
    expect(distanceToGoal(after, 0)).toBe(12);
  });

  it("rejects any wall once the mover has none left", () => {
    const s = position({ p0: "e1", p1: "e9", wallsLeft: [0, 3] });
    expect(wallError(s, "h", at("a5"))).toBe("no-walls");
    expect(legalMoves(s).every(isPawnMove)).toBe(true);
  });

  it("every listed legal move applies cleanly, and every wall listed keeps both routes open", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = randomPosition(seed, 20, 0.5);
      for (const m of legalMoves(s)) {
        const next = applyMove(s, m);
        expect(distanceToGoal(next, 0)).toBeGreaterThanOrEqual(0);
        expect(distanceToGoal(next, 1)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("playing moves", () => {
  it("alternates turns, spends walls and records who placed them", () => {
    const s = play(newGame(), pawnMove(sq("e2")), wallMove("h", at("d3")));
    expect(s.turn).toBe(0);
    expect(s.pawns[0]).toBe(sq("e2"));
    expect(s.wallsLeft).toEqual([10, 9]);
    expect(s.h[at("d3")]).toBe(2);
    expect(s.history.map((p) => p.player)).toEqual([0, 1]);
    expect(s.history[0].from).toBe(sq("e1"));
    expect(movesBy(s, 1)).toBe(1);
    expect(wallsUsed(s, 1)).toBe(1);
  });

  it("throws on an illegal move and never mutates the old state", () => {
    const s = newGame();
    expect(() => applyMove(s, pawnMove(sq("e3")))).toThrow();
    expect(() => applyMove(s, 9999)).toThrow();
    const before = Array.from(s.blocked);
    applyMove(s, wallMove("v", at("c4")));
    expect(Array.from(s.blocked)).toEqual(before);
    expect(s.v[at("c4")]).toBe(0);
  });

  it("ends the game when a pawn reaches its goal row", () => {
    const s = position({ p0: "e8", p1: "a2", turn: 0 });
    expect(legalPawnMoves(s)).toContain(sq("e9"));
    const won = applyMove(s, pawnMove(sq("e9")));
    expect(won.winner).toBe(0);
    expect(legalMoves(won)).toEqual([]);
    expect(isLegalMove(won, pawnMove(sq("a2")))).toBe(false);
    expect(distanceToGoal(won, 0)).toBe(0);
  });

  it("player 1 wins on the bottom row, also by jumping", () => {
    const s = position({ p0: "e1", p1: "e2", turn: 1 });
    // e1 is occupied and the edge is behind it: side-step onto d1 or f1.
    expect(legalPawnMoves(s)).toEqual(expect.arrayContaining([sq("d1"), sq("f1")]));
    expect(applyMove(s, pawnMove(sq("d1"))).winner).toBe(1);
  });

  it("undo replays to the earlier position", () => {
    const start = newGame(1);
    const mid = play(start, pawnMove(sq("e8")), wallMove("h", at("d3")));
    const later = play(mid, pawnMove(sq("e7")), pawnMove(sq("e2")));
    const back = undoMoves(later, 2);
    expect(back.pawns).toEqual(mid.pawns);
    expect(back.turn).toBe(mid.turn);
    expect(back.wallsLeft).toEqual(mid.wallsLeft);
    expect(Array.from(back.blocked)).toEqual(Array.from(mid.blocked));
    expect(undoMoves(later, 99).history.length).toBe(0);
  });

  it("counts repeated positions for the repetition guard", () => {
    const s = play(
      newGame(),
      pawnMove(sq("e2")),
      pawnMove(sq("e8")),
      pawnMove(sq("e1")),
      pawnMove(sq("e9"))
    );
    const counts = positionCounts(s);
    expect(counts.get(positionKey([sq("e1"), sq("e9")], 0, 0))).toBe(2);
    expect(counts.get(positionKey([sq("e2"), sq("e9")], 0, 1))).toBe(1);
  });

  it("returns a full route for each player", () => {
    const s = newGame();
    const route = shortestRoute(s, 0);
    expect(route[0]).toBe(sq("e1"));
    expect(route.length).toBe(9);
  });
});
