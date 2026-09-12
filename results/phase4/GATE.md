# Phase 4 Gate — the fly body, the scientific control

**Date:** 2026-09-12 | **Status:** ✅ PASSED

Constitution Principle III: *the fly-body control ships before the dragon, always.* Without
an unmodified brain running in the body it evolved for, "the fly brain flew the dragon" is
not a measurable claim. This is that control.

## What runs

A Nuxt 4 + TresJS page with the connectome in a Web Worker. The tests below drive the
**exact wasm binary and network file the page fetches**, so a pass is a statement about what
ships rather than about a Python model.

| | |
|---|---|
| Network | 20,218 neurons · 2,691,041 synapses · 21.6 MB |
| Reduction | union of two per-pathway corridors: sugar→MN9 at k=3, looming→command DNs at k=2 |
| Engine | `engine/lif.c` → wasm, validated in `results/phase3` |
| Interface | 3 sensory channels in, 11 command DNs + MN9 out |

Building one corridor deep enough for both pathways would have cost 92,397 neurons. Built
per pathway and unioned, the same two behaviours cost 20,218 — each pathway gets the depth
it needs and no more.

## Gate results

**Feeding** — sugar drive → MN9, monotonic, with the measured threshold intact:

| Drive | MN9 |
|---|---|
| 28 Hz (sated) | 0.0 Hz |
| 37 Hz | 0.0 Hz |
| 50 Hz | 2.5 Hz |
| 100 Hz | 55.0 Hz |
| 250 Hz (starving) | 100.0 Hz |

**Escape** — looming → Giant Fiber: 213 Hz with a threat, 0 Hz at rest.

**Steering is lateralised, and this was not designed.** A threat in the left eye produces a
+55 differential across DNa01/DNa02/DNa08; in the right eye, −65. Opposite signs, from the
wiring alone. A threat filling *both* eyes gives +3 — no turn, pure escape, which is the
correct behaviour and emerges because the two hemispheres cancel.

**Autonomous cycling** — 48 h with no external input: 8.61 h/day sleep across 3 bouts,
15.36 h exploring. The JS port of the state layer re-runs all four Phase 2 gates
(`workers/state.test.mjs`); if it drifts from `pipeline/state.py`, that test fails.

## The brain–body interface

`app/composables/useBody.js` is the file Phase 5 swaps. Everything upstream — connectome,
weights, LIF constants, internal state — is held fixed; only this mapping and the morphology
change. Two decisions in it are worth naming:

- **Escape is the maximum across DNp01/DNp11/DNp07, not their sum.** They are parallel
  pathways to one behaviour; summing would make redundancy look like urgency.
- **Steering is the left−right difference**, which is why the export keeps hemispheres apart
  all the way from the annotations. Collapsing them anywhere in the chain would silently
  delete the fly's ability to turn away from anything.

## ⚠️ Labelled as engineering, not connectome

**Foraging navigation.** When hungry, the fly's heading is biased toward the nearest food.
The corridor contains no place memory and no path-integration pathway, so this is an
invented stand-in, marked `engineering:` in the source and stated on the page itself. The
real mechanism — central-complex ring attractors for heading — is not in this reduction.

Everything else the fly does — when it feeds, when it flees, which way it turns, when it
sleeps — comes from the connectome or the cited neuromodulator model.

## A bug worth recording

The gate failed on first run: looming produced 0 Hz at the Giant Fiber, while the same
network under Python gave 190 Hz. The brain was fine; the *test* was wrong. `run()` returned
a closure reading the shared wasm counts buffer rather than a snapshot, so each call
silently overwrote every earlier "measurement" and they all reported whatever the last run
left behind. A measurement that aliases mutable state is not a measurement. Fixed by
snapshotting; the comment in the test says why.

## Open

- **21.6 MB brain payload.** Fine locally, too heavy for a public site. Unresolved, and it
  is now the main obstacle to Phase 7.
- Verified in Node, not in a browser. The page builds and serves, but the rendered scene has
  not been confirmed on a real GPU.
- Flight is kinematic, not aerodynamic. There is no lift model yet — `LIFT_FUDGE` exists in
  the body map at 1.0 and does nothing until the dragon needs it.

## Run it

```bash
cd web && npm run dev          # http://localhost:3000
node workers/integration.test.mjs   # the gate above
node workers/state.test.mjs         # the phase 2 gates, in JS
```
