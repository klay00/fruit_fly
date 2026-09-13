/* The mushroom body as a chess evaluator. Shared by the trainer (Node) and the page.
 *
 *   board  -> encode()  -> PN rates            ours, fixed, seeded  (declared engineering)
 *   PN     -> network   -> KC sparse code      the connectome
 *   KC     -> network   -> MBON rates          the connectome
 *   MBON   -> readout   -> value               w: the only thing that learns
 */
import { Chess } from 'chess.js';

const PIECES = 'PNBRQKpnbrqk';
export const N_SQ_FEAT = 64 * 12;
/* Plus 128 threat bits: my piece on square s is attacked / their piece on s is attacked.
 * The fly's eye computes motion before the brain sees it; this is the same kind of
 * peripheral preprocessing. Without it the net learned to grab material and never to
 * keep it: after 270 games vs a one-ply capturer it was still 25 points down at the end,
 * because "my piece is attacked" is a relation between two squares that a projection of
 * piece positions does not carry. Declared as part of the encoder, which is ours. */
export const N_FEAT = N_SQ_FEAT + 128;
export const SIM_MS = 25;

/* Board -> 768 bits, from `color`'s point of view: "my queen on e4" is the same feature
 * whichever colour the fly plays, so it never has to learn chess twice. Defaults to the
 * side to move. */
