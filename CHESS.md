# Fly Chess — can a fly's real learning circuit learn chess?

**Replaces the dragon project. Same connectome, same engine, new question.**

## The idea

Not a neural net shaped like a fly. The fly's actual learning circuit — the mushroom body,
as wired in FlyWire v783 — with plasticity only where the fly has it, taught chess by
reward, then played against.

The question is not "can it beat you". It is **how far can 5,177 Kenyon cells get**, and
what does its play look like at each stage.

## What the fly has (all present in the data)

| Population | Count | Role |
|---|---|---|
| Projection neurons (PN) | 687 | input |
| Kenyon cells (KC) | 5,177 | sparse expansion, ~5 % active on any input |
| MBONs | 96 | readout — approach / avoid |
| Dopamine neurons (PAM/PPL1) | 323 | reward / punishment signal |

**KC→MBON synapses are the only plastic ones.** Dopamine-gated depression (Aso et al. 2014;
Hige et al. 2015). Everything else stays the fixed connectome. That is the fly's learning
rule, and it is the only one we use.

## Mapping chess onto it

```
board (64 sq × 12 piece types = 768 bits)
  → PN drive                       ours: a fixed random projection, declared
  → KC sparse code                 the connectome does this, no choice of ours
  → MBON rates                     the connectome does this
  → value = Σ w·MBON               w is the ONLY thing that learns
```

Move choice: for each legal move, run the resulting position through the network, read a
value, pick the best with ε-exploration. **No search tree.** One position → one value, the
way a fly judges one odour. That is a deliberate constraint, not an oversight.

Learning: after each game, `Δw = η · reward · MBON_activity` on the positions visited,
discounted toward the outcome. Reward = ±1 for win/loss, plus material change per move so
the signal is not one bit per 40 moves.

## Honest limits, stated before any result

- The PN encoding is ours. The fly has no chess sense organ. Declared as engineering.
- 5,177 KCs is a small hidden layer with fixed, random-ish wiring. Expect it to learn
  material and simple captures. It will not beat a competent beginner.
- No search means no tactics deeper than one ply. Forks and pins are beyond it by design.
- "The fly learned chess" is never a claim this project makes. "The fly's learning circuit
  reached rating X against a random mover" is.

## Phases and gates

**1. Circuit.** Extract PN→KC→MBON corridor. **Gate:** KC sparseness under board input is
2–10 % — the biological range. If the wiring cannot produce sparse codes from our input, the
encoding is wrong and nothing downstream means anything.

**2. Learning.** Encoder + readout + rule. **Gate:** trained on captures only, the value of
a position after winning a queen exceeds one after losing it. Proves the rule can move
weights in the right direction at all.

**3. Training.** Self-play and play vs. a random mover, then vs. a 1-ply material bot.
**Gate:** > 70 % vs. random. Log a rating curve; publish it whatever it shows.

**4. Play.** Board, fly, and a decision view: every legal move with its value, the KC
population lighting up, MBON bars, the chosen move. **Gate:** a full game, human vs. fly,
with the fly moving its own pieces.

## Stack

- Rules: `chess.js` — a chess rules engine is not a few lines.
- Brain: `engine/lif.c` (validated, phases 3–4) over the MB corridor.
- Training: Node, headless, the same wasm the page runs.
- Page: Nuxt + TresJS, 3D board and fly; decision panel in HTML.

## What carries over

`pipeline/` (data, reduction, engine), `engine/lif.c`, the annotation tooling, and every
gate result in `results/phase0–3`. The dragon page and phases 4–6 are archived, not deleted.
