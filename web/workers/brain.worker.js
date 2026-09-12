/* The brain, off the main thread.
 *
 * Runs engine/lif.c compiled to wasm over the connectome corridor exported by
 * pipeline/export_web.py, gated by the internal-state layer. Posts a descending-neuron
 * vector to the main thread; receives sensory drive back. That vector is the entire
 * interface to the body (RESEARCH.md §1) -- Phase 5 replaces the body and nothing here.
 */
import { State } from './state.js';

let mem, lif_run, iface, ptr, i32, f32, i64, drivenCap = 0;
let state = new State();
let world = { sugarNear: 0, loomL: 0, loomR: 0, smell: 0 };
let running = false;
let clockScale = 600;         // simulated seconds of fly life per wall second

const STEP_MS = 50;           // biological time advanced per brain tick

function alloc(bytes, cursor) {
  const p = cursor.off;
  cursor.off = (cursor.off + bytes + 7) & ~7;
  return p;
}

async function boot(base) {
  const [metaRes, binRes, wasmRes] = await Promise.all([
    fetch(base + 'interface.json'),
    fetch(base + 'net.bin'),
    fetch(base + 'lif.wasm'),
  ]);
  iface = await metaRes.json();
  const bin = await binRes.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(await wasmRes.arrayBuffer(), {});
  mem = instance.exports.memory;
  lif_run = instance.exports.lif_run;

  const { n, nnz, dly } = iface;
  const maxDriven = Math.max(...Object.values(iface.sensory).map((g) => g.length));
  const need = (n + 1) * 4 + nnz * 8 + n * 8 + dly * n * 4 + n * 4 + n * 4 + n * 8
             + maxDriven * 8 + 8192 + (1 << 20);
  const grow = Math.ceil(need / 65536) - mem.buffer.byteLength / 65536;
  if (grow > 0) mem.grow(grow);

  const c = { off: 0 };
  ptr = {
    indptr: alloc((n + 1) * 4, c), cols: alloc(nnz * 4, c), vals: alloc(nnz * 4, c),
    v: alloc(n * 4, c), g: alloc(n * 4, c), ring: alloc(dly * n * 4, c),
    rfc: alloc(n * 4, c), scratch: alloc(n * 4, c), counts: alloc(n * 8, c),
    // Sized from the actual sensory groups, plus room for any two combined. A fixed 2048
    // bytes held 512 indices while the two olfactory groups together need 2,249 -- the
    // write ran straight over the Net struct that follows, corrupting the network's own
    // pointers. It did not crash; it quietly produced a brain that could not respond.
    driven: alloc(Math.max(64, maxDriven * 2) * 4, c), net: alloc(64, c),
  };
  drivenCap = Math.max(64, maxDriven * 2);
  i32 = new Int32Array(mem.buffer);
  f32 = new Float32Array(mem.buffer);
  i64 = new BigInt64Array(mem.buffer);

  // Written block by block: the allocator pads to 8 bytes, so the three arrays are NOT
  // contiguous in wasm memory even though they are contiguous in the file. Copying them
  // as one run shifts every synaptic target by one neuron -- the network then runs at
  // full speed on rewired nonsense, which looks exactly like working.
  i32.set(new Int32Array(bin, 0, n + 1), ptr.indptr / 4);
  i32.set(new Int32Array(bin, (n + 1) * 4, nnz), ptr.cols / 4);
  f32.set(new Float32Array(bin, (n + 1 + nnz) * 4, nnz), ptr.vals / 4);

  resetNet(1);
  postMessage({ type: 'ready', iface: summarise() });
}

function summarise() {
  return {
    n: iface.n, nnz: iface.nnz,
    commands: Object.fromEntries(Object.entries(iface.commands)
      .map(([k, d]) => [k, { role: d.role, note: d.note }])),
    provenance: iface.provenance,
  };
}

function resetNet(seed) {
  const { n, dly, dt, decay_g, decay_v, rfc_steps } = iface;
  f32.fill(-52, ptr.v / 4, ptr.v / 4 + n);
  f32.fill(0, ptr.g / 4, ptr.g / 4 + n);
  f32.fill(0, ptr.ring / 4, ptr.ring / 4 + dly * n);
  i32.fill(0, ptr.rfc / 4, ptr.rfc / 4 + n);
  const s = ptr.net / 4;
  i32[s] = n; i32[s + 1] = dly; i32[s + 2] = rfc_steps; i32[s + 3] = 0;
  f32[s + 4] = decay_g; f32[s + 5] = decay_v; f32[s + 6] = dt;
  i32[s + 7] = ptr.indptr; i32[s + 8] = ptr.cols; i32[s + 9] = ptr.vals;
  i32[s + 10] = ptr.v; i32[s + 11] = ptr.g; i32[s + 12] = ptr.ring; i32[s + 13] = ptr.rfc;
  i64[(ptr.net + 56) / 8] = BigInt.asIntN(64, BigInt(seed) * 2654435761n + 1n);
}

