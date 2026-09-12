/* Phase 5: the body swap, and the pre-registered prediction.
 *
 * Constitution IV, standing prediction v1.0:
 *   "the Giant Fiber escape threshold (~40 deg visual angle) is tuned to fly body dynamics;
 *    in a dragon body, escape success will measurably degrade."
 *
 * Registered before this file was written. Nothing below was tuned against it.
 *
 * The mechanism under test is the square-cube law, not a free parameter. For geometrically
 * similar animals muscle force goes with cross-section and mass with volume, so available
 * acceleration falls as 1/S and the time to displace one body length grows as S. Under
 * Froude scaling the time available before contact grows only as sqrt(S). Escape time
 * outruns available time. The fly's threshold buys it margin; the dragon's it does not.
 *
 * The brain is byte-identical between conditions -- same wasm, same net.bin, same
 * thresholds in drive(). Only the morphology constants differ.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { drive, FLY, DRAGON } from '../app/composables/useBody.js';

const base = new URL('../public/brain/', import.meta.url).pathname;
const iface = JSON.parse(readFileSync(base + 'interface.json', 'utf8'));
const netBytes = readFileSync(base + 'net.bin');
const wasmBytes = readFileSync(base + 'lif.wasm');
const bin = netBytes.buffer.slice(netBytes.byteOffset, netBytes.byteOffset + netBytes.byteLength);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
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

/* Run one 20 ms slice of brain time at the given looming drive, return the DN vector.
 * Snapshotted, never aliased: a closure over the shared counts buffer reports whatever the
 * last call left behind (the bug that failed the phase 4 gate on its first run). */
/* Two different clocks, deliberately.
 *
 * SLICE_MS is how long a stimulus is held while the network integrates -- it has to be
 * long enough for a 200 Hz neuron to actually emit spikes. GEOM_MS is how finely the
 * encounter geometry advances. They were the same 20 ms at first, and that was wrong: the
 * fly's entire escape window, from the 40-degree threshold to contact, is 12.8 ms. One
 * slice stepped straight over the decision, so no gain existed that fired at 40 degrees --
 * the circuit either fired far too early or never. A simulation coarser than the event it
 * measures does not measure it.
 *
 * Each geometry step re-runs the network from rest on the current stimulus: a quasi-static
 * reading of "held at this looming strength, what does the brain command?". It discards
 * within-encounter neural history, which is a real simplification and is listed as such. */
const SLICE_MS = 10;
const GEOM_MS = 1;
function brainSlice(loomL, loomR, seed, driveHz) {
  const group = [];
  if (loomL > 0.02) group.push(...iface.sensory.loomL);
  if (loomR > 0.02) group.push(...iface.sensory.loomR);
  reset(seed);
  i64.fill(0n, P.counts / 8, P.counts / 8 + n);
  const strength = Math.max(loomL, loomR);
  if (group.length && strength > 0.02) {
    i32.set(Int32Array.from(group), P.driven / 4);
    lif_run(P.net, P.driven, group.length, driveHz,
            Math.round(SLICE_MS / dt), P.scratch, P.counts);
  }
  const hz = (list) => list.length
    ? (list.reduce((a, i) => a + Number(i64[P.counts / 8 + i]), 0) / list.length) * (1000 / SLICE_MS)
    : 0;
  const dn = {};
  for (const [ct, d] of Object.entries(iface.commands)) {
    dn[ct] = { role: d.role, L: hz(d.left), R: hz(d.right) };
  }
  dn.MN9 = { role: 'feed', L: hz(iface.readout.MN9), R: 0 };
  return dn;
}

/* --- the stimulus, and why it must be calibrated -------------------------------------
 *
 * The connectome gives us LC4/LPLC2 -> Giant Fiber. It does not give us how many Hz a
 * looming object of a given angular size drives those cells at. That mapping is ours, and
 * whatever we pick IS the threshold: an over-strong mapping fires the GF at 4 degrees and
 * the experiment then measures our formula rather than the circuit.
 *
 * So it is calibrated once, against the published value -- the short-mode escape triggers
 * when the expanding stimulus reaches about 40 degrees on the eye (Ache/Card et al.,
 * Curr Biol 2019) -- in the FLY, and then frozen. The dragon inherits the fly's calibration
 * unchanged. That is precisely the pre-registered claim: a fly-tuned threshold in a body
 * that is not a fly's.
 */
