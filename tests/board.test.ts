import { describe, expect, it } from "vitest";
import { ANCHORS, CELLS, GOAL_ROW } from "@/lib/game/constants";
import {
  DIRECTIONS,
  DOWN,
  LEFT,
  RIGHT,
  ROW,
  UNREACHABLE,
  UP,
  createBlocked,
  distanceField,
  pathFromField,
  pathLength,
  pawnTargets,
  setWall,
  shortestPath,
  targetsToward,
  wallClash,
  wallsAcross,
} from "@/lib/game/board";
import { at, position, randomPosition, sq } from "./helpers";

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
const targets = (s: ReturnType<typeof position>, p: 0 | 1 = 0) =>
  sorted(pawnTargets(s.blocked, s.pawns[p], s.pawns[1 - p]));
const names = (...xs: string[]) => sorted(xs.map(sq));

describe("board edges and walls", () => {
  it("closes exactly the board edges on a fresh board", () => {
    const b = createBlocked();
    expect(b[sq("a9")]).toBe(UP | LEFT);
    expect(b[sq("i1")]).toBe(DOWN | RIGHT);
    expect(b[sq("e5")]).toBe(0);
    expect(b[sq("e1")]).toBe(DOWN);
  });

  it("a wall closes its two edges from both sides, and lifting it reopens them", () => {
    const b = createBlocked();
    setWall(b, "h", at("d5"), true);
    expect(b[sq("d5")] & DOWN).toBeTruthy();
    expect(b[sq("e5")] & DOWN).toBeTruthy();
    expect(b[sq("d4")] & UP).toBeTruthy();
    expect(b[sq("e4")] & UP).toBeTruthy();
    expect(b[sq("f5")] & DOWN).toBeFalsy();
    setWall(b, "v", at("f3"), true);
    expect(b[sq("f3")] & RIGHT).toBeTruthy();
    expect(b[sq("f2")] & RIGHT).toBeTruthy();
    expect(b[sq("g3")] & LEFT).toBeTruthy();
    expect(b[sq("g2")] & LEFT).toBeTruthy();
    setWall(b, "h", at("d5"), false);
    setWall(b, "v", at("f3"), false);
    expect(Array.from(b)).toEqual(Array.from(createBlocked()));
  });

  it("detects overlapping and crossing walls, and allows touching ones", () => {
    const h = new Uint8Array(ANCHORS);
    const v = new Uint8Array(ANCHORS);
    h[at("d5")] = 1;
    expect(wallClash(h, v, "h", at("d5"))).toBe("overlap");
    expect(wallClash(h, v, "h", at("c5"))).toBe("overlap"); // shares d5's edge
    expect(wallClash(h, v, "h", at("e5"))).toBe("overlap"); // shares e5's edge
    expect(wallClash(h, v, "h", at("f5"))).toBeNull(); // end to end
    expect(wallClash(h, v, "v", at("d5"))).toBe("cross"); // same centre point
    expect(wallClash(h, v, "v", at("c5"))).toBeNull(); // T-junction at the end
    v[at("b7")] = 1;
    expect(wallClash(h, v, "v", at("b8"))).toBe("overlap");
    expect(wallClash(h, v, "v", at("b6"))).toBe("overlap");
    expect(wallClash(h, v, "v", at("b5"))).toBeNull();
    expect(wallClash(h, v, "h", at("b7"))).toBe("cross");
  });

  it("wallsAcross returns walls that really close the given edge", () => {
    for (const [a, b] of [
      ["e5", "e6"],
      ["e5", "f5"],
      ["a1", "a2"],
      ["i9", "h9"],
    ]) {
      const walls = wallsAcross(sq(a), sq(b));
      expect(walls.length).toBeGreaterThan(0);
      for (const [o, anchorIdx] of walls) {
        const blocked = createBlocked();
        setWall(blocked, o, anchorIdx, true);
        expect(pawnTargets(blocked, sq(a), -1)).not.toContain(sq(b));
      }
    }
  });
});

