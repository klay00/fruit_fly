# Fly To Dragon — Research Brief

> **Can a fly be a dragon? And what happens if it becomes one?**
>
> An open-source research project. We take a real, published connectome of the adult
> *Drosophila melanogaster* brain, simulate it, and then give it a body it never evolved for.
> The brain is not modified. Only the body changes.

**Status:** Phase 0 complete — connectome pipeline builds and self-verifies.
**Audience:** computational neuroscientists, simulation engineers, and curious readers.

---

## 0. The honest framing (read this first)

This project simulates **neural dynamics**, not consciousness.

The word "conscious" attached to insect brains comes from a live philosophical argument
(Barron & Klein, PNAS 2016) that the insect central complex supports a minimal, egocentric
model of the world — a candidate substrate for subjective experience. That argument is
**contested and unresolved**. Nothing we build here can settle it.

What we *can* honestly claim: the fly brain generates **autonomous, internally-driven,
state-dependent behaviour** from real measured wiring. It gets hungry and forages. It gets
tired and sleeps. It sees a looming shadow and escapes before any "decision" is made. That
is what we simulate, and that is what we will say we simulate.

**Project principle #1: no overclaiming.** Every behaviour the dragon shows must trace back
to a cited circuit or be explicitly labelled as an engineering addition.

---

## 1. The central idea: the brain–body interface is ~1,300 numbers wide

This is the architectural insight the whole project rests on.

The fly brain does **not** output "walking" or "flying". It outputs spikes on a bundle of
**descending neurons (DNs)** — roughly 1,300 cells (~650 per hemisphere) that pass through the
neck connective and command the ventral nerve cord (VNC). The VNC and the body turn those
commands into wingbeats, steps, and proboscis extensions.

```
   sensory input  →  [ BRAIN: 139k neurons, real connectome ]  →  DN vector (~1300 floats)
                                                                        │
                                            ┌───────────────────────────┴──────────────────────┐
                                            ▼                                                  ▼
                                   [ FLY BODY ]                                      [ DRAGON BODY ]
                              wings, 6 legs, proboscis                         wings, 4 limbs, fire gland
                                    (the control)                                 (the experiment)
```

So the experiment is precise and falsifiable:

> **Hold the brain fixed. Replace the body's morphology and affordances. Observe what the
> unchanged brain does when its actions have different consequences.**

Does hunger still drive coherent foraging when "food" is a deer rather than a sugar droplet?
Does the escape reflex still save it when the body is 400× larger and slower? Does the
heading system still navigate when the wings generate lift by different physics?

That is a real research question, and the DN vector is the entire API between the two halves.

### The mapping that makes the dragon work

| Fly motor program | Driven by | Dragon expression |
|---|---|---|
| Proboscis extension (MN9) | sugar-sensing → feeding circuit | **fire breath** — same command, new effector |
| Escape takeoff | Giant Fiber ← LC4 + LPLC2 (looming) | evasive dodge / flee |
| Flight initiation & steering | DNa02, DNp09, wing DNs | wing flap, banking turn |
| Walking / turning | DNa01, DNa02 (steering) | ground stalk, prowl |
| Grooming | descending grooming commands | preening, threat display |
| Sleep quiescence | dFB / R5 sleep-pressure circuit | perch and rest |
| No fly analogue | — | **defensive stand** (engineering addition — labelled as such) |

Fire breath from the *feeding* motor program is not a gimmick: it is the most defensible
mapping in the table. The proboscis-extension pathway is the single best-characterised
sensorimotor loop in the whole connectome, and it is the one Shiu et al. used to validate
their whole-brain model. It is an appetitive output that fires at a target when the animal is
hungry and detects food. That is exactly what dragon fire is for.

---

## 2. Available data (all real, all open)

| Dataset | Scope | Neurons | Connections | Licence |
|---|---|---|---|---|
| **FlyWire FAFB v783** | female central brain + optic lobes | 139,255 | 3,732,460 | **CC BY-NC 4.0** |
| **MCNS v1.0** (Janelia) | male full CNS, brain + VNC, intact neck | 166,700 | 6,242,118 | **CC BY 4.0** |
| **BANC v888** | brain + nerve cord | 158,262 | 3,037,361 | see FlyWire ToS |
| **MANC v1.2.1** | male ventral nerve cord | 23,665 | 5,305,638 | CC BY 4.0 |
| **Hemibrain v1.2** | partial central brain | ~25k | — | CC BY 4.0 |

FlyWire also ships **neurotransmitter predictions per neuron** (the sign of each synapse —
excitatory/inhibitory), which is what makes a runnable dynamical model possible at all.

### ⚠️ Licence constraint — a real design decision

**FlyWire data is CC BY-NC 4.0: non-commercial only.** Our *code* can be MIT/Apache, but
FlyWire-derived data and any derived weights inherit NC. For a public website that is fine —
as long as the site carries no ads, no paywall, no commercial tier — but it must be stated,
and it forecloses commercial reuse by others.

