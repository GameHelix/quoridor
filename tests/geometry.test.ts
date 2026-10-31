import { describe, expect, it } from "vitest";
import { anchor } from "@/lib/game/board";
import {
  BOARD,
  GAP,
  PAD,
  PITCH,
  SQ,
  anchorCenter,
  hitTest,
  squareCenter,
  squareName,
  wallRect,
} from "@/lib/geometry";
import { sq } from "./helpers";

describe("board geometry", () => {
  it("fits nine squares and eight grooves inside the margin", () => {
    expect(BOARD).toBe(2 * PAD + 9 * SQ + 8 * GAP);
    expect(squareCenter(sq("a9"))).toEqual({ x: PAD + SQ / 2, y: PAD + SQ / 2 });
    expect(squareName(sq("e1"))).toBe("e1");
    expect(squareName(sq("i9"))).toBe("i9");
  });

  it("draws a wall across two squares and the groove between them", () => {
    const h = wallRect("h", anchor(0, 0));
    expect(h).toEqual({ x: PAD, y: PAD + SQ, w: 2 * SQ + GAP, h: GAP });
    const v = wallRect("v", anchor(7, 7));
    expect(v.w).toBe(GAP);
    expect(v.y + v.h).toBeCloseTo(BOARD - PAD);
  });
});

describe("pointer hit-testing", () => {
  const c = anchorCenter(anchor(3, 4));

  it("a mouse on a horizontal groove aims a horizontal wall at the nearest crossing", () => {
    expect(hitTest(c.x + 3, c.y, "move", true, "v")).toEqual({ kind: "wall", o: "h", a: anchor(3, 4) });
    expect(hitTest(c.x - 4, c.y + 0.5, "move", true, "v")).toEqual({ kind: "wall", o: "h", a: anchor(3, 4) });
  });

  it("a mouse on a vertical groove aims a vertical wall", () => {
    expect(hitTest(c.x, c.y - 3, "move", true, "h")).toEqual({ kind: "wall", o: "v", a: anchor(3, 4) });
  });

  it("right on a crossing the preferred orientation decides", () => {
    expect(hitTest(c.x, c.y, "move", true, "h")).toMatchObject({ kind: "wall", o: "h" });
    expect(hitTest(c.x, c.y, "move", true, "v")).toMatchObject({ kind: "wall", o: "v" });
  });

  it("the middle of a square is a square, for mouse and touch alike", () => {
    const e5 = squareCenter(sq("e5"));
    expect(hitTest(e5.x, e5.y, "move", true, "h")).toEqual({ kind: "square", sq: sq("e5") });
    expect(hitTest(e5.x, e5.y, "move", false, "h")).toEqual({ kind: "square", sq: sq("e5") });
  });

  it("touch in move mode always picks a square, even on a groove", () => {
    expect(hitTest(c.x + 3, c.y, "move", false, "h")).toMatchObject({ kind: "square" });
  });

  it("an aimed orientation snaps to the nearest crossing from anywhere, clamped at the edges", () => {
    const e5 = squareCenter(sq("e5"));
    const hit = hitTest(e5.x + 1, e5.y + 1, "v", false, "h");
    expect(hit).toEqual({ kind: "wall", o: "v", a: anchor(4, 4) });
    expect(hitTest(1, 1, "h", false, "v")).toEqual({ kind: "wall", o: "h", a: anchor(0, 0) });
    expect(hitTest(BOARD - 1, BOARD - 1, "h", true, "v")).toEqual({ kind: "wall", o: "h", a: anchor(7, 7) });
  });

  it("ignores points off the board", () => {
    expect(hitTest(-1, 10, "move", true, "h")).toBeNull();
    expect(hitTest(10, BOARD + PITCH, "h", false, "h")).toBeNull();
  });
});
