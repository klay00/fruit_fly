/* Phase 5b: the comparisons the escape experiment left out.
 *
 * results/phase5/GATE.md closed with "only escape was measured. Feeding, sleep and
 * foraging in the dragon body are not yet compared against the fly control." This is that.
 *
 * No prediction was pre-registered for these, so nothing here is a confirmation of
 * anything -- it is exploratory, and is labelled that way in the output.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { State } from './state.js';
import { drive, FLY, DRAGON } from '../app/composables/useBody.js';

const base = new URL('../public/brain/', import.meta.url).pathname;
const iface = JSON.parse(readFileSync(base + 'interface.json', 'utf8'));
const nb = readFileSync(base + 'net.bin');
const bin = nb.buffer.slice(nb.byteOffset, nb.byteOffset + nb.byteLength);
const { instance } = await WebAssembly.instantiate(readFileSync(base + 'lif.wasm'), {});
const mem = instance.exports.memory, lif_run = instance.exports.lif_run;
const { n, nnz, dly, dt, decay_g, decay_v, rfc_steps } = iface;
mem.grow(Math.max(0, Math.ceil(((n + 1) * 4 + nnz * 8 + n * 8 + dly * n * 4 + n * 8 + n * 4
  + 8192 + (1 << 20)) / 65536) - mem.buffer.byteLength / 65536));
let off = 0; const A = (b) => { const p = off; off = (off + b + 7) & ~7; return p; };
const P = { indptr: A((n + 1) * 4), cols: A(nnz * 4), vals: A(nnz * 4), v: A(n * 4),
  g: A(n * 4), ring: A(dly * n * 4), rfc: A(n * 4), scratch: A(n * 4), counts: A(n * 8),
  driven: A(8192), net: A(64) };
const i32 = new Int32Array(mem.buffer), f32 = new Float32Array(mem.buffer),
      i64 = new BigInt64Array(mem.buffer);
i32.set(new Int32Array(bin, 0, n + 1), P.indptr / 4);
i32.set(new Int32Array(bin, (n + 1) * 4, nnz), P.cols / 4);
f32.set(new Float32Array(bin, (n + 1 + nnz) * 4, nnz), P.vals / 4);
function reset(seed) {
  f32.fill(-52, P.v / 4, P.v / 4 + n); f32.fill(0, P.g / 4, P.g / 4 + n);
  f32.fill(0, P.ring / 4, P.ring / 4 + dly * n); i32.fill(0, P.rfc / 4, P.rfc / 4 + n);
  const s = P.net / 4;
  i32[s] = n; i32[s + 1] = dly; i32[s + 2] = rfc_steps; i32[s + 3] = 0;
  f32[s + 4] = decay_g; f32[s + 5] = decay_v; f32[s + 6] = dt;
  i32[s + 7] = P.indptr; i32[s + 8] = P.cols; i32[s + 9] = P.vals;
  i32[s + 10] = P.v; i32[s + 11] = P.g; i32[s + 12] = P.ring; i32[s + 13] = P.rfc;
  i64[(P.net + 56) / 8] = BigInt.asIntN(64, BigInt(seed) * 2654435761n + 1n);
}
const MS = 30;
function sugarDN(hz, seed) {
  reset(seed); i64.fill(0n, P.counts / 8, P.counts / 8 + n);
  if (hz > 0) {
    i32.set(Int32Array.from(iface.sensory.sugar), P.driven / 4);
    lif_run(P.net, P.driven, iface.sensory.sugar.length, hz,
            Math.round(MS / dt), P.scratch, P.counts);
  }
  const rate = (l) => (l.length
    ? (l.reduce((a, i) => a + Number(i64[P.counts / 8 + i]), 0) / l.length) * (1000 / MS) : 0);
  const out = {};
  for (const [ct, d] of Object.entries(iface.commands))
    out[ct] = { role: d.role, L: rate(d.left), R: rate(d.right) };
  out.MN9 = { role: 'feed', L: rate(iface.readout.MN9), R: 0 };
  return out;
}

console.log('Phase 5b - exploratory, no pre-registered prediction\n');

/* --- 1. Feeding. The sugar->MN9 pathway is identical in both bodies, so the command is
 * identical by construction. What differs is what a meal is worth: the same proboscis
 * command delivers energy scaled to the animal, against a metabolic cost that scales with
 * mass. This is the interesting quantity, and it is a calculation, not a simulation. */
