"use client";

import { useCallback, useEffect, useRef } from "react";
import { chooseMove } from "@/lib/game/cpu";
import { makeRng } from "@/lib/game/rng";
import type { Difficulty, GameState, Move } from "@/lib/game/types";
import type { CpuRequest, CpuResponse } from "@/lib/workers/protocol";

/** Cancels a pending request; safe to call after it has completed. */
export type CancelCpu = () => void;

export type RequestCpu = (
  state: GameState,
  difficulty: Difficulty,
  seed: number,
  onMove: (move: Move) => void
) => CancelCpu;

/**
 * Asks the computer for a move without blocking the page. The search runs in
 * a Web Worker; where workers are unavailable (or one fails to start) it falls
 * back to the main thread after a short timeout, so "thinking…" still paints
 * before the search begins.
 *
 * Cancelling an unfinished search terminates the worker outright: a new one is
 * cheap, and a stale search must never deliver a move into a position that
 * has moved on (undo, restart, leaving the game).
 */
export function useCpu(): RequestCpu {
  const workerRef = useRef<Worker | null>(null);
  const brokenRef = useRef(false);
  const seqRef = useRef(0);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    []
  );

  return useCallback<RequestCpu>((state, difficulty, seed, onMove) => {
    let settled = false;
    let fallback = 0;

    const runHere = () => {
      fallback = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        onMove(chooseMove(state, difficulty, makeRng(seed)));
      }, 30);
    };

    let worker = workerRef.current;
    if (!worker && !brokenRef.current && typeof Worker !== "undefined") {
      try {
        worker = new Worker(new URL("../workers/cpu.worker.ts", import.meta.url), { type: "module" });
        workerRef.current = worker;
      } catch {
        brokenRef.current = true;
        worker = null;
      }
    }

    if (!worker) {
      runHere();
      return () => {
        settled = true;
        window.clearTimeout(fallback);
      };
    }

    const active = worker;
    const id = ++seqRef.current;
    const retire = () => {
      active.removeEventListener("message", onMessage);
      active.removeEventListener("error", onError);
    };
    const kill = () => {
      retire();
      active.terminate();
      if (workerRef.current === active) workerRef.current = null;
    };
    function onMessage(event: MessageEvent<CpuResponse>) {
      if (event.data.id !== id || settled) return;
      settled = true;
      retire();
      onMove(event.data.move);
    }
    function onError(event: ErrorEvent) {
      event.preventDefault();
      brokenRef.current = true;
      kill();
      if (!settled) runHere();
    }
    active.addEventListener("message", onMessage);
    active.addEventListener("error", onError);
    const request: CpuRequest = { id, state, difficulty, seed };
    active.postMessage(request);

    return () => {
      window.clearTimeout(fallback);
      if (settled) return;
      settled = true;
      kill();
    };
  }, []);
}
