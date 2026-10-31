import { DIFFICULTIES } from "@/lib/game/constants";
import type { Difficulty, Mode } from "@/lib/game/types";

/** Menu choices and toggles, remembered between visits. */
export interface Settings {
  mode: Mode;
  difficulty: Difficulty;
  /** Against the computer: does the human move first? */
  humanFirst: boolean;
  sound: boolean;
  /** Draw both players' shortest paths on the board. */
  paths: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "cpu",
  difficulty: "medium",
  humanFirst: true,
  sound: true,
  paths: false,
};

/** Read stored settings defensively: unknown or malformed fields fall back to defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    mode: s.mode === "local" || s.mode === "cpu" ? s.mode : DEFAULT_SETTINGS.mode,
    difficulty: DIFFICULTIES.includes(s.difficulty as Difficulty)
      ? (s.difficulty as Difficulty)
      : DEFAULT_SETTINGS.difficulty,
    humanFirst: typeof s.humanFirst === "boolean" ? s.humanFirst : DEFAULT_SETTINGS.humanFirst,
    sound: typeof s.sound === "boolean" ? s.sound : DEFAULT_SETTINGS.sound,
    paths: typeof s.paths === "boolean" ? s.paths : DEFAULT_SETTINGS.paths,
  };
}
