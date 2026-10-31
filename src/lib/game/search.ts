import { ANCHOR_SIZE, ANCHORS, CELLS, GOAL_ROW, SIZE } from "./constants";
import {
  COL,
  DOWN,
  LEFT,
  RIGHT,
  ROW,
  UNREACHABLE,
  UP,
  anchor,
  distanceField,
  pathLength,
  pawnTargets,
  setWall,
  wallClash,
} from "./board";
import { H_BASE, V_BASE } from "./moves";
import { positionCounts, positionKey } from "./rules";
import type { Rng } from "./rng";
import type { GameState, Move, Orientation, Player } from "./types";

/**
 * Alpha-beta search for the Medium and Hard computer players.
 *
 * Quoridor's branching factor is the problem: up to 128 walls plus the pawn
 * moves, every turn. Two observations tame it:
 *
 *  1. A wall can only lengthen the opponent's shortest path if it cuts that
 *     path, so the walls worth searching sit along *one* shortest path (any
 *     single path will do: if a wall misses it, that path survives and the
 *     distance cannot grow). At the root a few quiet walls around both
 *     pawns are added, so defensive and set-up walls are still considered.
 *  2. Walls only change when one is placed. Distance fields (every square's
 *     distance to each goal row) are computed once per wall and then answer
 *     every pawn move below it with a lookup.
 *
 * The evaluation is the classic race margin — opponent's shortest path minus
 * our own — plus a value for walls still in hand, a small tempo for the side
 * to move, and a large bonus once a race can no longer be interfered with.
 */

export const MATE = 100_000;
const INF = 1_000_000;
const MAX_PLY = 48;
/** Upper bound on moves per node: 5 pawn moves plus at most 128 walls. */
const MAX_MOVES = 140;

/** One step of shortest-path difference. */
export const STEP_W = 100;
/**
 * A wall in hand, worth just under one step: spending a wall to cost the
 * opponent a single step loses to simply stepping forward, while one that
 * costs them two usually wins. (Tuned against 70, 110 and 130 in self-play.)
 */
export const WALL_W = 90;
/** A race the opponent can no longer interfere with (they have no walls). */
const RACE_W = 2_000;
/** The side to move is half a step ahead in any race. */
const TEMPO = 40;
/** Discourages walking back into a position already seen in this game. */
const REPEAT_W = 60;

/**
 * Static evaluation from the point of view of the side to move.
 * `dSelf`/`dOther` are shortest-path lengths, `wSelf`/`wOther` walls in hand.
 */
export function evaluate(dSelf: number, dOther: number, wSelf: number, wOther: number): number {
  let score = (dOther - dSelf) * STEP_W + (wSelf - wOther) * WALL_W + TEMPO;
  // With no walls left on one side the race is (nearly) decided: the side to
  // move wins it when it is no further from home than the other.
  if (wOther === 0 && dSelf <= dOther) score += RACE_W;
  else if (wSelf === 0 && dOther < dSelf) score -= RACE_W;
  return score;
}

export interface SearchOptions {
  /** Wall-clock budget in ms; the search stops at the first check after it. */
  timeBudgetMs?: number;
  /** Deepest iterative-deepening iteration to run. */
  maxDepth?: number;
  /** Deterministic budget (tests): stop after this many nodes. */
  nodeLimit?: number;
  /** Walls kept per interior node, best first. */
  wallCap?: number;
  /**
   * At the root, also try quiet walls around both pawns: set-up walls near
   * the opponent and defensive walls near our own pawn. (Deeper in the tree
   * only walls that lengthen the opponent's path are searched; self-play
   * showed quiet walls there cost more depth than they are worth.)
   */
  nearWalls?: boolean;
  /** Search every root move with a full window so all scores are exact. */
  exactRoot?: boolean;
  /**
   * Consider every legal wall at every node, with no pruning. Far too slow for
   * play; it exists so tests can check the pruned machinery against a naive
   * minimax.
   */
  fullWidth?: boolean;
  /** Random spread added to exact root scores (needs `exactRoot`). */
  rootNoise?: number;
  rng?: Rng;
  /** Clock override for tests. */
  now?: () => number;
}