**Janelia MCNS / MANC / hemibrain are CC BY 4.0** — no such restriction, *and* MCNS includes
the ventral nerve cord with an intact neck connective, meaning the full brain→DN→VNC→motor
chain is in one dataset.

**Recommendation:** build the pipeline dataset-agnostic; start on **FlyWire v783** because the
validated reference model (Shiu et al.) is built on it and reproducibility is the Phase 1 gate;
keep **MCNS** as the licence-clean and anatomically-complete second source. Decide before the
site goes public.

---

## 3. Prior art we build on (not reinvent)

- **`philshiu/Drosophila_brain_model`** — MIT licence, Brian2. The reference whole-brain
  leaky integrate-and-fire model from Shiu et al. (Nature 2024). Every neuron is the same
  current-based LIF unit with an exponential synapse: τ_m 20 ms, τ_syn 5 ms, V_rest = V_reset
  = −52 mV, V_thresh = −45 mV, refractory 2.2 ms, synaptic delay 1.8 ms, ~0.275 mV per synapse
  × a global gain. Activating sugar-sensing neurons makes proboscis motor neurons fire.
  *(Parameters to be re-verified against the source at implementation time.)*
  **This is our Phase 1 target to reproduce. We do not write our own model first.**
- **NeuroMechFly v2 / FlyGym** (Nature Methods 2024) — MuJoCo biomechanical fly body with
  vision, olfaction, leg adhesion, ascending feedback. This is the *control* body.
- **flybody** (DeepMind/HHMI) — MuJoCo whole-body fly, flight and walking via RL.
- **Codex** (codex.flywire.ai) — browsing + bulk download of FlyWire data.
- **neuPrint** (neuprint.janelia.org) — query API for Janelia datasets, `neuprint-python`.

Several community repos already couple a FlyWire LIF brain to a body or a desktop toy. None
of them ask our question — *what happens when the body is wrong for the brain* — and none are
built as a publishable, reproducible research artefact with a public interactive site.

---

## 4. The circuits we need, and where they come from

Each internal state below is a *neuromodulatory* system in the real fly — slow, diffuse,
peptide/amine-mediated — not fast synaptic transmission. That is important: it means we model
them correctly as **slow scalar variables that gate and bias the spiking network**, which is
both biologically faithful and computationally cheap. We are not cutting a corner here; this
is how the biology is organised.

### Hunger / feeding
Starvation raises **NPF** (neuropeptide F) and **AKH** (adipokinetic hormone, the fly's
glucagon). NPF indirectly activates TH-VUM dopaminergic neurons; AKH indirectly activates
sNPF-releasing LNCs. Net effect: sugar-sensing gain goes **up**, feeding threshold goes
**down**, locomotion and food-seeking go **up**. Gustatory receptor neurons (Gr64f) →
interneurons → MN9 → proboscis extension.

### Sleep / sleep pressure
The **dorsal fan-shaped body (dFB)** is the sleep-promoting centre; **R5 ring neurons** in the
ellipsoid body encode accumulated sleep *pressure*; **helicon cells** close the loop. dFB
neurons release inhibitory transmitter onto central-complex targets. Sleep pressure builds
with waking time and discharges during rest — a clean integrator we can model directly.

### Fatigue
Less cleanly mapped to a named circuit than sleep. Modelled as a metabolic/energetic variable
coupled to AKH signalling and flight-muscle cost. **Flagged as partly engineering.**

### Fear / escape
The best-characterised circuit in the project. **LC4** (55 neurons) encodes looming
*velocity*; **LPLC2** (108 neurons) encodes looming *angular size*. Both synapse directly onto
the **Giant Fiber (GF)** on its lateral dendrite — 2,442 LC4 and 1,366 LPLC2 synapses. The GF
triggers a short-mode escape takeoff when the expanding stimulus reaches ~40° on the eye.
Summing a linear function of angular velocity with a Gaussian function of angular size
reproduces the GF response and predicts peak-response time. Two escape modes exist (short GF-
driven, long non-GF), and the short one measurably improves survival against real predators.
This gives the dragon a genuine startle reflex, with a threshold we did not invent.

### Flight & heading
**Central complex ring attractor** (EPG neurons) maintains a heading estimate — the fly's
compass. Steering DNs (DNa01, DNa02) convert heading error into turns. Optic-flow neurons
(HS/VS) stabilise gaze and course.

---

## 5. Why the browser cannot just run 139,000 neurons

A faithful full-brain LIF simulation of 139k neurons and 3.7M edges is a few seconds of
compute per second of simulated time on a CPU — fine offline, impossible at 60 fps in a
browser tab alongside a 3D world.

But we do not need to. The interface is **~1,300 DN floats wide** (§1). So:

**Two tiers.**

**Tier 1 — offline, Python + Brian2, full fidelity.** The real science. Run the complete 139k
network. Reproduce Shiu et al. Characterise each behavioural primitive: which sensory drive
produces which DN pattern, under which internal state. Output: a cited, reproducible
**DN primitive library** + the recorded traces that back every claim on the website.

