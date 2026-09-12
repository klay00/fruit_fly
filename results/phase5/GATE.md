# Phase 5 — The body swap

**Date:** 2026-09-12 | **Status:** ✅ PASSED · **pre-registered prediction HELD**

> *Can a fly be a dragon? And what happens if it becomes one?*

This is the experiment the project exists to run. The brain is not modified. Only the body is.

## The brain is unchanged — verified, not asserted

Constitution III requires that a diff between conditions shows changes only in morphology,
physics, and the DN→effector map. Both conditions load the same files:

```
net.bin   sha256 51fc9999…  20,218 neurons, 2,691,041 synapses
lif.wasm  sha256 658e85fe…
drive()   shared, one implementation, thresholds included
```

`drive()` being shared matters more than it looks. Retuning the interface for the dragon
would have changed two things at once, and no difference in behaviour could then be
attributed to the body rather than to the interface. Only these differ:

| | Fly | Dragon |
|---|---|---|
| Body length | 0.003 m | 6.0 m (S = 2000) |
| Mass | 0.8 mg | 600 kg |
| Escape acceleration | 200 m/s² (~20 g, a *Drosophila* jump) | 0.10 m/s² (= 200/S) |
| Turn rate | 12 rad/s | 0.27 rad/s (= 12/√S) |
| `MN9` drives | proboscis extension | **fire breath** |
| escape DNs drive | takeoff | evasive dodge |

Escape acceleration falls as 1/S straight from the square-cube law: muscle force goes with
cross-section, mass with volume. Earlier drafts carried arbitrary ×60 and ×55 multipliers
that made the dragon look capable; they were removed. Inventing a number that rescues the
animal would have decided the outcome in the morphology file. `LIFT_FUDGE = 340` remains as
the one declared lie (RESEARCH.md §7) — flight at this size is impossible without it — and
it is displayed rather than dissolved into the equations.

## Calibrating the stimulus, and why it was necessary

The connectome gives LC4/LPLC2 → Giant Fiber. It does **not** give how many Hz a looming
object of a given angular size drives those cells at. That mapping is ours, and whatever we
pick *is* the threshold. The first version fired the Giant Fiber at 4°, and the experiment
was then measuring our formula rather than the circuit.

So the mapping is calibrated once, in the **fly**, against the published value — short-mode
escape triggers near 40° of visual angle (Ache/Card et al., Curr Biol 2019) — and then
frozen. The dragon inherits the fly's calibration unchanged, which is exactly the
pre-registered claim: a fly-tuned threshold in a body that is not a fly's.

Calibration result: **fly fires at 41.4°** against a 40° target.

## Result

16 encounters per condition. A predator scaled to each body, approaching under Froude
scaling. Success = the animal displaces half a body length laterally before contact.

| Condition | Escape | Fires at | Cleared | Needed |
|---|---|---|---|---|
| **fly body (control)** | **75 %** | 36.2° | 1.719 BL | 0.50 BL |
| **dragon body** | **0 %** | 59.8° | 0.000 BL | 0.50 BL |
| dragon, forced to fire at the fly's angle | 0 % | 36.2° | 0.001 BL | 0.50 BL |

**Escape success drops 75 percentage points.** The prediction held.

## Two mechanisms, one of them unforeseen

The prediction named one mechanism. The measurement found two, and reporting only the
predicted one would overstate how well we understood the system in advance.

**1 — The circuit fires late.** Not anticipated. Under Froude scaling the dragon's threat
expands far more slowly at a given angular size — angular velocity at 40° is ~45× lower —
so the velocity-sensitive LC4 pathway contributes much less and the Giant Fiber holds off
until 59.8° instead of 36.2°. The fly's threshold is tuned not just to its body but to the
*angular dynamics its body's scale implies*.

**2 — The body cannot act in time.** The pre-registered claim. Isolated by a control that
overrides the circuit and fires at the fly's own 36.2° threshold by fiat. The dragon then
clears 0.001 body lengths instead of 0.000 and still escapes 0 % of encounters. **Perfect
timing does not rescue it.** The body, not the circuit, is the limiting term.

That control is what makes the result a finding rather than a story. Without it, "the dragon
dies" is equally consistent with the circuit firing late, and we could not say which.

## What this does and does not show

**It shows:** a sensorimotor threshold that is adaptive in one body is lethal in another, and
that the failure is dominated by physics the circuit cannot know about. The fly brain does
not "fail" — it does exactly what it evolved to do, at exactly the right moment, in a body
where that moment is far too late.

