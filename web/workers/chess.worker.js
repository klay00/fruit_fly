/* The fly, off the main thread. Loads the same brain and weights the trainer produced. */
import { MushroomBody, Readout, Chess } from '../brain/mb.mjs';
import { think } from '../brain/player.mjs';

let mb, ro, seed = 1;

onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'boot') {
    const bytes = async (f) => (await fetch(m.base + f)).arrayBuffer();
    const json = async (f) => (await fetch(m.base + f)).json();
    mb = await MushroomBody.load(bytes, json);
    try { ro = Readout.from(await json('weights.json?t=' + Date.now())); }
    catch { ro = new Readout(mb.iface.kc.length); }
    let training = [];
    try { training = await json('training.json?t=' + Date.now()); } catch {}
    postMessage({ type: 'ready', n: mb.iface.n, nnz: mb.iface.nnz, kc: mb.iface.kc.length,
                  pn: mb.iface.pn.length, mbon: mb.iface.mbon.length,
                  games: training.length, provenance: mb.iface.provenance,
                  trained: !!training.length });
  } else if (m.type === 'think') {
    const g = new Chess(m.fen);
    const t0 = performance.now();
    const cands = think(mb, ro, g, m.color, seed++);
    // ship the candidate list without 5k-float KC vectors each; keep the chosen one's
    const chosen = cands[0];
    postMessage({
      type: 'moves',
      ms: performance.now() - t0,
      chosen: chosen ? { san: chosen.san, from: chosen.from, to: chosen.to } : null,
      cands: cands.map((c) => ({ san: c.san, from: c.from, to: c.to, value: c.value,
                                 net: c.net, terminal: c.terminal, capture: c.capture,
                                 kcActive: c.kcActive })),
      kc: chosen ? Array.from(chosen.kcRate) : [],
    });
  }
};
