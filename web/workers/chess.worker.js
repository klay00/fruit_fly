/* The fly, off the main thread. Loads the same brain and weights the trainer produced. */
import { MushroomBody, Readout, Chess } from '../brain/mb.mjs';
import { rehearse, observe, material } from '../brain/player.mjs';

let mb, ro, seed = 1, pending = null, learned = 0;
const KEY = 'fly-chess-synapses';
function save() { try { localStorage.setItem(KEY, JSON.stringify(ro)); } catch {} }

onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'boot') {
    const bytes = async (f) => (await fetch(m.base + f)).arrayBuffer();
    const json = async (f) => (await fetch(m.base + f)).json();
    mb = await MushroomBody.load(bytes, json);
    // Synapses the fly has grown in THIS browser take precedence over the shipped ones:
    // what it learned playing you is its, and stays.
    let own = null; try { own = JSON.parse(localStorage.getItem(KEY)); } catch {}
    if (own?.w?.length === mb.iface.kc.length) ro = Readout.from(own);
    else { try { ro = Readout.from(await json('weights.json?t=' + Date.now())); } catch { ro = new Readout(mb.iface.kc.length); } }
    let training = [];
    try { training = await json('training.json?t=' + Date.now()); } catch {}
    postMessage({ type: 'ready', n: mb.iface.n, nnz: mb.iface.nnz, kc: mb.iface.kc.length,
                  pn: mb.iface.pn.length, mbon: mb.iface.mbon.length, apl: mb.iface.apl.length,
                  games: training.length, provenance: mb.iface.provenance,
                  trained: !!training.length, own: !!own,
                  positions: mb.positions ? Array.from(mb.positions) : null,
                  groups: { pn: mb.iface.pn, kc: mb.iface.kc, mbon: mb.iface.mbon, apl: mb.iface.apl } });
  } else if (m.type === 'think') {
    const g = new Chess(m.fen);
    const t0 = performance.now();
    const cands = rehearse(mb, ro, g, m.color, 6, seed++);
    const chosen = cands[0];
    pending = chosen ? { chosen, color: m.color, matBefore: material(g, m.color) } : null;
    postMessage({
      type: 'moves', ms: performance.now() - t0,
      chosen: chosen ? { san: chosen.san, from: chosen.from, to: chosen.to, feared: chosen.feared } : null,
      cands: cands.map((c) => ({ san: c.san, from: c.from, to: c.to, value: c.value, oneply: c.oneply,
                                 terminal: c.terminal, capture: c.capture, kcActive: c.kcActive,
                                 rehearsed: c.rehearsed, feared: c.feared })),
      // the chosen position's activity across the whole circuit, for the brain map
      kc: chosen ? Array.from(chosen.kcRate) : [],
      pn: chosen ? Array.from(chosen.pnRate) : [],
      mbon: chosen ? Array.from(chosen.mbonRate) : [],
    });
  } else if (m.type === 'observe') {
    // The opponent has replied. Prediction error -> dopamine -> synapses move.
    if (!pending) return;
    const g = new Chess(m.fen);
    const o = observe(mb, ro, pending.chosen, g, pending.color, pending.matBefore, 0.015, seed++);
    pending = null; learned++; save();
    postMessage({ type: 'dopamine', delta: o.delta, reward: o.reward, predicted: o.predicted, next: o.next, learned });
  } else if (m.type === 'forget') {
    try { localStorage.removeItem(KEY); } catch {}
    ro = new Readout(mb.iface.kc.length); learned = 0;
    postMessage({ type: 'dopamine', delta: 0, reward: 0, predicted: 0, next: 0, learned });
  }
};