/* One burst of sensory drive through the network, returning per-neuron spike counts. */
function drive(group, rateHz, ms) {
  const { n, dt } = iface;
  i64.fill(0n, ptr.counts / 8, ptr.counts / 8 + n);
  if (rateHz <= 0 || !group.length) return 0;
  if (group.length > drivenCap) group = group.slice(0, drivenCap);   // never overrun
  i32.set(Int32Array.from(group), ptr.driven / 4);
  lif_run(ptr.net, ptr.driven, group.length, rateHz, Math.round(ms / dt),
          ptr.scratch, ptr.counts);
  return ms;
}

function rateOf(list, ms) {
  if (!list || !list.length) return 0;
  let c = 0;
  for (const i of list) c += Number(i64[ptr.counts / 8 + i]);
  return (c / list.length) * (1000 / ms);
}

/* Read the descending vector: mean firing rate per command DN, per hemisphere. */
function readDNs(ms) {
  const out = {};
  for (const [ct, d] of Object.entries(iface.commands)) {
    out[ct] = { role: d.role, L: rateOf(d.left, ms), R: rateOf(d.right, ms) };
  }
  out.MN9 = { role: 'feed', L: rateOf(iface.readout.MN9, ms), R: 0 };
  return out;
}

function tick() {
  if (!running) return;

  // --- sensory drive. Which pathway runs is set by what the world presents; the gain on
  // the sugar channel is set by hunger (NPF/AKH), which is the only knob the state layer
  // has on the network.
  const threat = Math.max(world.loomL, world.loomR);
  let dn, channel = 'rest';
  if (threat > 0.02) {
    channel = 'loom';
    const eye = [];
    if (world.loomL > 0.02) eye.push(...iface.sensory.loomL);
    if (world.loomR > 0.02) eye.push(...iface.sensory.loomR);
    resetNet(Date.now() & 0xffff);
    drive(eye, 60 + 200 * threat, STEP_MS);
    dn = readDNs(STEP_MS);
  } else if (world.smell > 0.04 && world.sugarNear <= 0.5) {
    channel = 'smell';
    // Odour: drives the steering DNs and produces casting. It does not lateralise --
    // measured, see results/phase6 -- so both nostrils get the same drive.
    resetNet(Date.now() & 0xffff);
    drive([...iface.sensory.smellL, ...iface.sensory.smellR], 40 + 180 * world.smell, STEP_MS);
    dn = readDNs(STEP_MS);
  } else if (world.sugarNear > 0.5) {
    channel = 'taste';
    resetNet(Date.now() & 0xffff);
    drive(iface.sensory.sugar, state.sugarGain, STEP_MS);
    dn = readDNs(STEP_MS);
  } else {
    i64.fill(0n, ptr.counts / 8, ptr.counts / 8 + iface.n);
    dn = readDNs(STEP_MS);
  }

  // The Giant Fiber is a reflex: it startles the animal rather than asking permission.
  const gf = dn.DNp01 ? Math.max(dn.DNp01.L, dn.DNp01.R) : 0;
  if (gf > 50) state.startle(Math.min(1, gf / 150));

  // Two clocks, for the same reason the whole architecture has two tiers. Metabolism and
  // sleep pressure run over hours and have to be time-lapsed to be watchable; fear decays
  // over ~12 s, which is already the scale you are watching at. Running both at 60x made
  // a startle vanish in half a real second, so the animal never visibly fled -- and made
  // hunger take four real minutes to arrive, so it never visibly hunted either.
  const dtReal = STEP_MS / 1000;
  const dtBio = dtReal * clockScale;
  state.step(dtBio, {
    dtReal,
    foodInReach: world.sugarNear > 0.5,
    motor: state.behaviour === 'escape' ? 1 : 0.25,
  });

  postMessage({
    type: 'dn',
    dn,
    /* Which sensory channel produced this vector. The DN rates alone cannot say whether
     * their left/right asymmetry encodes a direction: measured, looming's does and
     * olfaction's does not. That is knowledge about the stimulus, so it travels with the
     * stimulus rather than being guessed at downstream from the numbers. */
    channel,
    state: {
      behaviour: state.behaviour, energy: state.energy, hunger: state.hunger,
      sleepPressure: state.sleepPressure, fear: state.fear,
      sugarGain: state.sugarGain, canFeed: state.canFeed,
      clockHours: state.clock / 3600, night: state.night,
    },
  });
  setTimeout(tick, STEP_MS);
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'boot') boot(m.base);
  else if (m.type === 'world') world = { ...world, ...m.world };
  else if (m.type === 'run') { if (!running) { running = true; tick(); } }
  else if (m.type === 'pause') running = false;
  else if (m.type === 'clock') clockScale = m.value;
  else if (m.type === 'reset') { state = new State(); resetNet(1); }
  /* Poke the internal state directly. This changes the neuromodulator variables -- the
   * same ones hunger and fatigue move on their own -- and nothing else. The connectome,
   * the weights and the thresholds are untouched, so what you see is still the network
   * responding, just to a state you chose instead of one it reached. */
  else if (m.type === 'poke') {
    if (m.energy !== undefined) state.energy = Math.max(0, Math.min(1, m.energy));
    if (m.sleepPressure !== undefined) state.sleepPressure = Math.max(0, Math.min(1, m.sleepPressure));
    if (m.clockHours !== undefined) state.clock = m.clockHours * 3600;
    if (m.startle) state.startle(m.startle);
  }
};
