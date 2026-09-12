# Fly To Dragon — Constitution

**Project:** Can a fly be a dragon? And what happens if it becomes one?
**Version:** 1.0.0 | **Ratified:** 2026-09-12 | **Last amended:** 2026-09-12

An open-source research project that runs a real, published *Drosophila* connectome and then
gives it a body it never evolved for. See `RESEARCH.md` for the scientific brief.

---

## Principle I — No overclaiming (NON-NEGOTIABLE)

We simulate **neural dynamics**, not consciousness. The question of insect subjective
experience is unresolved and nothing here settles it.

- Every behaviour must trace to a cited circuit, or be marked `engineering:` in code and
  labelled as an addition in the UI. No exceptions, no silent inventions.
- The word "conscious" may appear in the project title and in framing discussion. It may
  **never** appear in a results claim, a figure caption, or a metric name.
- If a mechanism is our invention, the website says so on the same screen it is shown.

**Rationale:** the whole value of this project is that it is honest. A dragon driven by a real
connectome is interesting. A dragon driven by a plausible-looking fake is worthless, and one
discovered fake discredits every other claim we make.

## Principle II — Reproduce before you extend

Phase 1 reproduces Shiu et al. (sugar → proboscis extension) on the unmodified reference
model, or the project stops and the discrepancy is investigated.

- No downstream phase begins until its upstream validation gate passes.
- The reduced browser network (Tier 2) must match the full offline network (Tier 1) on every
  behavioural primitive within a stated, published error bound.
- A failing gate is a finding, not an obstacle to route around.

**Rationale:** if we cannot reproduce a published result with the published code and the
published data, then every number downstream is fiction — and we would not know it.

## Principle III — The brain is fixed; only the body changes

The dragon experiment is defined by what we refuse to touch.

- The connectome graph, its synaptic signs, and the LIF parameters are **identical** between
  the fly-body control and the dragon-body condition. Diffing the two configs must show
  changes only in morphology, physics, and the DN→effector map.
- The brain–body interface is the descending-neuron vector and nothing else. No side channel
  from world state into the network except through modelled sensory neurons.
- The fly-body control (Phase 4) ships **before** the dragon (Phase 5). Always.

**Rationale:** without an unmodified brain and a matched control, "the fly brain flew the
dragon" is not a measurable claim.

## Principle IV — Pre-registered predictions

Metrics and predictions are written down **before** the run that tests them, in the spec, and
are not edited afterwards.

Standing prediction (v1.0): *the Giant Fiber escape threshold (~40° visual angle) is tuned to
fly body dynamics; in a dragon body, escape success will measurably degrade.*

- Primary metric: escape latency and escape success rate.
- Secondary: survival time, foraging success rate, sleep/wake cycle coherence.
- All measured against the fly-body control. A refuted prediction gets published as-is.

## Principle V — Ponytail: the laziest thing that is still honest

Simplicity is a constraint, not an aspiration. But the ladder shortens the *solution*, never
the *understanding*, and never the items under "When not to be lazy".

- Reuse the reference implementation (Brian2, FlyGym, TresJS) before writing our own.
- NPCs get boids and behaviour trees. **Only the protagonist gets a connectome.**
- Internal states are slow scalar neuromodulators — this is both the cheap choice and the
  biologically correct one. Where those two diverge, correctness wins and the cost is noted.
- Deliberate shortcuts with a known ceiling carry a `ponytail:` comment naming the ceiling and
  the upgrade path.

## Principle VI — Open, cited, non-commercial

- Code: MIT. Data: inherits its source licence and says so.
- **FlyWire data is CC BY-NC 4.0.** The public site therefore carries no ads, no paywall, no
  commercial tier, and displays attribution. Janelia MCNS/MANC (CC BY 4.0) is the licence-clean
  alternative source; the pipeline stays dataset-agnostic so we can switch.
- Every circuit claim in code or UI carries its citation inline.
- Raw data is never committed to git. Fetch scripts + checksums are.

## Principle VII — One runnable check per non-trivial thing

Every branch, loop, parser, or numerical path leaves behind the smallest check that fails if
the logic breaks — an `assert`-based self-check or one small `test_*.py`. No frameworks, no
fixtures, no per-function suites. Trivial one-liners need no test.

Numerical code additionally asserts against a **known published value** wherever one exists
(neuron counts, connection counts, reproduced firing rates).

---

## Declared fudges

Honest simulation of an impossible animal requires declared lies. Each one is a single named
constant, surfaced in the UI, never buried in a derivation.

| Constant | What it fakes | Why |
|---|---|---|
| `LIFT_FUDGE` | dragon-scale flight | square-cube law makes real dragon flight impossible; one multiplier, displayed on the site |

Adding a row requires a constitution amendment.

---

## Governance

This constitution supersedes convenience. Amendments require: the change, its rationale, and
the version bump, committed together. Semantic versioning — MAJOR: a principle removed or
redefined; MINOR: a principle or fudge added; PATCH: clarification.

Every spec, plan, and PR is checked against Principles I–IV before merge.
