
## Log

**2026-09-13 — run 1, 420 games, position-only encoder.** vs random: 61 W / 88 D / 1 L,
+5 material. vs 1-ply greedy: 10 W / 46 D / 214 L, **−26 material**. The fly learned to
capture and never to keep: it values the position after its own move, so a piece it just
hung looks fine until the reply. 270 games against the capturer produced no improvement —
"my piece is attacked" is a two-square relation the projection did not carry.

**Change:** 128 threat bits added to the encoder (mine attacked / theirs attacked), each
with a shared PN group. Gate 2 gap went 0.06 → 0.91. Declared as encoder engineering —
peripheral preprocessing, like the eye computing motion before the brain sees it.

**Also removed:** a rule in `think()` that set mate = +1 and draw = 0 over the network's
value. Small, but it made the chooser part rulebook. The fly now learns mate from the ±1
game reward or walks past it — that is the experiment.

**What decides a move, end to end:** encoder → connectome (KC code) → learned readout →
argmax. Nothing else. No search, no rules, no exploration at play time.