**Tier 2 — live, in-browser, reduced.** A sparse LIF network of only the neurons on the
sensory→DN paths that matter (expect ~5–15k after graph reduction from Tier 1 — a real number
to be measured, not guessed), running in a WebGPU compute shader or wasm worker. It drives the
dragon autonomously and in real time. The reduction is **derived from Tier 1 and validated
against it**, not hand-designed.

**Validation gate between them:** the reduced network must reproduce Tier 1's DN output on
every primitive within a stated error bound, or the reduction is wrong and gets redone. This
gate is what separates this project from a pretty animation.

WebGPU is production-ready across browsers as of Safari 26 (Sept 2025), with compute shaders
updating ~100k particles in <2 ms. Both the neural tier and the neuron-cloud rendering can
live on the GPU.

---

## 6. Proposed stack

| Layer | Choice | Why |
|---|---|---|
| Data pipeline | Python + Polars/PyArrow + SciPy sparse | connectome ships as parquet; sparse matrices are the native form |
| Offline brain | **Brian2** (+ C++ codegen) | it is what the reference model uses — reproducibility beats novelty |
| Live brain | WebGPU compute shader, wasm fallback | keeps the 60 fps budget for rendering |
| Body physics (control) | MuJoCo / FlyGym | validated fly biomechanics, offline |
| 3D world | **Nuxt 4 + TresJS v5** | TresJS is declarative Three.js for Vue, has a zero-config Nuxt module and experimental WebGPU |
| Animal bots | boids + behaviour trees | NPCs do **not** need connectomes — only the protagonist does |
| Site | Nuxt static/SSG + interactive figures | one codebase serves the paper and the simulator |
| Process | **spec-kit** (SDD) + **ponytail** | spec per phase; ponytail keeps each phase minimal |

---

## 7. Open questions to resolve before/while building

1. **Licence:** FlyWire (NC, has the validated model) vs MCNS (CC BY, has the VNC). Must be
   settled before public launch.
2. **How faithful is the dragon's flight allowed to be?** Real dragon-scale flight is
   aerodynamically impossible. We choose a physics fudge and *state it*.
3. **What counts as a positive result?** Define in advance what "the fly brain successfully
   drove the dragon" means — otherwise the finding is unfalsifiable. Candidate metrics:
   survival time, foraging success rate, escape latency, behavioural-state coherence vs the
   fly-body control.
4. **Fatigue** has no clean circuit. How much engineering do we allow before it stops being
   connectome-derived?

---

## 8. Sources

- Dorkenwald et al., *Neuronal wiring diagram of an adult brain*, Nature (Oct 2024) — https://www.nature.com/articles/s41586-024-07558-y
- Schlegel et al., *Whole-brain annotation and multi-connectome cell typing of Drosophila*, Nature (2024) — https://www.nature.com/articles/s41586-024-07686-5
- FlyWire — https://flywire.ai/ · Codex — https://codex.flywire.ai/
- Shiu et al., *A leaky integrate-and-fire computational model based on the connectome of the entire adult Drosophila brain…*, Nature (2024) — https://pubmed.ncbi.nlm.nih.gov/37205514/ · code: https://github.com/philshiu/Drosophila_brain_model
- Janelia Male CNS Connectome — https://www.janelia.org/project-team/flyem/male-cns-connectome · download: https://male-cns.janelia.org/download/
- *Sexual dimorphism in the complete Drosophila male central nervous system connectome*, Cell (2026) — https://www.cell.com/cell/fulltext/S0092-8674(26)00942-6
- MANC connectome — https://www.janelia.org/project-team/flyem/manc-connectome · neuPrint — https://neuprint.janelia.org/
- Ache/Card et al., *Neural Basis for Looming Size and Velocity Encoding in the Drosophila Giant Fiber Escape Pathway*, Current Biology (2019) — https://www.cell.com/current-biology/fulltext/S0960-9822(19)30138-1
- *Shorter-duration escapes driven by Drosophila giant interneurons promote survival during predation*, Proc. B (2025) — https://royalsocietypublishing.org/rspb/article/292/2047/20241724/234452/
- Pool & Scott / Lin et al., *Neural basis of hunger-driven behaviour in Drosophila*, Open Biology (2019) — https://royalsocietypublishing.org/doi/10.1098/rsob.180259
- *The dorsal fan-shaped body is a neurochemically heterogeneous sleep-regulating center in Drosophila* — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12135941/
- Donlea et al., *Recurrent Circuitry for Balancing Sleep Need and Sleep* — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5779612/
- *AKH-FOXO pathway regulates starvation-induced sleep loss*, PLOS Genetics — https://journals.plos.org/plosgenetics/article?id=10.1371/journal.pgen.1009181
- Wang/Ramdya et al., *NeuroMechFly v2: simulating embodied sensorimotor control in adult Drosophila*, Nature Methods (2024) — https://www.nature.com/articles/s41592-024-02497-y
- Barron & Klein, *What insects can tell us about the origins of consciousness*, PNAS (2016)
- TresJS — https://tresjs.org/ · v5 release — https://tresjs.org/blog/tresjs-v5 · WebGPU — https://docs.tresjs.org/api/advanced/web-gpu
- spec-kit — https://github.com/github/spec-kit
