/* Train the fly by playing. Monte-Carlo returns with material shaping, experience replay,
 * the dopamine rule at KC->MBON and nothing else. Saves weights + a log the page reads. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { MushroomBody, Readout, Chess } from './mb.mjs';
import { think, choose, material } from './player.mjs';

const base = new URL('../public/brain/', import.meta.url).pathname;
const GAMES = +(process.argv[2] ?? 400);
const mb = await MushroomBody.load(
  (f) => { const b = readFileSync(base + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
  (f) => JSON.parse(readFileSync(base + f, 'utf8')));
const ro = existsSync(base + 'weights.json')
  ? Readout.from(JSON.parse(readFileSync(base + 'weights.json', 'utf8')))
  : new Readout(mb.iface.kc.length);
const log = existsSync(base + 'training.json') ? JSON.parse(readFileSync(base + 'training.json', 'utf8')) : [];
let seed = 1000 + log.length * 7919;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

/* Opponents. random: any legal move. greedy: best immediate material, else random. */
const opponents = {
  random: (g) => { const m = g.moves(); return m[Math.floor(rand() * m.length)]; },
  greedy: (g) => {
    const me = g.turn(); let best = null, bv = -Infinity;
    for (const mv of g.moves({ verbose: true })) {
      g.move(mv.san); const v = material(g, me) + (g.isCheckmate() ? 100 : 0) + rand() * 0.01; g.undo();
      if (v > bv) { bv = v; best = mv.san; }
    }
    return best;
  },
};

const buffer = [];                       // replay: { kc, target }
const BUF = 3000, GAMMA = 0.97, ETA = 0.01;

function play(oppName, gameNo) {
  const g = new Chess();
  const fly = gameNo % 2 ? 'w' : 'b';
  const eps = Math.max(0.05, 0.4 * Math.exp(-gameNo / 150));
  const visited = [];                    // fly's positions: { kc, matBefore, matAfter }
  let plies = 0;
  while (!g.isGameOver() && plies < 200) {
    if (g.turn() === fly) {
      const before = material(g, fly);
      const cands = think(mb, ro, g, fly, gameNo * 1000 + plies);
      const pick = choose(cands, eps, rand);
      g.move(pick.san);
      visited.push({ kc: pick.kcRate, r: (material(g, fly) - before) / 10 });
    } else {
      const before = material(g, fly);
      g.move(opponents[oppName](g));
      if (visited.length) visited[visited.length - 1].r += (material(g, fly) - before) / 10;
    }
    plies++;
  }
  let result = 0;
  if (g.isCheckmate()) result = g.turn() === fly ? -1 : 1;
  // discounted return from each fly position to the end of the game
  let G = result;
  for (let i = visited.length - 1; i >= 0; i--) {
    G = visited[i].r + GAMMA * G;
    buffer.push({ kc: visited[i].kc, target: Math.max(-1.5, Math.min(1.5, G)) });
  }
  while (buffer.length > BUF) buffer.shift();
  // replay: a few passes, the rule itself
  for (let ep = 0; ep < 4; ep++)
    for (let i = buffer.length - 1; i >= 0; i--) { const s = buffer[i]; ro.update(s.kc, s.target - ro.value(s.kc), ETA); }
  return { result, plies, matEnd: material(g, fly), eps };
}

const t0 = Date.now();
let wins = 0, draws = 0, losses = 0;
for (let i = 0; i < GAMES; i++) {
  const n = log.length;
  const opp = n < 150 ? 'random' : 'greedy';
  const r = play(opp, n);
  if (r.result > 0) wins++; else if (r.result < 0) losses++; else draws++;
  log.push({ n, opp, result: r.result, plies: r.plies, mat: r.matEnd, eps: +r.eps.toFixed(3) });
  if ((i + 1) % 10 === 0) {
    const recent = log.slice(-50);
    const wr = recent.filter((x) => x.result > 0).length / recent.length;
    const mat = recent.reduce((a, x) => a + x.mat, 0) / recent.length;
    console.log(`game ${String(n + 1).padStart(4)}  vs ${opp.padEnd(6)}  last50: win ${(wr * 100).toFixed(0).padStart(3)}%  ` +
      `mean material at end ${mat.toFixed(1).padStart(5)}  ε=${r.eps.toFixed(2)}  ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(1)}s/game`);
    writeFileSync(base + 'weights.json', JSON.stringify(ro));
    writeFileSync(base + 'training.json', JSON.stringify(log));
  }
}
writeFileSync(base + 'weights.json', JSON.stringify(ro));
writeFileSync(base + 'training.json', JSON.stringify(log));
console.log(`\ndone: ${wins}W ${draws}D ${losses}L over ${GAMES} games, ${log.length} total`);