describe("pawn moves", () => {
  it("steps one square in each open direction", () => {
    expect(targets(position({ p0: "e5", p1: "a9" }))).toEqual(names("e6", "e4", "d5", "f5"));
  });

  it("respects the board edges", () => {
    expect(targets(position({ p0: "a1", p1: "i9" }))).toEqual(names("a2", "b1"));
    expect(targets(position({ p0: "e1", p1: "e9" }))).toEqual(names("d1", "f1", "e2"));
  });

  it("cannot pass through a wall", () => {
    const s = position({ p0: "e5", p1: "a9", walls: [{ o: "h", topLeft: "e6" }] });
    expect(targets(s)).toEqual(names("e4", "d5", "f5"));
    const t = position({ p0: "e5", p1: "a9", walls: [{ o: "v", topLeft: "e6" }] });
    expect(targets(t)).toEqual(names("e6", "e4", "d5"));
  });

  it("jumps straight over an adjacent pawn", () => {
    const s = position({ p0: "e5", p1: "e6" });
    expect(targets(s)).toEqual(names("e7", "e4", "d5", "f5"));
    // and the other way round
    expect(targets(s, 1)).toEqual(names("e4", "e7", "d6", "f6"));
  });

  it("side-steps diagonally when a wall is behind the other pawn", () => {
    const s = position({ p0: "e5", p1: "e6", walls: [{ o: "h", topLeft: "e7" }] });
    expect(targets(s)).toEqual(names("d6", "f6", "e4", "d5", "f5"));
  });

  it("side-steps diagonally when the board edge is behind the other pawn", () => {
    const s = position({ p0: "e8", p1: "e9" });
    expect(targets(s)).toEqual(names("d9", "f9", "e7", "d8", "f8"));
    const sideways = position({ p0: "b4", p1: "a4" });
    expect(targets(sideways)).toEqual(names("a5", "a3", "b5", "b3", "c4"));
  });

  it("loses a diagonal that is walled off too", () => {
    const s = position({
      p0: "e5",
      p1: "e6",
      walls: [
        { o: "h", topLeft: "e7" },
        { o: "v", topLeft: "e7" }, // right of e7 and e6
      ],
    });
    expect(wallClash(new Uint8Array(ANCHORS), new Uint8Array(ANCHORS), "h", at("e7"))).toBeNull();
    expect(targets(s)).toEqual(names("d6", "e4", "d5", "f5"));
  });

  it("cannot jump through a wall between the two pawns", () => {
    const s = position({ p0: "e5", p1: "e6", walls: [{ o: "h", topLeft: "d6" }] });
    expect(targets(s)).toEqual(names("e4", "d5", "f5"));
  });

  it("arrow targets agree with the full move list", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = randomPosition(seed, 10 + (seed % 30), 0.4);
      const me = s.pawns[s.turn];
      const them = s.pawns[1 - s.turn];
      const viaArrows = DIRECTIONS.flatMap((d) => targetsToward(s.blocked, me, them, d));
      expect(sorted(viaArrows)).toEqual(sorted(pawnTargets(s.blocked, me, them)));
    }
  });
});

describe("shortest paths (BFS)", () => {
  it("measures the open board", () => {
    const b = createBlocked();
    expect(pathLength(b, sq("e1"), GOAL_ROW[0])).toBe(8);
    expect(pathLength(b, sq("e9"), GOAL_ROW[1])).toBe(8);
    expect(pathLength(b, sq("c9"), GOAL_ROW[0])).toBe(0);
  });

  it("detours around walls", () => {
    const s = position({
      p0: "e1",
      p1: "e9",
      walls: [
        { o: "h", topLeft: "d2" },
        { o: "h", topLeft: "f2" },
      ],
    });
    // d2–g2 are capped: walk sideways to c or h first.
    expect(pathLength(s.blocked, sq("e1"), GOAL_ROW[0])).toBe(10);
  });

  it("reports a sealed pawn as unreachable", () => {
    const s = position({
      p0: "a1",
      p1: "e9",
      walls: [
        { o: "h", topLeft: "a2" },
        { o: "v", topLeft: "b2" },
      ],
    });
    expect(pathLength(s.blocked, sq("a1"), GOAL_ROW[0])).toBe(-1);
    const field = distanceField(s.blocked, GOAL_ROW[0], new Uint8Array(CELLS));
    expect(field[sq("a1")]).toBe(UNREACHABLE);
    expect(field[sq("b1")]).toBe(UNREACHABLE);
    expect(field[sq("c1")]).toBe(8);
    expect(shortestPath(s.blocked, sq("a1"), GOAL_ROW[0])).toBeNull();
  });

  it("distance fields, single-source BFS and extracted routes all agree", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = randomPosition(100 + seed, 30, 0.6);
      for (const p of [0, 1] as const) {
        const goal = GOAL_ROW[p];
        const field = distanceField(s.blocked, goal, new Uint8Array(CELLS));
        for (let x = 0; x < CELLS; x++) {
          const d = pathLength(s.blocked, x, goal);
          expect(d === -1 ? UNREACHABLE : d).toBe(field[x]);
        }
        const route = pathFromField(s.blocked, field, s.pawns[p], goal);
        expect(route).not.toBeNull();
        const path = route as number[];
        expect(path.length - 1).toBe(field[s.pawns[p]]);
        expect(ROW[path[path.length - 1]]).toBe(goal);
        for (let i = 0; i + 1 < path.length; i++) {
          expect(pawnTargets(s.blocked, path[i], -1)).toContain(path[i + 1]);
        }
      }
    }
  });

  it("only edges on a shortest path can lengthen it (the search's pruning rule)", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const s = randomPosition(500 + seed, 16, 0.5);
      const p = s.turn;
      const goal = GOAL_ROW[p];
      const route = shortestPath(s.blocked, s.pawns[p], goal) as number[];
      const before = route.length - 1;
      const onRoute = new Set<string>();
      for (let i = 0; i + 1 < route.length; i++) {
        for (const [o, a] of wallsAcross(route[i], route[i + 1])) onRoute.add(`${o}${a}`);
      }
      for (const o of ["h", "v"] as const) {
        for (let a = 0; a < ANCHORS; a++) {
          if (onRoute.has(`${o}${a}`) || wallClash(s.h, s.v, o, a)) continue;
          const trial = s.blocked.slice();
          setWall(trial, o, a, true);
          expect(pathLength(trial, s.pawns[p], goal)).toBe(before);
        }
      }
    }
  });
});
