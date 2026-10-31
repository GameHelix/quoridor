"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { MenuScreen } from "./MenuScreen";
import { CPU, HUMAN, PlayScreen, playerNames, type Session } from "./PlayScreen";
import { ResultPanel } from "./ResultPanel";
import { RulesPanel } from "./RulesPanel";
import { SETTINGS_KEY, STATS_KEY } from "@/lib/game/constants";
import { randomSeed } from "@/lib/game/rng";
import { recordResult, tallyOf, type Stats } from "@/lib/game/stats";
import type { GameState } from "@/lib/game/types";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from "@/lib/settings";

interface Outcome {
  session: Session;
  final: GameState;
}

/**
 * Top-level orchestrator: routes between the menu and a game, and owns the
 * persisted settings and win/loss record, the rules dialog and the result
 * panel. Games (and their random seeds) are only created in response to a
 * click, so nothing random runs during SSR and hydration stays quiet.
 */
export function QuoridorGame() {
  const { value: storedSettings, store: storeSettings } = useLocalStorage<Settings>(
    SETTINGS_KEY,
    DEFAULT_SETTINGS
  );
  const settings = useMemo(() => normalizeSettings(storedSettings), [storedSettings]);
  const { value: stats, store: storeStats } = useLocalStorage<Stats>(STATS_KEY, {});

  const [session, setSession] = useState<Session | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  /** Nonce of the last game whose result was recorded, so a re-render never counts it twice. */
  const recorded = useRef(0);

  const changeSettings = useCallback(
    (patch: Partial<Settings>) => storeSettings({ ...settings, ...patch }),
    [settings, storeSettings]
  );

  const start = useCallback(() => {
    const seed = randomSeed();
    setOutcome(null);
    setResultOpen(false);
    setSession((prev) => ({
      nonce: (prev?.nonce ?? 0) + 1,
      mode: settings.mode,
      difficulty: settings.difficulty,
      first: settings.mode === "cpu" && !settings.humanFirst ? CPU : HUMAN,
      seed,
    }));
  }, [settings.mode, settings.difficulty, settings.humanFirst]);

  const exit = useCallback(() => {
    setOutcome(null);
    setResultOpen(false);
    setSession(null);
  }, []);

  const handleGameOver = useCallback(
    (final: GameState) => {
      if (!session || recorded.current === session.nonce || final.winner === null) return;
      recorded.current = session.nonce;
      if (session.mode === "cpu") {
        storeStats(recordResult(stats, session.difficulty, final.winner === HUMAN));
      }
      setOutcome({ session, final });
      setResultOpen(true);
    },
    [session, stats, storeStats]
  );

  return (
    <main className="qd-app">
      {session ? (
        <PlayScreen
          key={session.nonce}
          session={session}
          soundOn={settings.sound}
          paused={rulesOpen || resultOpen}
          showPaths={settings.paths}
          resultHidden={outcome !== null && !resultOpen}
          onTogglePaths={() => changeSettings({ paths: !settings.paths })}
          onToggleSound={() => changeSettings({ sound: !settings.sound })}
          onRules={() => setRulesOpen(true)}
          onGameOver={handleGameOver}
          onShowResult={() => setResultOpen(true)}
          onRestart={start}
          onExit={exit}
        />
      ) : (
        <MenuScreen
          settings={settings}
          stats={stats}
          onChange={changeSettings}
          onStart={start}
          onRules={() => setRulesOpen(true)}
        />
      )}

      {outcome && resultOpen ? (
        <ResultPanel
          final={outcome.final}
          mode={outcome.session.mode}
          difficulty={outcome.session.difficulty}
          names={playerNames(outcome.session.mode, outcome.session.difficulty)}
          tally={outcome.session.mode === "cpu" ? tallyOf(stats, outcome.session.difficulty) : null}
          onPlayAgain={start}
          onViewBoard={() => setResultOpen(false)}
          onMenu={exit}
        />
      ) : null}

      {rulesOpen ? <RulesPanel onClose={() => setRulesOpen(false)} /> : null}
    </main>
  );
}
