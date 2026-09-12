"""Phase 3b gate: does our own engine compute what Brian2 computes?

This is the second, separate error term. Phase 3a asked whether the reduced NETWORK behaves
like the full one; this asks whether our LIF ENGINE behaves like the reference SIMULATOR, on
the identical network. Keeping them apart means a discrepancy has one cause, not two.

Both run on condition D (corridor nodes, all synapses) written by pipeline/subset.py,
so the wiring is byte-identical.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import sparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.lif import Network  # noqa: E402
from pipeline.neurons import ID_MN9, NEU_SUGAR  # noqa: E402

SUB = ROOT / "data" / "raw" / "subsets"
OUT = ROOT / "results" / "phase3"
RATES = [28, 37, 50, 100, 150, 250]
TRIALS = 10
MS = 1000.0


def load_subset(name: str):
    ids = pd.read_csv(SUB / f"{name}_comp.csv", index_col=0).index.to_numpy()
    con = pd.read_parquet(SUB / f"{name}_con.parquet")
    n = len(ids)
    W = sparse.csr_matrix(
        (con["Excitatory x Connectivity"].to_numpy(dtype=np.float32),
         (con["Presynaptic_Index"].to_numpy(), con["Postsynaptic_Index"].to_numpy())),
        shape=(n, n))
    idx = {int(v): i for i, v in enumerate(ids)}
    return W, ids, idx


def main() -> None:
    W, ids, idx = load_subset("corridor3_all")
    sugar = np.array([idx[n] for n in NEU_SUGAR if n in idx])
    mn9 = idx[ID_MN9]
    print(f"corridor3_all: {W.shape[0]:,} neurons, {W.nnz:,} edges, "
          f"{len(sugar)} sugar driven, MN9 at index {mn9}")

    ours = []
    for r in RATES:
        net = Network(W, dt=0.1, seed=r)
        rates = net.rates(MS, driven=sugar, rate_hz=float(r), trials=TRIALS)
        ours.append({"drive_hz": r, "mn9_hz": round(float(rates[mn9]), 2),
                     "active": int((rates > 0).sum())})
        print(f"  ours  {r:>4} Hz -> MN9 {rates[mn9]:6.2f} Hz, {ours[-1]['active']:>5} active")

    ref = json.loads((OUT / "reduction.json").read_text())["D_corridor3_allsyn"]
    refm = {c["drive_hz"]: c["mn9_hz"] for c in ref}
    refa = {c["drive_hz"]: c["active"] for c in ref}

    print("\n" + "=" * 62)
    print("PHASE 3b GATE — implementation error (ours vs Brian2, same wiring)")
    print("=" * 62)
    print(f"{'drive':>6} {'Brian2':>8} {'ours':>8} {'diff':>8}   {'active B2':>9} {'ours':>6}")
    errs, rels = [], []
    for c in ours:
        r = c["drive_hz"]
        b, o = refm[r], c["mn9_hz"]
        errs.append(abs(o - b))
        if b > 1:
            rels.append(abs(o - b) / b)
        print(f"{r:>6} {b:>8.2f} {o:>8.2f} {o - b:>+8.2f}   {refa[r]:>9} {c['active']:>6}")

    med = float(np.median(rels)) if rels else float("nan")
    print(f"\nmax abs error    {max(errs):.2f} Hz")
    print(f"median rel error {med:.1%}")

    (OUT / "implementation.json").write_text(json.dumps(
        {"ours": ours, "brian2": ref, "max_abs_hz": max(errs), "median_rel": med}, indent=2))

    # Gate: our engine must agree with Brian2 within trial-to-trial variance (sd ~4 Hz at
    # these rates), and must reproduce the threshold, not just the saturated plateau.
    assert med < 0.20, f"median relative error {med:.1%} exceeds the 20% bound"
    thr_b = min([r for r, v in refm.items() if v >= 1.0], default=None)
    thr_o = min([c["drive_hz"] for c in ours if c["mn9_hz"] >= 1.0], default=None)
    print(f"threshold: Brian2 {thr_b} Hz, ours {thr_o} Hz")
    assert thr_o == thr_b, f"threshold moved: Brian2 {thr_b} Hz vs ours {thr_o} Hz"
    print("\nGATE PASSED: engine agrees with the reference simulator.")


if __name__ == "__main__":
    main()
