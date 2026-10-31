# 🧱 QUORIDOR

A neon **Quoridor**, the wall-building race board game for two. Get your pawn to the far side of a 9×9 board first, and spend your ten walls lengthening your rival's route, as long as you never seal it off completely. Built with **Next.js 16**, **TypeScript** (strict) and **Tailwind CSS v4**. Play a friend on one device, or a computer opponent whose Hard tier runs an iterative-deepening alpha-beta search in a Web Worker, so the board never freezes while it thinks. Every wall is checked with a breadth-first search, so an illegal one can never reach the board.

## ✨ Features

| | |
| --- | --- |
| 📏 Full rules | 9×9 board, ten walls each, straight jumps and diagonal side-steps, no overlapping or crossing walls |
| 🧭 Path-safe walls | A BFS refuses any wall that would cut either pawn off from its goal row |
| 🤖 Three CPU tiers | Easy wanders and drops the odd wall; Medium searches 3 plies; Hard reaches 8–10 plies in about a second |
| 🧵 Never freezes | The search runs in a Web Worker while the board shows "thinking…" |
| 👥 Hot-seat | Two players on one device, or choose to move first or second against the CPU |
| 👻 Ghost walls | Hover a groove for a green (legal) or red (illegal) preview with the reason, and click to build |
| 📱 Touch-first | Move / Wall ─ / Wall │ modes: tap to preview, tap again (or press Build) to place |
| 🟢 Clear board | Glowing legal moves including jumps, last-move trail, turn glow, walls-left pips and live route lengths |
| 🛤️ Route overlay | Toggle both players' shortest paths, drawn live as walls go down |
| ↩️ Undo | One ply in hot-seat, or back to your previous turn against the CPU |
| 🏆 Records | Win/loss per difficulty saved locally, plus a result panel with moves and walls used |
| 🔊 Procedural audio | Web Audio steps, jumps, wall clacks and fanfares, no asset files; honours reduced motion |

## 🎮 How to play

1. Pick **vs CPU** (Easy, Medium or Hard; move first or second) or **2 players**, then start.
2. Cyan starts at the bottom and races to the top row; magenta starts at the top and races down.
3. On your turn, either **move** one square (tap a glowing square), or **place a wall** across two squares.
4. Next to the other pawn you may **jump** over it. If a wall or the edge is behind it, step **diagonally** beside it instead.
5. Walls can't overlap, can't cross another wall at its centre, and must leave both pawns a route home. First pawn to reach its far row wins.

**Keys:** arrows move the pawn · `W` wall mode (arrows aim, `Enter` builds) · `R` rotate wall · `Esc` cancel · `U` / `Ctrl/⌘ + Z` undo · `P` toggle paths.

## 🛠 Tech

- **Next.js 16** (App Router) + **React 19**
- **TypeScript 5**, strict mode
- **Tailwind CSS v4** via `@tailwindcss/postcss`
- **Vitest 3** for the core-logic unit tests
- Pure, framework-free game engine (bitmask board, BFS path checks, move generation, PVS alpha-beta search with distance fields and pruned wall candidates) under `src/lib/game`

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build    # production build
npm test         # run the unit tests
npm run lint     # lint the project
```