const TARGET_FIRE_DEG = 40;
let LOOM_GAIN = 1.0;   // set by calibrate(), then fixed for both conditions

function loomDrive(angleRad, growthRadPerS) {
  // LC4 encodes expansion velocity, LPLC2 angular size; the GF sums a linear function of
  // the former with a saturating function of the latter.
  const size = Math.min(1, angleRad / (Math.PI / 2));
  const vel = Math.min(1, growthRadPerS / 6);
  return LOOM_GAIN * 120 * (0.55 * size + 0.45 * vel);
}

/* One predation encounter, in the animal's own scale.
 *
 * Both conditions face a predator scaled to their body (a fly's predator is damselfly-sized,
 * a dragon's is dragon-sized) approaching under Froude scaling, so the retinal stimulus --
 * the only thing the brain can see -- follows the same angular time-course in both. The
 * sole difference is what the body can do about it. */
function encounter(morph, seed, forceFireDeg = null) {
  const S = morph.bodyLength / FLY.bodyLength;
  const predRadius = morph.bodyLength * 1.4;
  const approach = 0.9 * Math.sqrt(S);          // m/s, Froude-scaled
  const start = predRadius * 90;                // far enough that the angle starts small
  const strikeRadius = predRadius + morph.bodyLength * 0.5;
  const clearance = morph.bodyLength * 0.5;     // lateral displacement needed to survive

  let dist = start, lateral = 0, vLat = 0, t = 0;
  let fired = null, fireAngle = null, prevAngle = 2 * Math.atan(predRadius / start);
  const step = GEOM_MS / 1000;

  while (dist > -start) {
    const sep = Math.hypot(dist, lateral);
    if (dist <= strikeRadius && lateral < clearance) {
      return { escaped: false, fired, fireAngle, lateral };
    }
    if (dist <= 0) return { escaped: true, fired, fireAngle, lateral };

    const angle = 2 * Math.atan(predRadius / Math.max(sep, 1e-6));
    const growth = Math.max(0, (angle - prevAngle) / step);
    prevAngle = angle;

    const hz = loomDrive(angle, growth);
    const strength = Math.min(1, hz / 260);
    const dn = brainSlice(strength, strength * 0.15, seed + Math.round(t * 1000), hz);
    const cmd = drive(dn, morph);

    // forceFireDeg overrides the circuit and fires at a stipulated angular size. It is a
    // control, not a model: it answers "if the brain had fired at exactly the fly's
    // threshold, could this body still have got out of the way?"
    const trigger = forceFireDeg === null
      ? cmd.escape > 0.4
      : angle * 180 / Math.PI >= forceFireDeg;
    if (trigger && fired === null) { fired = t; fireAngle = angle; }
    if (fired !== null) {
      const effort = forceFireDeg === null ? cmd.escape : 1;
      vLat += effort * morph.escapeAccel * step;
      lateral += vLat * step;
    }
    dist -= approach * step;
    t += step;
  }
  return { escaped: true, fired, fireAngle, lateral };
}

function trial(morph, n = 16, forceFireDeg = null) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(encounter(morph, 101 + i * 37, forceFireDeg));
  const fired = out.filter((r) => r.fired !== null);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  return {
    success: out.filter((r) => r.escaped).length / out.length,
    angleDeg: mean(fired.map((r) => r.fireAngle * 180 / Math.PI)),
    firedFrac: fired.length / out.length,
    clearedBody: mean(out.map((r) => r.lateral / morph.bodyLength)),
  };
}

/* Bisect LOOM_GAIN until the fly's Giant Fiber fires at the published angular size. */
function calibrate() {
  // Higher gain fires the circuit EARLIER, so at a SMALLER angular size. The search is
  // therefore inverted relative to the obvious reading: firing too small means too much
  // gain, not too little.
  let lo = 0.0005, hi = 8.0;
  for (let i = 0; i < 26; i++) {
    LOOM_GAIN = (lo + hi) / 2;
    const r = trial(FLY, 5);
    if (!Number.isFinite(r.angleDeg)) { lo = LOOM_GAIN; continue; }  // never fired: raise
    if (r.angleDeg < TARGET_FIRE_DEG) hi = LOOM_GAIN; else lo = LOOM_GAIN;
  }
  LOOM_GAIN = (lo + hi) / 2;
  return trial(FLY, 8).angleDeg;
}

