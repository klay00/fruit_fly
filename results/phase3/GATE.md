# Phase 3 Gate — Reduction and engine

**Date:** 2026-09-12 | **Status:** ✅ 3a PASSED · ✅ 3b PASSED · ⏳ 3c (GPU port) open

Two error terms were measured separately so that any failure has one identifiable cause:

- **3a — reduction error.** Does the smaller *network* behave like the full one?
  Both run in Brian2, so the simulator is held constant.
- **3b — implementation error.** Does our *engine* compute what Brian2 computes?
  Both run on byte-identical wiring, so the network is held constant.

## 3a — reduction

| Condition | Threshold | Max abs | Median rel | Neurons |
|---|---|---|---|---|
| A full, all synapses (baseline) | 37 Hz | — | — | 138,639 |
| B all nodes, synapses ≥ 5 | 50 Hz ✗ | 9.50 Hz | 13.7 % | 138,639 |
| C corridor k=3, synapses ≥ 5 | 50 Hz ✗ | 10.20 Hz | 13.4 % | 7,402 |
| **D corridor k=3, all synapses** | **37 Hz ✓** | **2.00 Hz** | **2.2 %** | **7,402** |

**Finding: prune nodes aggressively, never threshold synapses.** Dropping 94.7 % of neurons
cost nothing — C is marginally *better* than B. But thresholding connections at ≥ 5 synapses
moved the feeding threshold from 37 Hz to 50 Hz, a 35 % shift, before any pruning happened.
The weak 1–4 synapse connections carry near-threshold signal.

This is consistent with the transmission property locked into `pipeline/lif.py`: a single
synapse cannot drive a target, because g decays with τ = 5 ms while v follows with
t_mbr = 20 ms and only ~16 % of an event reaches the membrane. Transmission requires
convergence, and convergence is assembled out of many weak edges. Thresholding at ≥ 5
synapses is standard practice for anatomical analysis of FlyWire data; it is not safe for
dynamics.

Condition D — corridor nodes selected on the strong-edge graph, then **every** synapse among
them retained — is the reduction we carry forward: 7,402 neurons, 916,474 edges.

## 3b — engine

`pipeline/lif.py` vs Brian2 on condition D, 10 trials per point:

| Drive | Brian2 | Ours | Diff | Active (B2 / ours) |
|---|---|---|---|---|
| 28 Hz | 0.00 | 0.00 | +0.00 | 71 / 68 |
| 37 Hz | 1.60 | 1.00 | −0.60 | 178 / 177 |
| 50 Hz | 9.90 | 10.70 | +0.80 | 290 / 285 |
| 100 Hz | 62.00 | 59.20 | −2.80 | 355 / 349 |
| 150 Hz | 78.70 | 76.40 | −2.30 | 387 / 367 |
| 250 Hz | 96.10 | 96.70 | +0.60 | 410 / 407 |

Max absolute error 2.80 Hz, median relative error 4.5 %, threshold preserved at 37 Hz.
Active-neuron counts track independently of MN9, so the agreement is network-wide rather
than tuned at the readout.

## The bug that took three attempts

The gate failed three times. Recorded in full because the failure mode is one that anyone
reimplementing this model will hit, and because two of the three errors were ours, not the
reference's.

**A deterministic test proved nothing.** Feeding both engines a regular 4 ms spike train
gave spike-for-spike agreement — 95 spikes each. That was a *powerless* test: a 4 ms
interval never lands inside a 2.2 ms refractory window, which is precisely where the bug
lived. It only appeared under irregular (Poisson) input.

**Two bugs stacked, the second hidden by the first.** (1) Poisson-forced spikes were not
gated by refractoriness, producing back-to-back spikes on consecutive 0.1 ms steps — 94
occurrences where Brian2 had exactly 0, each dumping two full synaptic volleys into g in one
step. (2) Only after fixing that did the real one surface: marking `dg/dt` as
`(unless refractory)` in the reference suppresses the incoming `g += w` as well as the
decay. Synaptic input arriving at a refractory target is **discarded**. Measured directly
from a Brian2 state trace: an event arriving 0.6 ms after a spike left g at exactly 0.000
for the whole refractory period.

**The fix introduced a worse bug.** Setting `rfc[driven] = 1` inside the `if spiked.size:`
block gagged *every* sensory neuron on any step where anything anywhere in the network
fired — in a live network, nearly every step. Caught by an unintended control: the
`False/False` variant reproduces the original semantics exactly, so it had to return the
original number. It returned 39.3 instead of 70.4, which proved the regression was ours and
not the variant under test.

