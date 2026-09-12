"""Condition D: corridor nodes selected on the strong-edge graph, but ALL edges kept.

Phase 3a isolated the damage: thresholding edges at >=5 synapses moved the feeding threshold
from 37 Hz to 50 Hz, while pruning 94.7% of neurons cost nothing. The weak 1-4 synapse
connections are what carry near-threshold signal, and the LIF constants explain why —
transmission needs convergence, and convergence is built out of many weak edges.

So: use the strong-edge graph only to decide WHICH neurons matter (topology), then keep
every synapse among them (dynamics).
"""

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "reference"))
sys.path.insert(0, str(ROOT))

from pipeline.connectome import index_of, load  # noqa: E402
from pipeline.neurons import ID_MN9, NEU_SUGAR  # noqa: E402
from pipeline.reduce import corridor  # noqa: E402
from pipeline.subset import write_subset  # noqa: E402
from experiments.phase3a_reduction import OUT, sweep, threshold_of  # noqa: E402


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    W1, ids = load(1)
    W5, _ = load(5)
    idx = index_of(ids)
    seeds = [idx[n] for n in NEU_SUGAR if n in idx]

    keep = corridor(W5, seeds, [idx[ID_MN9]], k=3, strategy="corridor")
    print("building subset:")
    p_comp, p_con = write_subset("corridor3_all", keep, min_synapses=1)

    res = json.loads((OUT / "reduction.json").read_text())
    res["D_corridor3_allsyn"] = sweep("D_corr3_all", p_comp, p_con, NEU_SUGAR)
    (OUT / "reduction.json").write_text(json.dumps(res, indent=2))

    base = {c["drive_hz"]: c["mn9_hz"] for c in res["A_full_min1"]}
    thr_base = threshold_of(res["A_full_min1"])
    print("\n" + "=" * 66)
    print("PHASE 3a GATE — condition D")
    print("=" * 66)
    print(f"{'cond':<22} {'thresh':>7} {'max abs':>8} {'med rel':>8}  neurons")
    for label, n in (("B_min5_full", 138_639), ("C_corridor3", 7_402),
                     ("D_corridor3_allsyn", len(keep))):
        cur = {c["drive_hz"]: c["mn9_hz"] for c in res[label]}
        shared = sorted(set(base) & set(cur))
        errs = [abs(cur[r] - base[r]) for r in shared]
        rel = [abs(cur[r] - base[r]) / base[r] for r in shared if base[r] > 1]
        print(f"{label:<22} {str(threshold_of(res[label])) + ' Hz':>7} "
              f"{max(errs):>7.2f}  {np.median(rel):>7.1%}  {n:,}")
    print(f"\nbaseline threshold {thr_base} Hz")
    for r in sorted(base):
        d = {c["drive_hz"]: c["mn9_hz"] for c in res["D_corridor3_allsyn"]}.get(r)
        if d is not None:
            print(f"  {r:>4} Hz  base {base[r]:6.2f} -> D {d:6.2f}  ({d - base[r]:+6.2f})")

    d = res["D_corridor3_allsyn"]
    thr_d = threshold_of(d)
    dm = {c["drive_hz"]: c["mn9_hz"] for c in d}
    rel = [abs(dm[r] - base[r]) / base[r] for r in sorted(set(base) & set(dm)) if base[r] > 1]
    assert thr_d == thr_base, f"GATE FAILED: threshold moved {thr_base} -> {thr_d} Hz"
    assert np.median(rel) < 0.20, f"GATE FAILED: median relative error {np.median(rel):.1%}"
    print(f"\nGATE PASSED: threshold preserved at {thr_d} Hz, "
          f"median relative error {np.median(rel):.1%}, {len(keep):,} neurons.")


if __name__ == "__main__":
    main()
