/* Train by playing, the way the page does: rehearse, move, watch the reply, feel the
 * prediction error, adjust. No replay buffer, no Monte-Carlo returns -- what the browser
 * runs is exactly what runs here. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { MushroomBody, Readout, Chess } from './mb.mjs';
import { rehearse, observe, choose, material } from './player.mjs';

const base = new URL('../public/brain/', import.meta.url).pathname;
const GAMES = +(process.argv[2] ?? 200);
const mb = await MushroomBody.load(
  (f) => { const b = readFileSync(base + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
  (f) => JSON.parse(readFileSync(base + f, 'utf8')));
const ro = existsSync(base + 'weights.json') ? Readout.from(JSON.parse(readFileSync(base + 'weights.json', 'utf8'))) : new Readout(mb.iface.kc.length);
const log = existsSync(base + 'training.json') ? JSON.parse(readFileSync(base + 'training.json', 'utf8')) : [];
let seed = 1000 + log.length * 7919;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const opponents = {
  random: (g) => { const m = g.moves(); return m[Math.floor(rand() * m.length)]; },
  greedy: (g) => { const me = g.turn(); let best = null, bv = -Infinity;
    for (const mv of g.moves({ verbose: true })) { g.move(mv.san); const v = material(g, me) + (g.isCheckmate() ? 100 : 0) + rand() * 0.01; g.undo(); if (v > bv) { bv = v; best = mv.san; } }
    return best; },
};

function play(oppName, n) {
  const g = new Chess(); const fly = n % 2 ? 'w' : 'b';
  const eps = Math.max(0.03, 0.25 * Math.exp(-n / 60));
  let plies = 0, dsum = 0, dn = 0;
  if (g.turn() !== fly) g.move(opponents[oppName](g));
  while (!g.isGameOver() && plies < 140) {
    const mat = material(g, fly);
    const pick = choose(rehearse(mb, ro, g, fly, 6, n * 1000 + plies), eps, rand);
    g.move(pick.san);
    if (!g.isGameOver()) g.move(opponents[oppName](g));
    const o = observe(mb, ro, pick, g, fly, mat, 0.015, n * 1000 + plies);
    dsum += Math.abs(o.delta); dn++; plies += 2;
  }
  let result = 0; if (g.isCheckmate()) result = g.turn() === fly ? -1 : 1;
  return { result, plies, mat: material(g, fly), eps, delta: dsum / Math.max(1, dn) };
}

const t0 = Date.now();
for (let i = 0; i < GAMES; i++) {
  const n = log.length, opp = n < 40 ? 'random' : 'greedy';
  const r = play(opp, n);
  log.push({ n, opp, result: r.result, plies: r.plies, mat: r.mat, eps: +r.eps.toFixed(3), delta: +r.delta.toFixed(3) });
  if ((i + 1) % 5 === 0) {
    const rec = log.slice(-25);
    console.log(`game ${String(n + 1).padStart(4)}  vs ${opp.padEnd(6)}  last25: W ${rec.filter(x => x.result > 0).length} D ${rec.filter(x => x.result === 0).length} L ${rec.filter(x => x.result < 0).length}` +
      `  mat ${(rec.reduce((a, x) => a + x.mat, 0) / rec.length).toFixed(1).padStart(6)}  |δ| ${r.delta.toFixed(3)}  ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(0)}s/game`);
    writeFileSync(base + 'weights.json', JSON.stringify(ro)); writeFileSync(base + 'training.json', JSON.stringify(log));
  }
}
writeFileSync(base + 'weights.json', JSON.stringify(ro)); writeFileSync(base + 'training.json', JSON.stringify(log));
