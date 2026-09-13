/* Gate 1: does the wiring produce a sparse Kenyon-cell code from our board input?
 * Biology: 5-10% of KCs respond to any odour (Turner et al. 2008; Honegger 2011).
 * If the encoding cannot reach that range, nothing downstream is a fly's computation. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { MushroomBody, features, Chess } from './mb.mjs';

const base = new URL('../public/brain/', import.meta.url).pathname;
const mb = await MushroomBody.load(
  (f) => { const b = readFileSync(base + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
  (f) => JSON.parse(readFileSync(base + f, 'utf8')));

const chess = new Chess();
const positions = [chess.fen()];
for (let i = 0; i < 6; i++) {           // walk a random game to get varied boards
  const g = new Chess(positions[positions.length - 1]);
  for (let k = 0; k < 8 && !g.isGameOver(); k++) {
    const m = g.moves(); g.move(m[Math.floor(Math.random() * m.length)]);
  }
  positions.push(g.fen());
}
console.log(`MB: ${mb.iface.n.toLocaleString()} neurons · PN ${mb.iface.pn.length} · KC ${mb.iface.kc.length} · MBON ${mb.iface.mbon.length}\n`);
let sum = 0, codes = [];
for (const fen of positions) {
  const r = mb.evaluate(features(new Chess(fen)));
  sum += r.kcActive; codes.push(r.kcRate);
  const mbOn = Array.from(r.mbonRate).filter((v) => v > 0).length;
  console.log(`KC active ${(r.kcActive * 100).toFixed(1).padStart(5)}%   MBONs firing ${String(mbOn).padStart(2)}/${mb.iface.mbon.length}   ${fen.split(' ')[0].slice(0, 30)}…`);
}
const mean = sum / positions.length;
// different boards must give different codes, or the net cannot tell positions apart
let overlap = 0, pairs = 0;
for (let i = 0; i < codes.length; i++) for (let j = i + 1; j < codes.length; j++) {
  let both = 0, either = 0;
  for (let k = 0; k < codes[i].length; k++) { const a = codes[i][k] > 0, b = codes[j][k] > 0; if (a && b) both++; if (a || b) either++; }
  overlap += either ? both / either : 0; pairs++;
}
console.log(`\nmean KC sparseness ${(mean * 100).toFixed(1)}%   mean Jaccard overlap between positions ${(overlap / pairs).toFixed(2)}`);
assert(mean > 0.015 && mean < 0.12, `KC sparseness ${(mean*100).toFixed(1)}% outside the 1.5-12% range`);
assert(overlap / pairs < 0.7, 'positions produce near-identical KC codes - the net cannot distinguish boards');
console.log('\nGATE 1 PASSED: the wiring sparsifies board input the way it sparsifies odour.');
