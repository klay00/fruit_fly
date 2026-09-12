"""Phase 3c gate: is the C engine both correct and fast enough for the browser?

Correctness is checked the same way 3b was -- against Brian2 on identical wiring -- because
a faster engine that quietly changes the answer is worse than a slow one. Speed is measured
on the real multimodal corridor, which is the network the browser must actually run.
"""

import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.lif import Network as PyNet  # noqa: E402
from pipeline.lif_c import Network as CNet  # noqa: E402
from pipeline.neurons import ID_MN9, NEU_SUGAR  # noqa: E402
from experiments.phase3b_implementation import RATES, TRIALS, MS, load_subset, OUT  # noqa: E402


def main() -> None:
    W, ids, idx = load_subset("corridor3_all")
    sugar = np.array([idx[n] for n in NEU_SUGAR if n in idx])
    mn9 = idx[ID_MN9]
    ref = {c["drive_hz"]: c["mn9_hz"]
           for c in json.loads((OUT / "reduction.json").read_text())["D_corridor3_allsyn"]}

    print(f"corridor3_all: {W.shape[0]:,} neurons, {W.nnz:,} edges\n")
    print(f"{'drive':>6} {'Brian2':>8} {'python':>8} {'C':>8} {'C-B2':>8}")
    errs, rels = [], []
    cur = []
    for r in RATES:
        c = CNet(W, dt=0.1, seed=r).rates(MS, driven=sugar, rate_hz=float(r), trials=TRIALS)[mn9]
        p = PyNet(W, dt=0.1, seed=r).rates(MS, driven=sugar, rate_hz=float(r), trials=3)[mn9]
        cur.append({"drive_hz": r, "mn9_hz": round(float(c), 2)})
        errs.append(abs(c - ref[r]))
        if ref[r] > 1:
            rels.append(abs(c - ref[r]) / ref[r])
        print(f"{r:>6} {ref[r]:>8.2f} {p:>8.2f} {c:>8.2f} {c - ref[r]:>+8.2f}")

    med = float(np.median(rels))
    print(f"\nmax abs error {max(errs):.2f} Hz · median relative {med:.1%}")
    thr_b = min([r for r, v in ref.items() if v >= 1.0])
    thr_c = min([c["drive_hz"] for c in cur if c["mn9_hz"] >= 1.0], default=None)
    print(f"threshold: Brian2 {thr_b} Hz, C {thr_c} Hz")
    assert med < 0.20, f"median relative error {med:.1%} exceeds the 20% bound"
    assert thr_c == thr_b, f"threshold moved: {thr_b} -> {thr_c}"

    print("\n--- speed, on the networks that matter ---")
    from pipeline.annotations import table, indices
    from pipeline.connectome import index_of, load
    from pipeline.reduce import corridor
    W5, gids = load(5); W1, _ = load(1)
    gidx = index_of(gids); a = table()

    def by_class(sub):
        m = a["cell_class"].astype(str).str.contains(sub, case=False, na=False)
        return np.array(sorted({gidx[i] for i in a.loc[m, "root_id"].astype("int64") if i in gidx}))

    def by_type(ts):
        r = a.loc[a["cell_type"].astype(str).isin(ts), "root_id"].astype("int64")
        return np.array(sorted({gidx[i] for i in r if i in gidx}))

    dns = indices(gidx, super_class="descending")
    seeds = np.union1d(np.union1d(np.union1d(by_class("gustatory"), by_class("olfactory")),
                                  by_class("mechanosensory")), by_type(["LC4", "LPLC2"]))
    keep = corridor(W5, list(seeds), list(dns), 2, "corridor")
    Wm = W1[keep][:, keep].astype(np.float32)
    kset = {int(k): i for i, k in enumerate(keep)}
    drv = np.array([kset[int(k)] for k in by_class("gustatory") if int(k) in kset], dtype=np.int32)

    for label, Wx, d in (("sugar corridor", W, sugar.astype(np.int32)),
                         ("multimodal corridor", Wm, drv)):
        net = CNet(Wx, dt=0.1, seed=1)
        net.rates(100.0, driven=d, rate_hz=150.0)          # warm
        t0 = time.perf_counter()
        net.rates(1000.0, driven=d, rate_hz=150.0)
        el = time.perf_counter() - t0
        print(f"  {label:<22} {Wx.shape[0]:>7,} neurons {Wx.nnz:>10,} edges  "
              f"{el:.2f} s/s  ->  {1/el:5.2f}x real time")
    print("\nGATE PASSED: C engine matches the reference and its speed is measured above.")


if __name__ == "__main__":
    main()