**It does not show** anything about consciousness, and the word appears nowhere in this
result. It also does not show that *no* threshold would work for a dragon — only that the
fly's does not. A dragon-tuned threshold was not tested and is an obvious next experiment.

## Bugs recorded

- **The simulation was coarser than the event it measured.** Geometry and brain integration
  both ran at 20 ms, while the fly's entire escape window — 40° to contact — is 12.8 ms. One
  step crossed the whole decision, so no gain existed that fired at 40°: the circuit either
  fired far too early or never. Split into a 1 ms geometry step and a 10 ms neural
  integration window.
- **The calibration search was inverted.** Higher gain fires the circuit *earlier*, hence at
  a *smaller* angle; the bisection raised the gain whenever the angle came out small, which
  drove it to the wrong rail.
- **The fly's escape acceleration was wrong by 8×** (25 m/s² instead of ~200), which made
  the control fail at 0 %. A control that fails is not a result, it is a broken instrument.

## Caveats

- Each geometry step re-runs the network from rest on the current stimulus — a quasi-static
  reading, discarding within-encounter neural history. Real escape involves temporal
  integration this does not model.
- 16 encounters per condition, deterministic seeds. The separation is large (75 vs 0) but
  no confidence intervals were computed.
- The dragon's mass (600 kg) departs from geometric similarity, which would give 6.4 t.
  Declared, not hidden; large flyers are far less dense than small ones.
- Only escape was measured. Feeding, sleep and foraging in the dragon body are not yet
  compared against the fly control.

## Reproduce

```bash
cd web && node workers/phase5_bodyswap.mjs      # ~70 s
```

---

# Phase 5b — the comparisons escape left out

**Exploratory. No prediction was pre-registered for any of these**, so nothing below
confirms anything; it is reported because the Phase 5 caveats promised it.

## Feeding — identical command, different arithmetic

The sugar→MN9 pathway is the same in both bodies, so the feeding command is identical *by
construction*. What differs is what a meal is worth. Basal metabolism scales roughly with
mass^0.75; the dragon at 600 kg burns on the order of 10⁶× the fly's resting energy, while
one MN9 command still delivers one mouthful.

**Feeding does not fail neurally in the dragon. It fails arithmetically.** The brain issues
a perfectly good command to eat; the body needs orders of magnitude more food than that
command can deliver.

## Sleep — identical, and that is the finding

| | explore | feed | sleep |
|---|---|---|---|
| fly | 14.49 h/day | 0.03 | 9.48 |
| dragon | 14.49 h/day | 0.03 | 9.48 |

Identical to the second, and asserted to be so. The sleep homeostat integrates waking time
and a circadian term, neither of which carries a mass term — it is **body-blind**.

A real 600 kg flyer would almost certainly not keep a 3 mm insect's rest schedule. So this
is a **limit of the model, not a result about dragons**, and it is the clearest place where
the neuromodulator layer's body-independence stops being a convenience and starts being
wrong.

## Foraging — the same gap

| condition | full → empty |
|---|---|
| at rest | 40.0 h |
| exploring | 12.3 h |
| constant escape effort | 4.0 h |

Same for both bodies, for the same reason. Adding a mass term to the metabolic model is the
obvious next change, and it would make the dragon's energy budget the dominant constraint
rather than a constant. **Recorded as an open gap, not a result.**

## What the interface actually changes

The same descending vector, through both bodies:

| signal | fly | dragon |
|---|---|---|
| feed | 0.370 | 0.370 |
| escape | 0.000 | 0.000 |
| steer | 0.000 | 0.000 |
| thrust | 0.350 | 0.350 |

Equal to nine decimal places, and asserted. `drive()` is shared, so the *command* is
identical. Every difference between the animals appears strictly **after** this point, in
what the morphology can do with it — escape acceleration 200 vs 0.1 m/s², a factor of 2000.

That table is the cleanest statement of the experiment: one brain, one command, two fates.

## Measurement caveat

These runs used a 30 ms neural integration window, and MN9 reads 0.0 Hz at 100 Hz drive
where a 400 ms window gives 55 Hz. Short windows underestimate low rates: the network is
reset at the start of each window and needs time to ramp. The feeding column above is
therefore a *lower bound*, not a rate measurement, and the Phase 4 numbers are the ones to
quote.

## Reproduce

```bash
cd web && node workers/phase5b_behaviours.mjs
```