// --- Principle III: prove the brain is unchanged before claiming anything about the body.
const brainHash = createHash('sha256').update(netBytes).digest('hex').slice(0, 16);
const wasmHash = createHash('sha256').update(wasmBytes).digest('hex').slice(0, 16);
console.log('brain identity (shared by both conditions)');
console.log(`  net.bin  sha256 ${brainHash}   ${n.toLocaleString()} neurons, ${nnz.toLocaleString()} synapses`);
console.log(`  lif.wasm sha256 ${wasmHash}`);
console.log(`  drive() thresholds: shared, one implementation\n`);

console.log('morphology (the only thing that differs)');
for (const m of [FLY, DRAGON]) {
  console.log(`  ${m.label.padEnd(36)} L=${String(m.bodyLength).padStart(6)} m  ` +
    `a_escape=${m.escapeAccel.toFixed(2).padStart(6)} m/s^2  feed -> ${m.effectors.feed}`);
}

console.log('\n--- calibration: fly Giant Fiber fires at the published angular size ---');
const calDeg = calibrate();
console.log(`  LOOM_GAIN = ${LOOM_GAIN.toFixed(3)}  ->  fly fires at ${calDeg.toFixed(1)} deg ` +
            `(target ${TARGET_FIRE_DEG} deg, Ache/Card et al. 2019)`);
assert(Math.abs(calDeg - TARGET_FIRE_DEG) < 8,
  `calibration failed: fly fires at ${calDeg.toFixed(1)} deg, not ~${TARGET_FIRE_DEG}`);

console.log('\n--- pre-registered test: escape under matched, body-scaled predation ---');
console.log('  the dragon inherits the fly calibration unchanged\n');
const fly = trial(FLY);
const dragon = trial(DRAGON);
const dragonTimed = trial(DRAGON, 16, fly.angleDeg);

console.log(`${'condition'.padEnd(34)} ${'escape'.padStart(8)} ${'fires at'.padStart(10)} ` +
            `${'cleared'.padStart(11)} ${'needed'.padStart(8)}`);
for (const [label, r, m] of [
  ['fly body (control)', fly, FLY],
  ['dragon body', dragon, DRAGON],
  ['dragon, fired at the fly angle', dragonTimed, DRAGON],
]) {
  console.log(`${label.padEnd(34)} ${(r.success * 100).toFixed(0).padStart(7)}% ` +
    `${r.angleDeg.toFixed(1).padStart(9)}d ${r.clearedBody.toFixed(3).padStart(8)} BL ` +
    `${(0.5).toFixed(2).padStart(7)} BL`);
}

const drop = fly.success - dragon.success;
console.log(`\nescape success drop: ${(drop * 100).toFixed(0)} percentage points`);

/* Two mechanisms, not one. The prediction named the second; the first was not anticipated
 * and is reported because it changes what the result means. */
console.log('\nmechanism 1 - the circuit fires late (unanticipated)');
console.log(`  Under Froude scaling the dragon's threat expands far more slowly at a given`);
console.log(`  angular size, so the velocity-sensitive LC4 pathway contributes less and the`);
console.log(`  Giant Fiber holds off until ${dragon.angleDeg.toFixed(1)} deg instead of ` +
            `${fly.angleDeg.toFixed(1)} deg.`);
console.log('\nmechanism 2 - the body cannot act in time (the pre-registered claim)');
console.log(`  Forced to fire at the fly's own ${fly.angleDeg.toFixed(1)} deg threshold, the`);
console.log(`  dragon still clears only ${dragonTimed.clearedBody.toFixed(3)} body lengths of ` +
            `the 0.50 it needs`);
console.log(`  and escapes ${(dragonTimed.success * 100).toFixed(0)}% of encounters. ` +
            `Perfect timing does not rescue it.`);

assert(fly.success > 0.6, `control failed: the fly should mostly escape, got ${fly.success}`);
if (dragon.success < fly.success - 0.15) {
  console.log('\nPREDICTION HELD: the fly-tuned escape threshold degrades in a dragon body.');
  console.log('Reported with the caveat that two mechanisms contribute, one of them unforeseen.');
} else {
  console.log('\nPREDICTION REFUTED. Recorded as-is (Constitution IV); do not retune to rescue it.');
}
assert(dragonTimed.clearedBody < 0.5,
  'the timing control escaped, so the body is not the limiting term - rewrite the claim');