export function features(chess, color = chess.turn()) {
  const f = new Uint8Array(N_FEAT);
  const white = color === 'w';
  const board = chess.board();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (!p) continue;
    const rr = white ? r : 7 - r;
    const mine = p.color === (white ? 'w' : 'b');
    const t = 'pnbrqk'.indexOf(p.type) + (mine ? 0 : 6);
    f[(rr * 8 + c) * 12 + t] = 1;
    const sqName = 'abcdefgh'[c] + (8 - r);
    const them = white ? 'b' : 'w';
    if (mine && chess.isAttacked(sqName, them)) f[N_SQ_FEAT + rr * 8 + c] = 1;
    if (!mine && chess.isAttacked(sqName, white ? 'w' : 'b')) f[N_SQ_FEAT + 64 + rr * 8 + c] = 1;
  }
  return f;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MushroomBody {
  static async load(fetchBytes, fetchJson) {
    const mb = new MushroomBody();
    mb.iface = await fetchJson('interface.json');
    const bin = await fetchBytes('net.bin');
    try { mb.positions = new Float32Array(await fetchBytes('positions.bin')); } catch { mb.positions = null; }
    const { instance } = await WebAssembly.instantiate(await fetchBytes('lif.wasm'), {});
    mb.mem = instance.exports.memory;
    mb.run = instance.exports.lif_run_rates;
    mb.init(bin);
    return mb;
  }

  init(bin) {
    const { n, nnz, dly, pn } = this.iface;
    const mem = this.mem;
    const need = (n + 1) * 4 + nnz * 8 + n * 8 + dly * n * 4 + n * 4 + n * 4 + n * 8
               + pn.length * 8 + 64 + (1 << 20);
    const grow = Math.ceil(need / 65536) - mem.buffer.byteLength / 65536;
    if (grow > 0) mem.grow(grow);
    let off = 0;
    const A = (b) => { const p = off; off = (off + b + 7) & ~7; return p; };
    const P = this.P = {
      indptr: A((n + 1) * 4), cols: A(nnz * 4), vals: A(nnz * 4), v: A(n * 4), g: A(n * 4),
      ring: A(dly * n * 4), rfc: A(n * 4), scratch: A(n * 4), counts: A(n * 8),
      driven: A(pn.length * 4), rates: A(pn.length * 4), net: A(64),
    };
    this.i32 = new Int32Array(mem.buffer);
    this.f32 = new Float32Array(mem.buffer);
    this.i64 = new BigInt64Array(mem.buffer);
    // block by block: the allocator pads, the file does not (results/phase3)
    this.i32.set(new Int32Array(bin, 0, n + 1), P.indptr / 4);
    this.i32.set(new Int32Array(bin, (n + 1) * 4, nnz), P.cols / 4);
    this.f32.set(new Float32Array(bin, (n + 1 + nnz) * 4, nnz), P.vals / 4);
    this.i32.set(Int32Array.from(pn), P.driven / 4);

    // Encoder -- the fly's "chess sense organ", and ours to declare.
    //
    // A purely random projection failed gate 2: "my queen on a1" and "my queen on h8" got
    // unrelated KC codes, so material -- the same piece anywhere -- needed 768 separate
    // detectors and never generalised. The fly's own glomeruli are tuned to chemical
    // classes, not to individual molecules; this gives each of the 12 piece types a
    // shared PN group that every square of that type projects to (position-invariant,
    // where material lives), plus a sparse random projection per square for position.
    // Seeded, so every run and the page agree.
    const r = mulberry(20240913);
    const TYPE_PNS = 14;
    const typeGroup = [];
    let cursor = 0;
    for (let t = 0; t < 12; t++) { typeGroup.push(Array.from({ length: TYPE_PNS }, (_, i) => cursor + i)); cursor += TYPE_PNS; }
    const threatGroup = [Array.from({ length: TYPE_PNS }, (_, i) => cursor + i),
                         Array.from({ length: TYPE_PNS }, (_, i) => cursor + TYPE_PNS + i)];
    cursor += 2 * TYPE_PNS;
    this.enc = [];
    for (let f = 0; f < N_FEAT; f++) {
      const hits = f < N_SQ_FEAT ? [...typeGroup[f % 12]] : [...threatGroup[f < N_SQ_FEAT + 64 ? 0 : 1]];
      for (let p = cursor; p < pn.length; p++) if (r() < 0.03) hits.push(p);
      this.enc.push(hits);
    }
    this.pnRates = new Float32Array(pn.length);
  }

  reset(seed) {
    const { n, dly, dt, decay_g, decay_v, rfc_steps } = this.iface;
    const { P, i32, f32, i64 } = this;
    f32.fill(-52, P.v / 4, P.v / 4 + n); f32.fill(0, P.g / 4, P.g / 4 + n);
    f32.fill(0, P.ring / 4, P.ring / 4 + dly * n); i32.fill(0, P.rfc / 4, P.rfc / 4 + n);
    i64.fill(0n, P.counts / 8, P.counts / 8 + n);
    const s = P.net / 4;
    i32[s] = n; i32[s + 1] = dly; i32[s + 2] = rfc_steps; i32[s + 3] = 0;
    f32[s + 4] = decay_g; f32[s + 5] = decay_v; f32[s + 6] = dt;
    i32[s + 7] = P.indptr; i32[s + 8] = P.cols; i32[s + 9] = P.vals;
    i32[s + 10] = P.v; i32[s + 11] = P.g; i32[s + 12] = P.ring; i32[s + 13] = P.rfc;
    i64[(P.net + 56) / 8] = BigInt.asIntN(64, BigInt(seed) * 2654435761n + 1n);
  }

  /* Drive the PNs with an encoded board, return spike counts as rates. */
  evaluate(feat, seed = 1) {
    const { pn, kc, mbon, dt } = this.iface;
    const rates = this.pnRates; rates.fill(0);
    // Type-group PNs accumulate with piece count (eight pawns drive theirs harder than
    // one); square PNs are hit once. Both saturate, as a glomerulus does.
    for (let f = 0; f < N_FEAT; f++) if (feat[f]) for (const p of this.enc[f]) rates[p] += 45;
    for (let p = 0; p < pn.length; p++) rates[p] = Math.min(220, rates[p]);
    this.reset(seed);
    this.f32.set(rates, this.P.rates / 4);
    this.run(this.P.net, this.P.driven, this.P.rates, pn.length,
             Math.round(SIM_MS / dt), this.P.scratch, this.P.counts);
    const c = this.P.counts / 8, k = 1000 / SIM_MS;
    // KC activity normalised to [0,1]: Kenyon cells are near-binary in the learning
    // literature, and raw Hz into the readout made the update diverge to NaN.
    const kcRate = new Float32Array(kc.length);
    let active = 0;
    for (let i = 0; i < kc.length; i++) {
      const v = Number(this.i64[c + kc[i]]);
      kcRate[i] = Math.min(1, (v * k) / 160); if (v) active++;
    }
    const mbonRate = new Float32Array(mbon.length);
    for (let i = 0; i < mbon.length; i++) mbonRate[i] = Number(this.i64[c + mbon[i]]) * k;
    return { kcRate, mbonRate, pnRate: Float32Array.from(rates), kcActive: active / kc.length };
  }
}

/* The learned KC->MBON synapses. In the fly, dopamine depresses the synapse from an
 * active KC onto an MBON in proportion to the reward-prediction error (Hige 2015); here
 * that is one line: Δw = η · error · kc. The value is the "MBON" this trained synapse set
 * drives. Reading out over KCs rather than the 96 anatomical MBONs is the more faithful
 * choice, not the less: the weights ARE the plastic site. */
export class Readout {
  constructor(n) { this.w = new Float32Array(n); this.b = 0; }
  value(kc) { let v = this.b; for (let i = 0; i < kc.length; i++) if (kc[i]) v += this.w[i] * kc[i]; return v; }
  update(kc, err, eta) { for (let i = 0; i < kc.length; i++) if (kc[i]) this.w[i] += eta * err * kc[i]; this.b += eta * err; }
  toJSON() { return { w: Array.from(this.w), b: this.b }; }
  static from(j) { const r = new Readout(j.w.length); r.w.set(j.w); r.b = j.b; return r; }
}

export { Chess };