export interface SearchResult {
  move: Move;
  score: number;
  /** Deepest fully completed iteration (0 for an instant forced answer). */
  depth: number;
  nodes: number;
  elapsedMs: number;
}

interface Limits {
  deadline: number;
  nodeLimit: number;
  maxDepth: number;
  wallCap: number;
  nearWalls: boolean;
  exactRoot: boolean;
  fullWidth: boolean;
  rootNoise: number;
  rng: Rng | null;
  now: () => number;
}

const defaultNow = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

class Searcher {
  /* ---- position (mutated by make / unmake) ---- */
  private readonly pawns = new Int32Array(2);
  private readonly walls = new Int32Array(2);
  private readonly h: Uint8Array;
  private readonly v: Uint8Array;
  private readonly blocked: Uint8Array;
  private turn: Player;
  private wallCount = 0;

  /* ---- distance fields: [ply * 2 + player]; pawn moves alias the parent ---- */
  private readonly fieldOf: Uint8Array[] = [];
  private readonly fieldBuf: Uint8Array[] = [];

  /* ---- per-ply move lists, with the distances each move leads to ---- */
  private readonly moveBuf: Int32Array[] = [];
  private readonly scoreBuf: Int32Array[] = [];
  private readonly meAfterBuf: Uint8Array[] = [];
  private readonly oppAfterBuf: Uint8Array[] = [];
  private readonly killers = new Int32Array(MAX_PLY * 2).fill(-1);

  /* ---- scratch for wall-candidate generation ---- */
  private readonly targets: number[] = [];
  private readonly cand = new Int32Array(2 * ANCHORS);
  private candCount = 0;
  private readonly candSeen = new Uint32Array(2 * ANCHORS);
  /** Path-edge marks: vertical steps keyed by upper square, horizontal by left. */
  private readonly oppV = new Uint32Array(CELLS);
  private readonly oppH = new Uint32Array(CELLS);
  private readonly meV = new Uint32Array(CELLS);
  private readonly meH = new Uint32Array(CELLS);
  private stamp = 0;

  /* ---- bookkeeping ---- */
  nodes = 0;
  private aborted = false;
  /** Limits are only enforced after depth 1, which must always finish. */
  private armed = false;
  private readonly repeats: Map<string, number>;

  constructor(
    state: GameState,
    private readonly limits: Limits
  ) {
    this.pawns[0] = state.pawns[0];
    this.pawns[1] = state.pawns[1];
    this.walls[0] = state.wallsLeft[0];
    this.walls[1] = state.wallsLeft[1];
    this.h = Uint8Array.from(state.h, (x) => (x ? 1 : 0));
    this.v = Uint8Array.from(state.v, (x) => (x ? 1 : 0));
    this.blocked = state.blocked.slice();
    this.turn = state.turn;
    for (let i = 0; i < ANCHORS; i++) this.wallCount += this.h[i] + this.v[i];
    this.repeats = positionCounts(state);

    for (let i = 0; i < (MAX_PLY + 1) * 2; i++) {
      const buf = new Uint8Array(CELLS);
      this.fieldBuf.push(buf);
      this.fieldOf.push(buf);
    }
    for (let i = 0; i <= MAX_PLY; i++) {
      this.moveBuf.push(new Int32Array(MAX_MOVES));
      this.scoreBuf.push(new Int32Array(MAX_MOVES));
      this.meAfterBuf.push(new Uint8Array(MAX_MOVES));
      this.oppAfterBuf.push(new Uint8Array(MAX_MOVES));
    }
    distanceField(this.blocked, GOAL_ROW[0], this.fieldBuf[0]);
    distanceField(this.blocked, GOAL_ROW[1], this.fieldBuf[1]);
  }

