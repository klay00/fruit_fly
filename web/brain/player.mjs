/* The fly as a chess player: one network run per candidate move, no search. */
import { features, SIM_MS } from './mb.mjs';

export const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function material(chess, color) {
  let m = 0;
  for (const row of chess.board()) for (const p of row)
    if (p) m += (p.color === color ? 1 : -1) * PIECE_VALUE[p.type];
  return m;
}

/* Evaluate every legal move; return them sorted best-first, with the network's view of
 * each. `color` is the fly's colour, the perspective every value is taken from. */
export function think(mb, readout, chess, color, seed = 1) {
  const out = [];
  for (const mv of chess.moves({ verbose: true })) {
    chess.move(mv.san);
    const feat = features(chess, color);
    const r = mb.evaluate(feat, seed);
    const v = readout.value(r.kcRate);
    // terminal states are facts, not opinions
    let terminal = null;
    if (chess.isCheckmate()) terminal = 1;             // the mover just mated
    else if (chess.isDraw()) terminal = 0;
    chess.undo();
    out.push({ san: mv.san, from: mv.from, to: mv.to, value: terminal ?? v, net: v,
               terminal, kcRate: r.kcRate, kcActive: r.kcActive, capture: !!mv.captured });
  }
  out.sort((a, b) => b.value - a.value);
  return out;
}

export function choose(cands, epsilon, rng = Math.random) {
  if (!cands.length) return null;
  if (rng() < epsilon) return cands[Math.floor(rng() * cands.length)];
  return cands[0];
}
