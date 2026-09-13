/* The fly as a chess player.
 *
 * Choice: rehearsal. For each promising move the fly imagines the opponent's replies with
 * its OWN evaluator -- the same readout, read from the other side -- and keeps the value
 * of the reply it fears most. Two plies of mental simulation, nothing borrowed.
 *
 * Learning: reward-prediction error, the dopamine signal itself. After the real reply the
 * fly compares what happened with what it predicted; the difference moves the KC->MBON
 * synapses. Innate valence -- material gained is sugar, material lost is shock -- is the
 * fly's own taste, not an external judge. No trainer, no search beyond its own imagining.
 */
import { features } from './mb.mjs';

export const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const GAMMA = 0.7;

export function material(chess, color) {
  let m = 0;
  for (const row of chess.board()) for (const p of row)
    if (p) m += (p.color === color ? 1 : -1) * PIECE_VALUE[p.type];
  return m;
}

/* One-ply: value of the position after each legal move, from `color`'s view. */
export function think(mb, readout, chess, color, seed = 1) {
  const out = [];
  for (const mv of chess.moves({ verbose: true })) {
    chess.move(mv.san);
    const r = mb.evaluate(features(chess, color), seed);
    const v = readout.value(r.kcRate);
    let terminal = null;                                   // display label only
    if (chess.isCheckmate()) terminal = 1; else if (chess.isDraw()) terminal = 0;
    chess.undo();
    out.push({ san: mv.san, from: mv.from, to: mv.to, value: v, oneply: v, terminal,
               kcRate: r.kcRate, pnRate: r.pnRate, mbonRate: r.mbonRate,
               kcActive: r.kcActive, capture: !!mv.captured,
               rehearsed: false, feared: null });
  }
  out.sort((a, b) => b.value - a.value);
  return out;
}

/* Rehearse the top K: imagine every reply, keep the worst. Returns all candidates sorted,
 * rehearsed ones first. K bounds the cost -- a full 30x30 is ~900 network runs a move. */
export function rehearse(mb, readout, chess, color, K = 6, seed = 1) {
  const cands = think(mb, readout, chess, color, seed);
  for (const c of cands.slice(0, K)) {
    chess.move(c.san);
    let worst = Infinity, feared = null;
    if (chess.isGameOver()) worst = c.oneply;
    else for (const r of chess.moves({ verbose: true })) {
      chess.move(r.san);
      const v = readout.value(mb.evaluate(features(chess, color), seed).kcRate);
      chess.undo();
      if (v < worst) { worst = v; feared = r.san; }
    }
    chess.undo();
    c.value = worst; c.feared = feared; c.rehearsed = true;
  }
  cands.sort((a, b) => (b.rehearsed - a.rehearsed) || (b.value - a.value));
  return cands;
}

/* Dopamine. `chosen` is what the fly played (its KC code and the value it read there);
 * `after` is the real position once the opponent replied. Returns the prediction error. */
export function observe(mb, readout, chosen, chess, color, matBefore, eta = 0.01, seed = 1) {
  const reward = (material(chess, color) - matBefore) / 10;          // innate valence
  let next = 0;
  if (chess.isCheckmate()) next = chess.turn() === color ? -1 : 1;    // the outcome itself
  else if (!chess.isGameOver()) next = readout.value(mb.evaluate(features(chess, color), seed).kcRate);
  const predicted = readout.value(chosen.kcRate);
  const delta = reward + GAMMA * next - predicted;
  readout.update(chosen.kcRate, delta, eta);
  return { delta, reward, predicted, next };
}

export function choose(cands, epsilon, rng = Math.random) {
  const pool = cands.filter((c) => c.rehearsed);
  const from = pool.length ? pool : cands;
  if (!from.length) return null;
  if (rng() < epsilon) return from[Math.floor(rng() * from.length)];
  return from[0];
}
