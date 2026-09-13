/* Diagnostic: can a linear readout over the KC code recover material at all?
 * Fit on 1200 random positions, test on 300 held out. R^2 tells us the representation's
 * ceiling before any chess is attempted. */
import { readFileSync } from 'node:fs';
import { MushroomBody, Readout, features, Chess } from './mb.mjs';
import { material } from './player.mjs';

const base = new URL('../public/brain/', import.meta.url).pathname;
const mb = await MushroomBody.load(
  (f) => { const b = readFileSync(base + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
  (f) => JSON.parse(readFileSync(base + f, 'utf8')));

let seed = 7; const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const data = [];
while (data.length < 1500) {
  const g = new Chess();
  for (let k = 0; k < Math.floor(rand() * 50) && !g.isGameOver(); k++) { const m = g.moves(); g.move(m[Math.floor(rand() * m.length)]); }
  const me = g.turn();
  const r = mb.evaluate(features(g, me));
  data.push({ kc: r.kcRate, t: material(g, me) / 10, act: r.kcActive });
}
const train = data.slice(0, 1200), test = data.slice(1200);
const ro = new Readout(mb.iface.kc.length);
const r2 = (set) => { const m = set.reduce((a, d) => a + d.t, 0) / set.length; let ss = 0, sr = 0;
  for (const d of set) { ss += (d.t - m) ** 2; sr += (d.t - ro.value(d.kc)) ** 2; } return 1 - sr / ss; };
console.log(`KC active: mean ${(data.reduce((a, d) => a + d.act, 0) / data.length * 100).toFixed(1)}%`);
console.log(`material range in data: ${Math.min(...data.map(d => d.t * 10))} .. ${Math.max(...data.map(d => d.t * 10))}\n`);
for (let ep = 1; ep <= 300; ep++) {
  for (const d of train) ro.update(d.kc, d.t - ro.value(d.kc), 0.01 / Math.sqrt(1 + ep / 40));
  if (ep % 50 === 0) console.log(`epoch ${String(ep).padStart(2)}  R² train ${r2(train).toFixed(3)}  test ${r2(test).toFixed(3)}`);
}
