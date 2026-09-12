# Phase 1 Gate — Reproduction of Shiu et al.

**Date:** 2026-09-12 | **Status:** ✅ PASSED
**Claim under test:** stimulating sugar-sensing neurons drives the proboscis-extension
motor neuron MN9 through the unmodified FlyWire connectome.

Method: the reference implementation (`philshiu/Drosophila_brain_model`, MIT) imported
unmodified via `experiments/phase1_reproduce.py`. 21 right-hemisphere sugar neurons driven
by Poisson input at 150 Hz, 30 trials × 1 s. Readout: MN9 (`720575940660219265`).

## Reproduction

| Metric | Reference (Shiu et al.) | Ours (v630, n=21) |
|---|---|---|
| Total spikes | "more than 400 000" | **407,421** |
| Neurons active | "only about 400" | **435** |
| MN9 rate | fires | **82.17 Hz** (sd 4.62) |

Both published figures reproduced. Sugar reaches the proboscis through real measured wiring
with no intervention from us.

## Connectome version robustness (unplanned control)

One of the 21 sugar neurons (`720575940620900446`) is absent from v783 — merged or split
between snapshots. Comparing versions naively would confound the connectome bump with a
missing input, so both versions were re-run driving only the 20 neurons common to both.

| Condition | MN9 rate | Δ vs v630 n=21 |
|---|---|---|
| v630, n=21 (reference condition) | 82.17 Hz (sd 4.62) | — |
| v630, n=20 (matched) | 79.87 Hz (sd 3.65) | −2.8 % ← the missing neuron |
| v783, n=20 (matched) | 78.67 Hz (sd 4.04) | −1.5 % ← the connectome bump |

**Finding:** most of the apparent version effect was the dropped neuron. The v630→v783 bump
itself shifts MN9 by ~1.5 %, well inside single-trial variability (sd ≈ 4 Hz).

**Consequence:** it is safe to build downstream phases on **v783** (the current release) rather
than the paper's v630. Recorded here so the choice is traceable.

## Reproduce

```bash
uv run --python 3.12 --with brian2 --with pandas --with pyarrow --with joblib --with numpy \
    python experiments/phase1_reproduce.py --version 783 --runs 30 [--match-neurons]
```

~100 s for 30 trials on an 8-core M-series (all cores). A single trial is ~45 s — which is the
measured basis for the two-tier architecture in `RESEARCH.md` §5: the full network cannot run
in a browser, so only a validated reduction of it will.

## Caveats

- Firing rates depend on the free parameter `w_syn` (0.275 mV/synapse); we did not tune it.
- MN9 activity is the model's proxy for proboscis extension, not a measurement of behaviour.
- 435 vs "about 400" active neurons is consistent with the reference's rounded phrasing, not
  an exact-count match; the reference does not publish an exact figure to compare against.
