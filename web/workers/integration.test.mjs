/* Phase 4 gate: drive the exported browser brain the way the scene does, and check the
 * behaviours the gate names actually emerge -- feeding, escape, lateralised steering, and
 * an autonomous rest/activity cycle. Runs the same wasm and the same net.bin the page
 * fetches, so a pass here is a statement about what ships, not about a Python model. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { State } from './state.js';

const base = new URL('../public/brain/', import.meta.url).pathname;
const iface = JSON.parse(readFileSync(base + 'interface.json', 'utf8'));
const binBuf = readFileSync(base + 'net.bin');
const bin = binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.byteLength);
const { instance } = await WebAssembly.instantiate(readFileSync(base + 'lif.wasm'), {});
const mem = instance.exports.memory, lif_run = instance.exports.lif_run;

const { n, nnz, dly, dt, decay_g, decay_v, rfc_steps } = iface;
const need = (n + 1) * 4 + nnz * 8 + n * 8 + dly * n * 4 + n * 4 + n * 4 + n * 8 + 4096 + (1 << 20);
mem.grow(Math.max(0, Math.ceil(need / 65536) - mem.buffer.byteLength / 65536));
const c = { off: 0 };
const A = (b) => { const p = c.off; c.off = (c.off + b + 7) & ~7; return p; };
const P = { indptr: A((n + 1) * 4), cols: A(nnz * 4), vals: A(nnz * 4), v: A(n * 4),
  g: A(n * 4), ring: A(dly * n * 4), rfc: A(n * 4), scratch: A(n * 4), counts: A(n * 8),
  driven: A(4096), net: A(64) };
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
function run(group, hz, ms, seed = 3) {
  reset(seed); i64.fill(0n, P.counts / 8, P.counts / 8 + n);
  i32.set(Int32Array.from(group), P.driven / 4);
  lif_run(P.net, P.driven, group.length, hz, Math.round(ms / dt), P.scratch, P.counts);
  // Snapshot, do not alias. Returning a closure over the shared counts buffer means the
  // next run silently overwrites every earlier "measurement" -- they all end up reporting
  // whatever the last call left behind, which reads as a real result.
  const snap = new Float64Array(n);
  for (let i = 0; i < n; i++) snap[i] = Number(i64[P.counts / 8 + i]) * (1000 / ms);
  return (list) => list.length
    ? list.reduce((a, i) => a + snap[i], 0) / list.length
    : 0;
}

console.log(`brain: ${n.toLocaleString()} neurons, ${nnz.toLocaleString()} synapses\n`);

// --- 1. feeding: sugar drives MN9, monotonically, with the measured 37 Hz threshold
console.log('sugar drive -> MN9:');
let prev = -1, mn9At = {};
for (const hz of [28, 37, 50, 100, 250]) {
  const r = run(iface.sensory.sugar, hz, 400);
  const v = r(iface.readout.MN9);
  mn9At[hz] = v;
  console.log(`  ${String(hz).padStart(4)} Hz -> ${v.toFixed(1).padStart(6)} Hz`);
  assert(v >= prev - 2, `MN9 not monotonic at ${hz} Hz`);
  prev = v;
}
assert(mn9At[28] < 1, 'a sated fly should not extend its proboscis');
assert(mn9At[250] > 40, 'a starving fly should feed');

// --- 2. escape: looming drives the Giant Fiber
const dnRate = (r, ct) => Math.max(r(iface.commands[ct].left), r(iface.commands[ct].right));
const both = [...iface.sensory.loomL, ...iface.sensory.loomR];
const rBoth = run(both, 200, 400);
const rQuiet = run(iface.sensory.sugar, 0, 400);
console.log(`\nlooming both eyes -> DNp01 ${dnRate(rBoth, 'DNp01').toFixed(0)} Hz` +
            `  (at rest ${dnRate(rQuiet, 'DNp01').toFixed(0)} Hz)`);
assert(dnRate(rBoth, 'DNp01') > 50, 'looming did not drive the Giant Fiber');
assert(dnRate(rQuiet, 'DNp01') < 5, 'escape DNs fire without a stimulus');

// --- 3. steering is lateralised, and symmetric threat produces no turn
const steerOf = (r) => ['DNa01', 'DNa02', 'DNa08']
  .reduce((a, ct) => a + (r(iface.commands[ct].right) - r(iface.commands[ct].left)), 0);
const rLeft = run(iface.sensory.loomL, 200, 400);
const rRight = run(iface.sensory.loomR, 200, 400);
console.log(`steering signal  left-eye ${steerOf(rLeft).toFixed(0)}` +
            `  right-eye ${steerOf(rRight).toFixed(0)}  both ${steerOf(rBoth).toFixed(0)}`);
assert(Math.abs(steerOf(rLeft)) > 10, 'one-sided threat produced no turn signal');
assert(steerOf(rLeft) * steerOf(rRight) < 0, 'both eyes turn the fly the same way');
assert(Math.abs(steerOf(rBoth)) < Math.abs(steerOf(rLeft)) / 2,
  'a symmetric threat should not steer');

// --- 4. the loop is autonomous: a rest/activity cycle with no external input
const s = new State(); const budget = {}; let bouts = 0;
for (let k = 0; k < 48 * 3600; k++) {
  const p = s.behaviour;
  s.step(1, { foodInReach: true });
  budget[s.behaviour] = (budget[s.behaviour] ?? 0) + 1;
  if (s.behaviour !== p && s.behaviour === 'sleep') bouts++;
}
const hrs = Object.fromEntries(Object.entries(budget)
  .map(([k, v]) => [k, +((v / (48 * 3600)) * 24).toFixed(2)]));
console.log('\nautonomous 48 h budget (h/day):', hrs, `sleep bouts ${bouts}`);
assert(bouts >= 2, 'no recurring sleep');
assert(hrs.sleep > 5 && hrs.sleep < 14, 'sleep budget is not fly-like');

console.log('\nPHASE 4 GATE PASSED: feeding, escape, lateralised steering, autonomous cycling.');