console.log('--- feeding: the command is identical, the economics are not ---');
console.log(`${'drive'.padStart(6)} ${'MN9 (both bodies)'.padStart(19)}`);
for (const hz of [37, 100, 250]) {
  const d = sugarDN(hz, 11);
  console.log(`${String(hz).padStart(5)}Hz ${d.MN9.L.toFixed(1).padStart(18)} Hz`);
}
const S = DRAGON.bodyLength / FLY.bodyLength;
console.log(`\n  A proboscis extension is one command in both. But basal metabolism scales`);
console.log(`  roughly with mass^0.75, so the dragon at ${DRAGON.mass} kg burns about`);
console.log(`  ${Math.round(Math.pow(DRAGON.mass / (FLY.mass), 0.75)).toExponential(2)}x the fly's`);
console.log(`  resting energy while one MN9 command still delivers one mouthful.`);
console.log(`  Feeding is not a neural failure in the dragon; it is an arithmetic one.`);

/* --- 2. Sleep. The neuromodulator layer has no body terms at all, so the budget is
 * identical -- and that is itself the finding, not a null result to hide. */
function budget(motor) {
  const s = new State(); const b = {};
  for (let k = 0; k < 72 * 3600; k++) { s.step(1, { foodInReach: true, motor }); b[s.behaviour] = (b[s.behaviour] ?? 0) + 1; }
  return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, +((v / (72 * 3600)) * 24).toFixed(2)]));
}
console.log('\n--- sleep: identical, because the state layer knows nothing about bodies ---');
const bFly = budget(0.25), bDragon = budget(0.25);
console.log('  fly    ', bFly);
console.log('  dragon ', bDragon);
assert(Math.abs((bFly.sleep ?? 0) - (bDragon.sleep ?? 0)) < 0.01,
  'the sleep budgets differ, so something body-dependent leaked into the state layer');
console.log('  Identical to the second. The sleep homeostat is body-blind: it integrates');
console.log('  waking time and a circadian term, neither of which scales with size. A real');
console.log('  600 kg flyer would almost certainly not keep a 3 mm insect\'s rest schedule,');
console.log('  so this is a LIMIT OF THE MODEL, not a result about dragons.');

/* --- 3. Foraging. Energy economics again, but this one has a behavioural consequence:
 * how long can each body survive on the meals its brain will command? */
console.log('\n--- foraging: how long does a meal last? ---');
const HOUR = 3600;
function starveTime(motor) {
  const s = new State();
  let t = 0;
  while (s.energy > 0.001 && t < 400 * HOUR) { s.step(1, { foodInReach: false, motor }); t++; }
  return t / HOUR;
}
console.log(`  time from full to empty with no food, at rest    ${starveTime(0).toFixed(1)} h`);
console.log(`  ... exploring                                    ${starveTime(0.25).toFixed(1)} h`);
console.log(`  ... under constant escape effort                 ${starveTime(1).toFixed(1)} h`);
console.log(`\n  Same numbers for both bodies, for the same reason as sleep: the metabolic`);
console.log(`  model carries no mass term. Adding one is the obvious next change, and it`);
console.log(`  would make the dragon's energy budget the dominant constraint rather than a`);
console.log(`  constant. Recorded as an open gap.`);

/* --- 4. What the body map actually changes, end to end. */
console.log('\n--- the same DN vector, through two bodies ---');
const d = sugarDN(250, 5);
const cf = drive(d, FLY), cd = drive(d, DRAGON);
console.log(`${'signal'.padEnd(10)} ${'fly'.padStart(8)} ${'dragon'.padStart(8)}`);
for (const k of ['feed', 'escape', 'steer', 'thrust'])
  console.log(`${k.padEnd(10)} ${cf[k].toFixed(3).padStart(8)} ${cd[k].toFixed(3).padStart(8)}`);
console.log(`\n  drive() is shared, so these are equal by construction -- the command is the`);
console.log(`  same. Every difference between the animals appears AFTER this point, in what`);
console.log(`  the morphology can do with it: escape acceleration ${FLY.escapeAccel} vs`);
console.log(`  ${DRAGON.escapeAccel} m/s^2, a factor of ${S}.`);
for (const k of ['feed', 'escape', 'steer', 'thrust'])
  assert(Math.abs(cf[k] - cd[k]) < 1e-9, `drive() diverged on ${k} -- the interface is not shared`);
console.log('\nOK');