  /* --------------------------------------------------------------- driver */

  run(start: number): SearchResult {
    const me = this.turn;
    const done = (move: Move, score: number, depth: number): SearchResult => ({
      move,
      score,
      depth,
      nodes: this.nodes,
      elapsedMs: this.limits.now() - start,
    });

    // A winning pawn move ends the game: take it, no search needed.
    pawnTargets(this.blocked, this.pawns[me], this.pawns[me ^ 1], this.targets);
    for (const t of this.targets) if (ROW[t] === GOAL_ROW[me]) return done(t, MATE, 0);

    const n = this.generate(0, true);
    const moves = Array.from(this.moveBuf[0].subarray(0, n));
    const meAfter = Array.from(this.meAfterBuf[0].subarray(0, n));
    const oppAfter = Array.from(this.oppAfterBuf[0].subarray(0, n));
    if (n === 1) return done(moves[0], 0, 0);

    // Equal-looking root moves are tried in a shuffled order so the same
    // position does not always produce the same game.
    const order = moves.map((_, i) => i);
    if (this.limits.rng) {
      const scores = this.scoreBuf[0];
      const rng = this.limits.rng;
      const jitter = order.map(() => rng.next());
      order.sort((a, b) => scores[b] - scores[a] || jitter[a] - jitter[b]);
    }
    const root = order.map((i) => ({ move: moves[i], meAfter: meAfter[i], oppAfter: oppAfter[i] }));

    let best = root[0].move;
    let bestScore = -INF;
    let completed = 0;
    for (let depth = 1; depth <= this.limits.maxDepth; depth++) {
      this.armed = depth > 1;
      const result = this.searchRoot(root, depth);
      if (result.index >= 0) {
        best = root[result.index].move;
        bestScore = result.score;
        // Keep the best move first for the next, deeper iteration.
        const [top] = root.splice(result.index, 1);
        root.unshift(top);
      }
      if (this.aborted) break;
      completed = depth;
      if (Math.abs(bestScore) >= MATE - MAX_PLY) break; // forced result found
      if (this.limits.now() - start > (this.limits.deadline - start) * 0.55) break;
    }
    return done(best, bestScore, completed);
  }

