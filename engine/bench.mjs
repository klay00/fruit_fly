/* Benchmark and verify the WASM engine against the C/Python reference numbers.
 * Loads the corridor exported by engine/export_wasm.py. */
import { readFileSync } from 'node:fs';

const dir = new URL('.', import.meta.url).pathname;
const meta = JSON.parse(readFileSync(dir + '../data/raw/subsets/wasm_meta.json', 'utf8'));
const bin = readFileSync(dir + '../data/raw/subsets/wasm_net.bin');
const wasm = await WebAssembly.instantiate(readFileSync(dir + 'lif.wasm'), {});
const { memory, lif_run } = wasm.instance.exports;

const { n, nnz, dly, rfc_steps, decay_g, decay_v, dt, driven } = meta;
// Layout: indptr(i32 n+1) cols(i32 nnz) vals(f32 nnz) v(f32 n) g(f32 n) ring(f32 dly*n)
//         rfc(i32 n) scratch(i32 n) counts(i64 n) driven(i32 d) Net struct
const need = (n + 1) * 4 + nnz * 8 + n * 8 + dly * n * 4 + n * 4 + n * 4 + n * 8
           + driven.length * 4 + 64 + (1 << 20);
const pages = Math.ceil(need / 65536) - memory.buffer.byteLength / 65536;
if (pages > 0) memory.grow(pages);

let off = 0;
const take = (bytes) => { const p = off; off += bytes; off = (off + 7) & ~7; return p; };
const pIndptr = take((n + 1) * 4), pCols = take(nnz * 4), pVals = take(nnz * 4);
const pV = take(n * 4), pG = take(n * 4), pRing = take(dly * n * 4);
const pRfc = take(n * 4), pScratch = take(n * 4), pCounts = take(n * 8);
const pDriven = take(driven.length * 4), pNet = take(64);

const buf = memory.buffer;
const i32 = new Int32Array(buf), f32 = new Float32Array(buf), i64 = new BigInt64Array(buf);
// The file packs indptr, then cols (both i32), then vals (f32). Each destination is
// written separately: the allocator pads to 8-byte alignment, so the three blocks are NOT
// contiguous in wasm memory even though they are contiguous in the file. Writing them as
// one run silently shifts every synaptic target by one element.
const src = new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength).slice().buffer;
i32.set(new Int32Array(src, 0, n + 1), pIndptr / 4);
i32.set(new Int32Array(src, (n + 1) * 4, nnz), pCols / 4);
f32.set(new Float32Array(src, (n + 1 + nnz) * 4, nnz), pVals / 4);
i32.set(Int32Array.from(driven), pDriven / 4);

function reset(seed) {
  f32.fill(-52, pV / 4, pV / 4 + n);
  f32.fill(0, pG / 4, pG / 4 + n);
  f32.fill(0, pRing / 4, pRing / 4 + dly * n);
  i32.fill(0, pRfc / 4, pRfc / 4 + n);
  i64.fill(0n, pCounts / 8, pCounts / 8 + n);
  const s = pNet / 4;
  i32[s] = n; i32[s + 1] = dly; i32[s + 2] = rfc_steps; i32[s + 3] = 0;
  f32[s + 4] = decay_g; f32[s + 5] = decay_v; f32[s + 6] = dt;
  i32[s + 7] = pIndptr; i32[s + 8] = pCols; i32[s + 9] = pVals;
  i32[s + 10] = pV; i32[s + 11] = pG; i32[s + 12] = pRing; i32[s + 13] = pRfc;
  i64[(pNet + 56) / 8] = BigInt.asIntN(64, BigInt(seed) * 2654435761n + 1n);
}

const steps = Math.round(1000 / dt);
reset(1);
lif_run(pNet, pDriven, driven.length, 150.0, Math.round(100 / dt), pScratch, pCounts); // warm

const seeds = meta.seeds ?? [1];
for (const rate of meta.rates) {
  let acc = 0, trials = meta.trials;
  const t0 = performance.now();
  let total = 0, activeAll = 0, activeDn = 0, dnSpikes = 0;
  for (let t = 0; t < trials; t++) {
    reset(1 + t);
    lif_run(pNet, pDriven, driven.length, rate, steps, pScratch, pCounts);
    if (meta.readout !== undefined) acc += Number(i64[pCounts / 8 + meta.readout]);
    if (t === trials - 1) {
      for (let i = 0; i < n; i++) {
        const c = Number(i64[pCounts / 8 + i]);
        total += c; if (c > 0) activeAll++;
      }
      for (const d of (meta.dn ?? [])) {
        const c = Number(i64[pCounts / 8 + d]);
        dnSpikes += c; if (c > 0) activeDn++;
      }
    }
  }
  const el = (performance.now() - t0) / 1000;
  const tail = meta.dn
    ? `DNs firing ${String(activeDn).padStart(4)}/${meta.dn.length}  DN spikes ${String(dnSpikes).padStart(6)}`
    : `readout ${(acc / trials).toFixed(2).padStart(7)} Hz`;
  console.log(`  drive ${String(rate).padStart(4)} Hz  ${tail}  active ${String(activeAll).padStart(6)}`
    + `   ${(el / trials).toFixed(3)} s/s -> ${(1 / (el / trials)).toFixed(2)}x real time`);
}
