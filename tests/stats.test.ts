import { describe, expect, it } from "vitest";
import { recordResult, tallyOf } from "@/lib/game/stats";
import { DEFAULT_SETTINGS, normalizeSettings } from "@/lib/settings";

describe("win/loss records", () => {
  it("adds wins and losses per tier without touching the others", () => {
    let stats = recordResult({}, "hard", true);
    stats = recordResult(stats, "hard", false);
    stats = recordResult(stats, "easy", true);
    expect(tallyOf(stats, "hard")).toEqual({ wins: 1, losses: 1 });
    expect(tallyOf(stats, "easy")).toEqual({ wins: 1, losses: 0 });
    expect(tallyOf(stats, "medium")).toEqual({ wins: 0, losses: 0 });
  });

  it("reads malformed stored data as an empty record", () => {
    expect(tallyOf(null, "easy")).toEqual({ wins: 0, losses: 0 });
    expect(tallyOf("junk", "easy")).toEqual({ wins: 0, losses: 0 });
    expect(tallyOf({ easy: { wins: "3", losses: -2 } }, "easy")).toEqual({ wins: 0, losses: 0 });
    expect(recordResult({ medium: { wins: Number.NaN } }, "medium", true).medium).toEqual({
      wins: 1,
      losses: 0,
    });
  });
});

describe("settings", () => {
  it("fills in defaults and rejects unknown values", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ mode: "online", difficulty: "insane", sound: "yes" })).toEqual(
      DEFAULT_SETTINGS
    );
    expect(normalizeSettings({ mode: "local", difficulty: "hard", humanFirst: false, paths: true })).toEqual({
      ...DEFAULT_SETTINGS,
      mode: "local",
      difficulty: "hard",
      humanFirst: false,
      paths: true,
    });
  });
});
