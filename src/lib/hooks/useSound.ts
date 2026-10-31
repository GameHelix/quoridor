"use client";

import { useCallback, useEffect, useRef } from "react";

export type Voice = "step" | "jump" | "wall" | "bump" | "undo" | "tick" | "win" | "lose";

/**
 * Procedural Web Audio effects — no asset files, so nothing to load or 404.
 * The context is created lazily on the first sound because browsers refuse to
 * start one before a user gesture.
 *
 * The returned `play` keeps one identity for the hook's lifetime (the switch
 * is read from a ref), so toggling sound never re-runs effects that depend on
 * it — such as the computer's pending turn.
 */
export function useSound(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const context = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const blip = useCallback(
    (
      ctx: AudioContext,
      freq: number,
      duration: number,
      type: OscillatorType,
      gain: number,
      slideTo?: number,
      delay = 0
    ) => {
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (slideTo !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), start + duration);
      }
      amp.gain.setValueAtTime(gain, start);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(amp).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
      // Release the nodes as soon as they are silent so nothing accumulates
      // over a long session.
      osc.onended = () => {
        osc.disconnect();
        amp.disconnect();
      };
    },
    []
  );

  /** A short burst of filtered noise: the "clack" of a wall dropping in. */
  const thud = useCallback((ctx: AudioContext, gain: number, delay = 0) => {
    const start = ctx.currentTime + delay;
    const length = Math.floor(ctx.sampleRate * 0.09);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    src.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, start);
    amp.gain.setValueAtTime(gain, start);
    src.connect(filter).connect(amp).connect(ctx.destination);
    src.start(start);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      amp.disconnect();
    };
  }, []);

  const play = useCallback(
    (voice: Voice) => {
      if (!enabledRef.current) return;
      const ctx = context();
      if (!ctx) return;

      switch (voice) {
        case "step":
          // A soft two-tone hop for a pawn step.
          blip(ctx, 520, 0.07, "sine", 0.05);
          blip(ctx, 700, 0.1, "sine", 0.04, undefined, 0.05);
          break;
        case "jump":
          // A rising swoop when a pawn leaps over (or around) the other.
          blip(ctx, 440, 0.18, "triangle", 0.05, 990);
          blip(ctx, 1180, 0.1, "sine", 0.03, undefined, 0.14);
          break;
        case "wall":
          // A low clack plus a short resonant knock.
          thud(ctx, 0.16);
          blip(ctx, 150, 0.16, "square", 0.035, 90);
          break;
        case "bump":
          blip(ctx, 190, 0.2, "sawtooth", 0.04, 96);
          break;
        case "undo":
          blip(ctx, 620, 0.14, "triangle", 0.04, 300);
          break;
        case "tick":
          blip(ctx, 880, 0.035, "square", 0.018);
          break;
        case "win":
          [523, 659, 784, 1046, 1318].forEach((f, i) =>
            blip(ctx, f, 0.24, "triangle", 0.055, undefined, i * 0.1)
          );
          break;
        case "lose":
          [440, 370, 311, 247].forEach((f, i) =>
            blip(ctx, f, 0.3, "triangle", 0.05, undefined, i * 0.14)
          );
          break;
      }
    },
    [blip, context, thud]
  );

  return play;
}