**A knob that provably cannot matter was removed, not left as an option.** Gating the decay
in addition to the input gave bit-identical rates, because the reset zeroes g at the spike
and refractoriness begins in the same step — g is identically 0 throughout, and decaying
zero changes nothing.

The error was 25–34 %, silent, and compounded with synaptic depth. It produced entirely
plausible numbers. Had it passed, every downstream result — DN patterns, dragon behaviour,
and the fly-versus-dragon comparison that is the actual research question — would have been
built on it.

## ⏳ 3c — not yet done

Performance: 166.8 s for 60 s of simulated time = **2.78 s per simulated second** on 7,402
neurons in NumPy. That is 0.36× real time, against a 60 fps budget that must also render a
3D world. The engine is correct but not yet fast enough; the WebGPU port is outstanding, and
`pipeline/lif.py` is its validated reference.

## Reproduce

```bash
uv run --python 3.12 --with brian2 --with pandas --with pyarrow --with joblib \
    --with numpy --with scipy python experiments/phase3a_condD.py
uv run --with numpy --with scipy --with pandas --with pyarrow \
    python experiments/phase3b_implementation.py
```

## Caveats

- Both gates use one sensory pathway (sugar → MN9) and one readout. A corridor built for the
  full ~1,300-neuron descending vector has not been measured and may not reduce as cleanly.
- Identifying the descending neurons needs cell-type annotations (Schlegel et al. / Codex),
  which are not in the dataset currently on disk. That is an open data-acquisition step.
- The 20 % error bound in the gate is a judgement call, not a derived tolerance.

---

# Phase 3 addendum — the full descending vector

Phase 3a measured one pathway (sugar → MN9) and got 7,402 neurons. The caveat said the full
~1,300-neuron descending bundle "may not reduce as cleanly". Measured with the Schlegel et al.
cell-type annotations (`pipeline/annotations.py`, FlyWire v783, 1,299 DNs present of 1,303
annotated):

| Seeds → all DNs | k=2 | k=3 |
|---|---|---|
| sugar (20 cells) | 2,563 (1.8 %) | 13,412 (9.7 %) |
| gustatory (408) | 7,506 (5.4 %) | 31,367 (22.6 %) |
| chemo + mechano | 24,099 (17.4 %) | 91,509 (66.0 %) |
| **chemo + mechano + looming (LC4/LPLC2)** | **38,197 (27.6 %)** | 102,686 (74.1 %) |
| chemo + mechano + all visual projection | 79,858 (57.6 %) | 117,916 (85.1 %) |
| all sensory | 59,339 (42.8 %) | 127,024 (91.6 %) |

**The 7,402 figure does not generalise.** There is no small corridor for a multimodal brain
driving the whole descending vector — the fly brain is small-world enough that two hops out
from a few thousand seeds and two hops back from 1,299 targets already covers a quarter of it.

**Vision is what explodes it.** Seeding from all 8,038 visual projection neurons doubles the
corridor (38k → 80k). Seeding instead from the two *named* looming detectors — LC4 (104
cells) and LPLC2 (210) — holds it at 38,197. This is a defensible restriction rather than a
convenience: the looming-escape pathway is a specific, characterised circuit (LC4 encodes
angular velocity, LPLC2 angular size, both converging on the Giant Fiber, which is DNp01 and
present in the annotations as exactly 2 cells). Simulating 77,541 optic-lobe neurons to
recompute a quantity the literature gives as a closed-form function of the stimulus buys
nothing. Where the optic lobe is modelled rather than simulated, it must be labelled as such.

## Performance — one fix, no GPU

The 2.78 s per simulated second reported above was an artifact, not a limit. The step was
computing `W.T @ spikes`, a full sparse matvec whose cost is the same whether 5 neurons fire
or 5,000 — while spikes are extremely sparse (of 38k neurons at ~30 Hz, roughly 100 fire in
a 0.1 ms step). Gathering only the outgoing rows of the neurons that actually spiked makes
the step scale with activity instead of network size.

| | before | after |
|---|---|---|
| 7,402 neurons | 2.78 s/s (0.36×) | **0.53 s/s (1.88× real time)** |
| 38,197 neurons | — | 3.10 s/s (0.32× real time) |

5.2× faster, with **bit-identical gate results** (2.80 Hz max abs, 4.5 % median relative,
threshold 37 Hz) — a pure optimisation, verified rather than assumed.

## Consequence for the architecture

`RESEARCH.md` §5 predicted a Tier-2 network of "~5–15k after graph reduction". That estimate
is **falsified** for the multimodal case. The live tier is 38,197 neurons and 4.5M edges, and
at 0.32× real time on CPU it needs the GPU port — which was always the plan, but is now a
requirement rather than an optimisation.

