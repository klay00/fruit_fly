/* Gate 2: can the rule move the weights in the right direction at all?
 * Train on nothing but capture outcomes for a few hundred positions, then check that
 * winning a queen is valued above losing one. If this fails, no amount of games will help. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { MushroomBody, Readout, features, Chess } from './mb.mjs';
import { material } from './player.mjs';

const base = new URL('../public/brain/', import.meta.url).pathname;
const mb = await MushroomBody.load(
  (f) => { const b = readFileSync(base + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
  (f) => JSON.parse(readFileSync(base + f, 'utf8')));
const ro = new Readout(mb.iface.kc.length);

let seed = 1;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

// Random positions with a capture available: label = material swing of the best capture
// vs a random move, from the mover's view. Cheap supervised proxy for "learn material".
const samples = [];
while (samples.length < 1500) {
  const g = new Chess();
  for (let k = 0; k < 6 + Math.floor(rand() * 30) && !g.isGameOver(); k++) {
    const m = g.moves(); g.move(m[Math.floor(rand() * m.length)]);
  }
  if (g.isGameOver()) continue;
  const me = g.turn();
  const before = material(g, me);
  for (const mv of g.moves({ verbose: true })) {
    g.move(mv.san);
    const swing = material(g, me) - before;                 // what this move gained
    // then the opponent's best recapture, one ply, so a hanging queen counts against
    let worst = 0;
    for (const r of g.moves({ verbose: true })) { g.move(r.san); worst = Math.min(worst, material(g, me) - before); g.undo(); }
    g.undo();
    if (Math.abs(swing) >= 1 || worst <= -3) samples.push({ fen: g.fen(), san: mv.san, target: (swing + worst) / 10 });
    if (samples.length >= 1500) break;
  }
}
console.log(`${samples.length} capture positions\n`);

const feats = samples.map((s) => { const g = new Chess(s.fen); const me = g.turn(); g.move(s.san); return { kc: mb.evaluate(features(g, me)).kcRate, t: s.target }; });
const evalErr = () => { let e = 0; for (const f of feats) e += Math.abs(ro.value(f.kc) - f.t); return e / feats.length; };
console.log(`epoch  0   mean |error| ${evalErr().toFixed(3)}`);
for (let ep = 1; ep <= 200; ep++) {
  for (const f of feats) ro.update(f.kc, f.t - ro.value(f.kc), 0.01 / Math.sqrt(1 + ep / 40));
  if (ep % 50 === 0) console.log(`epoch ${String(ep).padStart(2)}   mean |error| ${evalErr().toFixed(3)}`);
}

// The test that matters: a fresh position, win a queen vs lose a queen.
const g = new Chess('rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3');
const me = 'w';
const v = (san) => { g.move(san); const r = ro.value(mb.evaluate(features(g, me)).kcRate); g.undo(); return r; };
const win = v('Nxh4'), lose = v('Nxe5');   // Nxe5?? hangs to ...Qxe4+ and worse; Nxh4 wins the queen
console.log(`\nvalue after Nxh4 (wins queen)  ${win.toFixed(3)}`);
console.log(`value after Nxe5 (loses queen) ${lose.toFixed(3)}`);
assert(win > lose + 0.05, 'the readout does not prefer winning a queen to losing one');
assert(evalErr() < 0.25, 'error did not fall - the rule is not learning');
console.log('\nGATE 2 PASSED: the dopamine rule moves the weights the right way.');