  private searchRoot(
    root: { move: number; meAfter: number; oppAfter: number }[],
    depth: number
  ): { index: number; score: number } {
    const me = this.turn;
    let alpha = -INF;
    const beta = INF;
    let bestIndex = -1;
    let bestScore = -INF;
    const exact = this.limits.exactRoot;
    for (let i = 0; i < root.length; i++) {
      const { move, meAfter, oppAfter } = root[i];
      const pen = this.repeatPenalty(move);
      // Searching for raw > a is searching for (raw - pen) > alpha.
      const a = (exact ? -INF : alpha) + pen;
      const b = beta + pen;
      let raw: number;
      if (depth === 1) {
        raw = -this.leafValue(move, meAfter, oppAfter, 0);
      } else {
        const from = this.pawns[me];
        this.make(move, 0);
        if (i === 0 || exact) {
          raw = -this.negamax(depth - 1, -b, -a, 1);
        } else {
          raw = -this.negamax(depth - 1, -a - 1, -a, 1);
          if (!this.aborted && raw > a && raw < b) raw = -this.negamax(depth - 1, -b, -a, 1);
        }
        this.unmake(move, from);
        if (this.aborted) break;
      }
      let score = raw - pen;
      if (exact && this.limits.rng && this.limits.rootNoise > 0) {
        score += Math.floor(this.limits.rng.next() * this.limits.rootNoise);
      }
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
        if (score > alpha) alpha = score;
      }
    }
    return { index: bestIndex, score: bestScore };
  }

  /** A pawn move back into a position this game has already seen costs a little. */
  private repeatPenalty(move: Move): number {
    if (move >= H_BASE) return 0; // walls only accumulate, so never repeat
    const me = this.turn;
    const pawns = [this.pawns[0], this.pawns[1]];
    pawns[me] = move;
    const seen = this.repeats.get(positionKey(pawns, this.wallCount, (me ^ 1) as Player));
    return seen ? REPEAT_W * seen : 0;
  }

  /* --------------------------------------------------------------- search */

  private negamax(depth: number, alpha: number, beta: number, ply: number): number {
    this.nodes++;
    if ((this.nodes & 255) === 0) this.checkLimits();
    if (this.aborted) return 0;

    const me = this.turn;
    const opp = (me ^ 1) as Player;
    if (ROW[this.pawns[opp]] === GOAL_ROW[opp]) return -(MATE - ply);
    const dMe = this.fieldOf[ply * 2 + me][this.pawns[me]];
    const dOpp = this.fieldOf[ply * 2 + opp][this.pawns[opp]];
    if (dMe <= 2 && this.canWin(me, this.pawns[me], this.pawns[opp])) return MATE - ply - 1;
    if (depth <= 0 || ply >= MAX_PLY - 1) {
      return evaluate(dMe, dOpp, this.walls[me], this.walls[opp]);
    }

    const n = this.generate(ply, false);
    const moves = this.moveBuf[ply];
    let best = -INF;

    if (depth === 1) {
      // Children are leaves: score them straight from the distances the
      // generator already measured instead of making each move.
      const meAfter = this.meAfterBuf[ply];
      const oppAfter = this.oppAfterBuf[ply];
      for (let i = 0; i < n; i++) {
        const score = -this.leafValue(moves[i], meAfter[i], oppAfter[i], ply);
        if (score > best) {
          best = score;
          if (score > alpha) {
            alpha = score;
            if (alpha >= beta) {
              this.storeKiller(ply, moves[i]);
              break;
            }
          }
        }
      }
      return best;
    }

    for (let i = 0; i < n; i++) {
      const move = moves[i];
      const from = this.pawns[me];
      this.make(move, ply);
      let score: number;
      if (i === 0) {
        score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      } else {
        // Principal-variation search: prove the move is no better with a
        // null window, and only re-search the rare one that is.
        score = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1);
        if (!this.aborted && score > alpha && score < beta) {
          score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
        }
      }
      this.unmake(move, from);
      if (this.aborted) return 0;
      if (score > best) {
        best = score;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) {
            this.storeKiller(ply, move);
            break;
          }
        }
      }
    }
    return best;
  }

  /**
   * Value of the position after `move`, from the opponent's point of view
   * (they are to move there), using the distances measured at generation.
   */
  private leafValue(move: Move, meAfter: number, oppAfter: number, ply: number): number {
    this.nodes++;
    const me = this.turn;
    const opp = (me ^ 1) as Player;
    if (move < H_BASE) {
      if (ROW[move] === GOAL_ROW[me]) return -(MATE - ply - 1);
      if (oppAfter <= 2 && this.canWin(opp, this.pawns[opp], move)) return MATE - ply - 2;
      return evaluate(oppAfter, meAfter, this.walls[opp], this.walls[me]);
    }
    if (oppAfter <= 2) {
      const o: Orientation = move < V_BASE ? "h" : "v";
      const a = o === "h" ? move - H_BASE : move - V_BASE;
      setWall(this.blocked, o, a, true);
      const win = this.canWin(opp, this.pawns[opp], this.pawns[me]);
      setWall(this.blocked, o, a, false);
      if (win) return MATE - ply - 2;
    }
    return evaluate(oppAfter, meAfter, this.walls[opp], this.walls[me] - 1);
  }

  /** Can `player`, standing on `from` with the other pawn on `other`, win this move? */
  private canWin(player: Player, from: number, other: number): boolean {
    pawnTargets(this.blocked, from, other, this.targets);
    const goal = GOAL_ROW[player];
    for (const t of this.targets) if (ROW[t] === goal) return true;
    return false;
  }

  private checkLimits(): void {
    if (!this.armed) return;
    if (this.nodes >= this.limits.nodeLimit || this.limits.now() >= this.limits.deadline) {
      this.aborted = true;
    }
  }

  private storeKiller(ply: number, move: Move): void {
    const k = ply * 2;
    if (this.killers[k] !== move) {
      this.killers[k + 1] = this.killers[k];
      this.killers[k] = move;
    }
  }

  /* ---------------------------------------------------------- make/unmake */

  private make(move: Move, ply: number): void {
    const me = this.turn;
    const next = (ply + 1) * 2;
    if (move < H_BASE) {
      this.pawns[me] = move;
      this.fieldOf[next] = this.fieldOf[ply * 2];
      this.fieldOf[next + 1] = this.fieldOf[ply * 2 + 1];
    } else {
      const o: Orientation = move < V_BASE ? "h" : "v";
      const a = o === "h" ? move - H_BASE : move - V_BASE;
      (o === "h" ? this.h : this.v)[a] = 1;
      setWall(this.blocked, o, a, true);
      this.walls[me]--;
      this.wallCount++;
      const f0 = this.fieldBuf[next];
      const f1 = this.fieldBuf[next + 1];
      distanceField(this.blocked, GOAL_ROW[0], f0);
      distanceField(this.blocked, GOAL_ROW[1], f1);
      this.fieldOf[next] = f0;
      this.fieldOf[next + 1] = f1;
    }
    this.turn = (me ^ 1) as Player;
  }

  private unmake(move: Move, from: number): void {
    const me = (this.turn ^ 1) as Player;
    this.turn = me;
    if (move < H_BASE) {
      this.pawns[me] = from;
    } else {
      const o: Orientation = move < V_BASE ? "h" : "v";
      const a = o === "h" ? move - H_BASE : move - V_BASE;
      (o === "h" ? this.h : this.v)[a] = 0;
      setWall(this.blocked, o, a, false);
      this.walls[me]++;
      this.wallCount--;
    }
  }

  /* ------------------------------------------------------- move generation */

  /**
   * Fill `moveBuf[ply]` with the moves worth searching, best first: every pawn
   * move, then the walls that cut the opponent's shortest path (plus, at the
   * root, quiet walls around both pawns), each measured with a BFS so the
   * ordering — and the leaf scores — know exactly what the wall does.
   */
  private generate(ply: number, root: boolean): number {
    const me = this.turn;
    const opp = (me ^ 1) as Player;
    const moves = this.moveBuf[ply];
    const scores = this.scoreBuf[ply];
    const meAfter = this.meAfterBuf[ply];
    const oppAfter = this.oppAfterBuf[ply];
    const fMe = this.fieldOf[ply * 2 + me];
    const fOpp = this.fieldOf[ply * 2 + opp];
    const pMe = this.pawns[me];
    const pOpp = this.pawns[opp];
    const dMe = fMe[pMe];
    const dOpp = fOpp[pOpp];
    let n = 0;

    pawnTargets(this.blocked, pMe, pOpp, this.targets);
    for (const t of this.targets) {
      moves[n] = t;
      meAfter[n] = fMe[t];
      oppAfter[n] = dOpp;
      // A small bias so a step forward outranks a wall of equal net effect.
      scores[n] = (dMe - fMe[t]) * STEP_W + 10;
      n++;
    }

    if (this.walls[me] > 0) {
      const mark = ++this.stamp;
      this.candCount = 0;
      this.markRoute(fOpp, pOpp, GOAL_ROW[opp], this.oppV, this.oppH, mark, true);
      this.markRoute(fMe, pMe, GOAL_ROW[me], this.meV, this.meH, mark, false);
      // Quiet walls (ones that do not lengthen the opponent's path yet) are
      // only worth their branching at the root.
      const full = this.limits.fullWidth;
      const quiet = full || root;
      if (root && this.limits.nearWalls) {
        this.addAround(pOpp, mark);
        this.addAround(pMe, mark);
      }
      if (full) {
        for (let a = 0; a < ANCHORS; a++) {
          this.addCandidate(H_BASE + a, mark);
          this.addCandidate(V_BASE + a, mark);
        }
      }

      const firstWall = n;
      const pr = ROW[pOpp];
      const pc = COL[pOpp];
      for (let i = 0; i < this.candCount; i++) {
        const m = this.cand[i];
        const o: Orientation = m < V_BASE ? "h" : "v";
        const a = o === "h" ? m - H_BASE : m - V_BASE;
        if (wallClash(this.h, this.v, o, a)) continue;
        const hitsOpp = this.touches(o, a, this.oppV, this.oppH, mark);
        if (!hitsOpp && !quiet) continue;
        const hitsMe = this.touches(o, a, this.meV, this.meH, mark);
        let nOpp = dOpp;
        let nMe = dMe;
        if (hitsOpp || hitsMe) {
          setWall(this.blocked, o, a, true);
          if (hitsOpp) nOpp = pathLength(this.blocked, pOpp, GOAL_ROW[opp]);
          if (nOpp >= 0 && hitsMe) nMe = pathLength(this.blocked, pMe, GOAL_ROW[me]);
          setWall(this.blocked, o, a, false);
          if (nOpp < 0 || nMe < 0) continue; // would cut a pawn off: illegal
        }
        if (!quiet && nOpp <= dOpp) continue; // deep in the tree, only walls that bite
        moves[n] = m;
        meAfter[n] = nMe;
        oppAfter[n] = nOpp;
        const ar = Math.floor(a / ANCHOR_SIZE);
        const ac = a % ANCHOR_SIZE;
        const near = Math.abs(ar - pr) + Math.abs(ac - pc);
        scores[n] = (nOpp - dOpp - (nMe - dMe)) * STEP_W - WALL_W - near;
        n++;
      }

      // Keep only the strongest walls below the root.
      const cap = root || full ? MAX_MOVES : this.limits.wallCap;
      if (n - firstWall > cap) {
        this.sortRange(ply, firstWall, n);
        n = firstWall + cap;
      }
    }

    // Moves that caused cut-offs in sibling positions are tried early.
    const k = ply * 2;
    for (let i = 0; i < n; i++) {
      if (moves[i] === this.killers[k] || moves[i] === this.killers[k + 1]) scores[i] += 150;
    }
    this.sortRange(ply, 0, n);
    return n;
  }

  /** Insertion sort of `[from, to)` of a ply's move list, best score first. */
  private sortRange(ply: number, from: number, to: number): void {
    const moves = this.moveBuf[ply];
    const scores = this.scoreBuf[ply];
    const meAfter = this.meAfterBuf[ply];
    const oppAfter = this.oppAfterBuf[ply];
    for (let i = from + 1; i < to; i++) {
      const m = moves[i];
      const s = scores[i];
      const x = meAfter[i];
      const y = oppAfter[i];
      let j = i - 1;
      while (j >= from && scores[j] < s) {
        moves[j + 1] = moves[j];
        scores[j + 1] = scores[j];
        meAfter[j + 1] = meAfter[j];
        oppAfter[j + 1] = oppAfter[j];
        j--;
      }
      moves[j + 1] = m;
      scores[j + 1] = s;
      meAfter[j + 1] = x;
      oppAfter[j + 1] = y;
    }
  }

  private addCandidate(m: number, mark: number): void {
    const key = m - H_BASE;
    if (this.candSeen[key] === mark) return;
    this.candSeen[key] = mark;
    this.cand[this.candCount++] = m;
  }

  /** Both orientations at the four crossings around a pawn's square. */
  private addAround(sq: number, mark: number): void {
    const r = ROW[sq];
    const c = COL[sq];
    for (let ar = r - 1; ar <= r; ar++) {
      if (ar < 0 || ar >= ANCHOR_SIZE) continue;
      for (let ac = c - 1; ac <= c; ac++) {
        if (ac < 0 || ac >= ANCHOR_SIZE) continue;
        const a = anchor(ar, ac);
        this.addCandidate(H_BASE + a, mark);
        this.addCandidate(V_BASE + a, mark);
      }
    }
  }

  /**
   * Walk one shortest path downhill through `field`, marking each edge it
   * uses; with `collect`, also queue every wall that would cut one of them.
   */
  private markRoute(
    field: Uint8Array,
    from: number,
    goalRow: number,
    markV: Uint32Array,
    markH: Uint32Array,
    mark: number,
    collect: boolean
  ): void {
    const forward = goalRow === 0 ? UP : DOWN;
    const back = goalRow === 0 ? DOWN : UP;
    let sq = from;
    while (field[sq] > 0 && field[sq] !== UNREACHABLE) {
      const b = this.blocked[sq];
      const want = field[sq] - 1;
      let next = -1;
      if (!(b & forward) && field[sq + (forward === UP ? -SIZE : SIZE)] === want) {
        next = sq + (forward === UP ? -SIZE : SIZE);
      } else if (!(b & LEFT) && field[sq - 1] === want) {
        next = sq - 1;
      } else if (!(b & RIGHT) && field[sq + 1] === want) {
        next = sq + 1;
      } else if (!(b & back) && field[sq + (back === UP ? -SIZE : SIZE)] === want) {
        next = sq + (back === UP ? -SIZE : SIZE);
      }
      if (next < 0) return;
      if (next === sq - SIZE || next === sq + SIZE) {
        const top = Math.min(sq, next);
        markV[top] = mark;
        if (collect) {
          const r = ROW[top];
          const c = COL[top];
          if (c > 0) this.addCandidate(H_BASE + anchor(r, c - 1), mark);
          if (c < ANCHOR_SIZE) this.addCandidate(H_BASE + anchor(r, c), mark);
        }
      } else {
        const left = Math.min(sq, next);
        markH[left] = mark;
        if (collect) {
          const r = ROW[left];
          const c = COL[left];
          if (r > 0) this.addCandidate(V_BASE + anchor(r - 1, c), mark);
          if (r < ANCHOR_SIZE) this.addCandidate(V_BASE + anchor(r, c), mark);
        }
      }
      sq = next;
    }
  }

  /** Does the wall close one of the marked path edges? */
  private touches(
    o: Orientation,
    a: number,
    markV: Uint32Array,
    markH: Uint32Array,
    mark: number
  ): boolean {
    const tl = Math.floor(a / ANCHOR_SIZE) * SIZE + (a % ANCHOR_SIZE);
    if (o === "h") return markV[tl] === mark || markV[tl + 1] === mark;
    return markH[tl] === mark || markH[tl + SIZE] === mark;
  }
}

/**
 * Search the position for the side to move and return the move it prefers.
 * Never returns an illegal move: every candidate is generated from the same
 * primitives the rules use, walls are clash- and path-checked before entry.
 */
export function searchMove(state: GameState, options: SearchOptions = {}): SearchResult {
  const now = options.now ?? defaultNow;
  const start = now();
  const budget = options.timeBudgetMs ?? Number.POSITIVE_INFINITY;
  const searcher = new Searcher(state, {
    deadline: start + budget,
    nodeLimit: options.nodeLimit ?? Number.POSITIVE_INFINITY,
    maxDepth: Math.max(1, Math.min(options.maxDepth ?? 32, MAX_PLY - 2)),
    wallCap: options.wallCap ?? 8,
    nearWalls: options.nearWalls ?? true,
    exactRoot: options.exactRoot ?? false,
    fullWidth: options.fullWidth ?? false,
    rootNoise: options.rootNoise ?? 0,
    rng: options.rng ?? null,
    now,
  });
  return searcher.run(start);
}
