/* Does the animal actually do anything?
 *
 * Written in response to a plain observation: "it just circles". Three things had to be
 * true for that not to happen, and none of them were. This runs the real worker loop --
 * the same wasm, the same net.bin, the same State -- and checks each.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { State } from './state.js';

const base = new URL('../public/brain/', import.meta.url).pathname;
const iface = JSON.parse(readFileSync(base + 'interface.json', 'utf8'));
const nb = readFileSync(base + 'net.bin');
const bin = nb.buffer.slice(nb.byteOffset, nb.byteOffset + nb.byteLength);
const { instance } = await WebAssembly.instantiate(readFileSync(base + 'lif.wasm'), {});
const mem = instance.exports.memory, lif_run = instance.exports.lif_run;
const { n, nnz, dly, dt, decay_g, decay_v, rfc_steps } = iface;

const maxDriven = Math.max(...Object.values(iface.sensory).map((g) => g.length));
const drivenCap = Math.max(64, maxDriven * 2);
mem.grow(Math.max(0, Math.ceil(((n + 1) * 4 + nnz * 8 + n * 8 + dly * n * 4 + n * 8 + n * 4
  + drivenCap * 8 + 8192 + (1 << 20)) / 65536) - mem.buffer.byteLength / 65536));
let off = 0; const A = (b) => { const p = off; off = (off + b + 7) & ~7; return p; };
const P = { indptr: A((n + 1) * 4), cols: A(nnz * 4), vals: A(nnz * 4), v: A(n * 4),
  g: A(n * 4), ring: A(dly * n * 4), rfc: A(n * 4), scratch: A(n * 4), counts: A(n * 8),
  driven: A(drivenCap * 4), net: A(64) };
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
const STEP_MS = 50;
function burst(group, hz) {
  reset(Date.now() & 0xffff);
  i64.fill(0n, P.counts / 8, P.counts / 8 + n);
  if (group.length && hz > 0) {
    const g = group.length > drivenCap ? group.slice(0, drivenCap) : group;
    i32.set(Int32Array.from(g), P.driven / 4);
    lif_run(P.net, P.driven, g.length, hz, Math.round(STEP_MS / dt), P.scratch, P.counts);
  }
  const rate = (l) => (l.length
    ? (l.reduce((a, i) => a + Number(i64[P.counts / 8 + i]), 0) / l.length) * (1000 / STEP_MS) : 0);
  return { gf: Math.max(rate(iface.commands.DNp01.left), rate(iface.commands.DNp01.right)),
           mn9: rate(iface.readout.MN9),
           steer: ['DNa01', 'DNa02', 'DNa08']
             .reduce((a, ct) => a + (rate(iface.commands[ct].right) - rate(iface.commands[ct].left)), 0) };
}

/* --- 1. The buffer overflow. Driving olfaction used to write 2,249 indices into a
 * 512-slot buffer, straight over the Net struct. The check is not "does smell work" but
 * "does everything that used to work still work afterwards". */
console.log('1. olfactory drive does not corrupt the network');
const before = burst(iface.sensory.sugar, 250);
burst([...iface.sensory.smellL, ...iface.sensory.smellR], 200);
const after = burst(iface.sensory.sugar, 250);
console.log(`   MN9 to sugar: ${before.mn9.toFixed(1)} Hz before, ${after.mn9.toFixed(1)} Hz after`);
assert(before.mn9 > 5, 'sugar did not drive MN9 even before the smell burst');
assert(Math.abs(after.mn9 - before.mn9) < before.mn9 * 0.6 + 8,
  'the network behaves differently after an olfactory burst - memory is still being trampled');

/* --- 2. Fear must outlive a blink. At 60x it decayed 25% per tick, so a startle was gone
 * in about half a real second and no escape was ever visible. */
console.log('\n2. a startle produces a visible escape');
const s = new State();
s.startle(1);
let escapeTicks = 0;
for (let k = 0; k < 800; k++) {         // 800 ticks x 50 ms = 40 real seconds
  s.step(0.05 * 600, { dtReal: 0.05, foodInReach: false });
  if (s.behaviour === 'escape') escapeTicks++;
}
const escSec = (escapeTicks * STEP_MS) / 1000;
console.log(`   escape held for ${escSec.toFixed(1)} real seconds, then released`);
// FEAR_TAU is 12 s, so a full-strength startle keeps the animal above the escape threshold
// for about 14 s. That is the phase-2 model's own behaviour, not a bug, and it matches
// reports of a persistent post-threat arousal state in Drosophila lasting many seconds.
// The first version of this test only watched for 10 s and therefore concluded the animal
// was stuck -- the window was shorter than the thing it was measuring, again.
assert(escSec > 1.5, `escape lasted only ${escSec.toFixed(2)} s - too brief to see`);
assert(escSec < 30, 'escape never released - the animal would be stuck fleeing');

/* --- 3. Hunger must arrive while someone is watching. */
console.log('\n3. hunger reaches the feeding threshold in observable time');
const h = new State();
let t = 0;
while (h.hunger < 0.35 && t < 600) { h.step(0.05 * 600, { dtReal: 0.05, foodInReach: false }); t += 0.05; }
console.log(`   hunger crossed 0.35 after ${t.toFixed(1)} real seconds (energy starts at 0.62)`);
assert(t < 90, `took ${t.toFixed(0)} s of real time to get hungry - nobody waits that long`);

/* --- 4. Hungry + food in reach must actually feed, and the strike must be connectome-driven. */
console.log('\n4. a hungry animal feeds, and MN9 is what drives it');
const f = new State();
f.energy = 0.4;
f.step(1, { dtReal: 0.05, foodInReach: true });
console.log(`   behaviour with food in reach at hunger ${f.hunger.toFixed(2)}: ${f.behaviour}`);
assert(f.behaviour === 'feed', `expected feeding, got ${f.behaviour}`);
const strike = burst(iface.sensory.sugar, f.sugarGain);
console.log(`   sugar gain ${f.sugarGain.toFixed(0)} Hz -> MN9 ${strike.mn9.toFixed(1)} Hz`);
assert(strike.mn9 > 1, 'MN9 silent while feeding - the strike is not connectome-driven');

/* --- 5. Sleep still arrives on its own. */
console.log('\n5. sleep still arrives without any input');
const z = new State();
let tz = 0, slept = false;
while (tz < 900 && !slept) { z.step(0.05 * 600, { dtReal: 0.05, foodInReach: true }); tz += 0.05
  if (z.behaviour === 'sleep') slept = true }
console.log(`   first sleep bout after ${tz.toFixed(0)} real seconds`);
assert(slept, 'never slept');

console.log('\nPHASE 6 BEHAVIOUR GATE PASSED');
