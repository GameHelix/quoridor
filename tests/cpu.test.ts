import { describe, expect, it } from "vitest";
import { DIFFICULTIES, HARD_BUDGET_MS } from "@/lib/game/constants";
import { chooseMove, winningMove, type CpuOptions } from "@/lib/game/cpu";
import { isWallMove, pawnMove } from "@/lib/game/moves";
import { makeRng } from "@/lib/game/rng";
import { applyMove, isLegalMove, newGame } from "@/lib/game/rules";
import type { Difficulty, GameState, Player } from "@/lib/game/types";
import { position, randomPosition, sq } from "./helpers";

/** Hard on a node budget: deterministic, and fast enough for whole games. */
const QUICK: CpuOptions = { nodeLimit: 3000, timeBudgetMs: 60_000 };

function playGame(
  sides: [Difficulty, Difficulty],
  seed: number,
  first: Player,
  options: CpuOptions = QUICK
): GameState {
  const rng = makeRng(seed);
  let s = newGame(first);
  while (s.winner === null && s.history.length < 400) {
    const move = chooseMove(s, sides[s.turn], rng, options);
    expect(isLegalMove(s, move)).toBe(true);
    s = applyMove(s, move);
  }
  return s;
}

describe("legality", () => {
  it("every tier returns a legal move in many random positions", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = randomPosition(seed * 7, 4 + (seed % 36), 0.45);
      for (const d of DIFFICULTIES) {
        const move = chooseMove(s, d, makeRng(seed), { nodeLimit: 1500, timeBudgetMs: 60_000 });
        expect(isLegalMove(s, move)).toBe(true);
      }
    }
  }, 60_000);

  it("stays legal when out of walls or boxed into a corridor", () => {
    const corridor = position({
      p0: "a1",
      p1: "a3",
      turn: 0,
      wallsLeft: [0, 2],
      walls: [
        { o: "v", topLeft: "a2" },
        { o: "v", topLeft: "a4" },
      ],
    });
    for (const d of DIFFICULTIES) {
      const move = chooseMove(corridor, d, makeRng(3), QUICK);
      expect(isLegalMove(corridor, move)).toBe(true);
      expect(isWallMove(move)).toBe(false);
    }
  });
});

describe("tactics", () => {
  // [description, position, the only winning square or null when several win]
  const wins: [string, GameState, string | null][] = [
    ["a plain step", position({ p0: "e4", p1: "c2", turn: 1 }), "c1"],
    ["a straight jump", position({ p0: "d7", p1: "d8", turn: 0 }), "d9"],
    // The other pawn sits on the goal row with the edge behind it.
    ["a side-step around a pawn on the goal row", position({ p0: "g8", p1: "g9", turn: 0 }), null],
    [
      // e8's way up is walled and the jump over f8 is walled: only f9 wins.
      "a diagonal side-step past a walled jump",
      position({
        p0: "e8",
        p1: "f8",
        turn: 0,
        walls: [
          { o: "h", topLeft: "d9" },
          { o: "v", topLeft: "f9" },
        ],
      }),
      "f9",
    ],
  ];

  for (const [what, s, only] of wins) {
    it(`takes a one-move win by ${what}`, () => {
      expect(winningMove(s)).not.toBeNull();
      for (const d of DIFFICULTIES) {
        for (let seed = 1; seed <= 4; seed++) {
          const move = chooseMove(s, d, makeRng(seed), QUICK);
          expect(applyMove(s, move).winner).toBe(s.turn);
          if (only) expect(move).toBe(pawnMove(sq(only)));
        }
      }
    });
  }

  it("Medium and Hard wall off an opponent who is one step from home", () => {
    // The human (player 0) needs one step; the CPU is far away but has walls.
    const s = position({ p0: "e8", p1: "a5", turn: 1, wallsLeft: [3, 5] });
    for (const d of ["medium", "hard"] as const) {
      for (let seed = 1; seed <= 3; seed++) {
        const move = chooseMove(s, d, makeRng(seed), QUICK);
        expect(isWallMove(move)).toBe(true);
        expect(winningMove(applyMove(s, move))).toBeNull();
      }
    }
  });
});

describe("whole games", () => {
  it("CPU-vs-CPU games always finish, across every pairing", () => {
    const pairings: [Difficulty, Difficulty][] = [
      ["easy", "easy"],
      ["easy", "medium"],
      ["medium", "medium"],
      ["medium", "hard"],
      ["hard", "hard"],
    ];
    pairings.forEach((sides, i) => {
      for (let g = 0; g < 2; g++) {
        const end = playGame(sides, 40 + i * 10 + g, (g % 2) as Player);
        expect(end.winner).not.toBeNull();
        expect(end.history.length).toBeLessThan(400);
      }
    });
  }, 120_000);

  it("Hard beats Easy in most of a small seeded sample", () => {
    let hardWins = 0;
    const games = 6;
    for (let g = 0; g < games; g++) {
      const hardSide = (g % 2) as Player;
      const sides: [Difficulty, Difficulty] = hardSide === 0 ? ["hard", "easy"] : ["easy", "hard"];
      const end = playGame(sides, 900 + g, ((g >> 1) % 2) as Player);
      if (end.winner === hardSide) hardWins++;
    }
    expect(hardWins).toBeGreaterThanOrEqual(5);
  }, 120_000);
});

describe("time budget", () => {
  it("Hard answers within its budget in a busy middle game", () => {
    const busy = randomPosition(4242, 14, 0.3);
    expect(busy.winner).toBeNull();
    for (const s of [newGame(), busy]) {
      const t0 = performance.now();
      const move = chooseMove(s, "hard", makeRng(1));
      const elapsed = performance.now() - t0;
      expect(isLegalMove(s, move)).toBe(true);
      // The search stops at its ~1 s budget; allow slack for slow machines.
      expect(elapsed).toBeLessThan(HARD_BUDGET_MS + 500);
    }
  }, 10_000);

  it("Medium and Easy answer almost instantly", () => {
    const s = randomPosition(99, 12, 0.3);
    for (const d of ["easy", "medium"] as const) {
      const t0 = performance.now();
      chooseMove(s, d, makeRng(2));
      expect(performance.now() - t0).toBeLessThan(400);
    }
  });
});