Open: whether WebGPU clears 1× plus a rendering budget at this size. The scatter-add becomes
atomics on GPU, which is the part that may not scale as hoped. Unmeasured.

---

# Phase 3c Gate — the browser engine

**Status:** ✅ PASSED. **WebGPU turned out not to be needed.**

The addendum above concluded the GPU port was "a requirement rather than an optimisation".
That was wrong, and testing the cheaper option first is what showed it. Before writing a
compute shader, the question was whether 3.10 s per simulated second was a real limit or an
artifact of NumPy's per-operation overhead and its per-step allocation of a 38k array. It was
an artifact twice over:

1. **Spike sparsity** (NumPy, §above): gathering only the rows of neurons that actually
   spiked instead of a full `W.T @ spikes` matvec — 5.2× faster, bit-identical results.
2. **A plain C loop** (`engine/lif.c`): a further 6.3×, single-threaded, no GPU.

## Correctness — same gate as 3b, against Brian2

| Drive | Brian2 | Python | C | WASM |
|---|---|---|---|---|
| 37 Hz | 1.60 | 1.00 | 1.00 | 0.20 |
| 50 Hz | 9.90 | 6.67 | 11.00 | 10.20 |
| 100 Hz | 62.00 | 61.00 | 63.50 | 59.80 |
| 150 Hz | 78.70 | 76.67 | 80.30 | 77.00 |
| 250 Hz | 96.10 | 97.33 | 95.70 | 98.50 |

C: max absolute error 1.60 Hz, median relative 2.4 %, threshold preserved at 37 Hz — better
than the Python reference's 4.5 %. WASM agrees within trial variance (sd ≈ 4–5 Hz) at every
point. `pipeline/lif.py` remains the readable reference that gate 3b validated; `engine/lif.c`
is the fast path, and one source builds both the native library and the wasm module so the
two cannot drift.

## Speed

| Network | C (native) | WASM (Node) |
|---|---|---|
| sugar corridor — 7,402 neurons, 916k edges | 15.5× real time | 13.3× |
| **multimodal — 38,197 neurons, 4.53M edges** | **2.05×** | **1.62 – 2.36×** |

WASM costs roughly 15–20 % against native, which still clears 1× with headroom for
rendering. Speed falls as drive rises (2.36× at 50 Hz, 1.62× at 250 Hz) because the step now
scales with activity rather than network size — the intended behaviour, but it means the
budget must be sized for the *busiest* state, not the average.

## The descending vector responds

Driving the 408 gustatory sensory neurons, measured across the full 1,299-neuron descending
bundle (all of which are present in the corridor):

| Gustatory drive | DNs firing | DN spikes / s | Neurons active |
|---|---|---|---|
| 50 Hz | 87 / 1,299 | 1,268 | 1,319 |
| 150 Hz | 183 / 1,299 | 6,423 | 6,263 |
| 250 Hz | 192 / 1,299 | 7,562 | 6,400 |

A hunger-scaled taste signal drives roughly 15 % of the descending vector. That pattern is
the brain–body interface of `RESEARCH.md` §1 — the thing Phase 5 maps onto a dragon.

## A bug worth recording

The first WASM run reported 0.00 Hz at every drive while timing plausibly. Cause: the export
packs `indptr`, `cols` and `vals` contiguously, but the wasm-side allocator pads each block
to 8-byte alignment, so the three are *not* contiguous in wasm memory. Writing them as one
run put `cols` 4 bytes early, shifting every synaptic target by one neuron. The network still
ran, at full speed, on rewired nonsense. Speed measurements are not correctness measurements,
and a fast wrong answer looks exactly like a fast right one.

## Open

- **36.4 MB binary, 13.6 MB gzipped** for the multimodal network. That is a heavy download
  for a public site. Options not yet explored: fp16 or int8 weights, or shipping the 7.4 MB
  sugar corridor for the default view and the full network on demand.
- WASM was benchmarked under Node, not in a browser. Browser wasm engines are the same
  V8/SpiderMonkey tier, but this has not been confirmed on the target platform.
- Single-threaded. Web Workers plus SharedArrayBuffer would add headroom if needed.

## Build

```bash
clang -O3 -ffast-math -march=native -shared -fPIC -o engine/liblif.dylib engine/lif.c
PATH="/opt/homebrew/opt/lld/bin:$PATH" /opt/homebrew/Cellar/llvm/*/bin/clang \
  --target=wasm32 -O3 -nostdlib -fno-builtin \
  -Wl,--no-entry -Wl,--export-all -Wl,--allow-undefined -Wl,--initial-memory=268435456 \
  -o engine/lif.wasm engine/lif.c
uv run python engine/export_multimodal.py && node engine/bench.mjs
```
