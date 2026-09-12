"""Phase 3a gate: how much does reducing the network change what it does?

Two reductions are stacked in any practical subgraph, and they are measured separately so
a failure has one identifiable cause:
    B  full node set, edges thresholded at >=5 synapses   -> edge-threshold error alone
    C  corridor k=3 on top of that threshold              -> node-pruning error on top
Condition A (full network, all edges) is the Phase 1/2 baseline already on disk.

The check is not just mean MN9 rate: Phase 2 found the connectome implements a sigmoid
feeding threshold, so the reduction must preserve the THRESHOLD, not only the averages.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "reference"))
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
from brian2 import Hz  # noqa: E402
from model import default_params, run_exp  # noqa: E402
import utils as utl  # noqa: E402
from pipeline.connectome import index_of, load  # noqa: E402
from pipeline.neurons import ID_MN9, NEU_SUGAR  # noqa: E402
from pipeline.reduce import corridor  # noqa: E402
from pipeline.subset import write_subset  # noqa: E402

RATES = [28, 37, 50, 100, 150, 250]
N_RUN = 10
OUT = ROOT / "results" / "phase3"


def sweep(label, p_comp, p_con, sugar_ids):
    import pandas as pd
    present = set(pd.read_csv(p_comp, index_col=0).index.astype("int64"))
    sugar = [n for n in sugar_ids if n in present]
    assert ID_MN9 in present, f"{label}: MN9 was pruned — readout impossible"
    curve = []
    for r in RATES:
        name = f"{label}_{r}Hz"
        params = dict(default_params)
        params["n_run"], params["r_poi"] = N_RUN, r * Hz
        run_exp(exp_name=name, neu_exc=sugar, path_res=str(OUT),
                path_comp=str(p_comp), path_con=str(p_con),
                params=params, n_proc=-1, force_overwrite=True)
        df = utl.load_exps([str(OUT / f"{name}.parquet")])
        rate, std = utl.get_rate(df, t_run=params["t_run"], n_run=N_RUN)
        mn9 = float(rate.loc[ID_MN9, name]) if ID_MN9 in rate.index else 0.0
        sd = float(std.loc[ID_MN9, name]) if ID_MN9 in std.index else 0.0
        curve.append({"drive_hz": r, "mn9_hz": round(mn9, 2), "mn9_sd": round(sd, 2),
                      "active": int((rate[name] > 0).sum())})
        print(f"  {label:<14} {r:>4} Hz -> MN9 {mn9:6.2f} (sd {sd:4.2f}), {curve[-1]['active']:>5} active")
    return curve


def threshold_of(curve, crit=1.0):
    """Lowest drive at which MN9 exceeds crit Hz — the feeding threshold."""
    hits = [c["drive_hz"] for c in curve if c["mn9_hz"] >= crit]
    return min(hits) if hits else None


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    W, ids = load(1)
    idx = index_of(ids)
    seeds = [idx[n] for n in NEU_SUGAR if n in idx]

    print("building subsets:")
    W5, _ = load(5)
    keep = corridor(W5, seeds, [idx[ID_MN9]], k=3, strategy="corridor")
    kept_ids = set(int(ids[i]) for i in keep)
    print(f"  corridor keeps {len(keep):,} of {W.shape[0]:,} neurons "
          f"({len(keep)/W.shape[0]:.2%}), incl. {len(kept_ids & set(NEU_SUGAR))}/21 sugar")

    conds = {
        "B_min5_full": write_subset("min5_full", None, min_synapses=5),
        "C_corridor3": write_subset("corridor3", keep, min_synapses=5),
    }

    results = {}
    for label, (p_comp, p_con) in conds.items():
        results[label] = sweep(label, p_comp, p_con, NEU_SUGAR)

    # Condition A baseline, already measured in Phase 2 (same v783, same N_RUN).
    a = json.loads((ROOT / "results" / "phase2" / "doseresponse_coarse.json").read_text())
    fine = json.loads((ROOT / "results" / "phase2" / "doseresponse_fine.json").read_text())
    results["A_full_min1"] = sorted(a + [c for c in fine if c["drive_hz"] in RATES],
                                    key=lambda c: c["drive_hz"])
    (OUT / "reduction.json").write_text(json.dumps(results, indent=2))

    print("\n" + "=" * 66)
    print("PHASE 3a GATE — reduction error")
    print("=" * 66)
    base = {c["drive_hz"]: c["mn9_hz"] for c in results["A_full_min1"]}
    for label in ("B_min5_full", "C_corridor3"):
        cur = {c["drive_hz"]: c["mn9_hz"] for c in results[label]}
        shared = sorted(set(base) & set(cur))
        errs = [abs(cur[r] - base[r]) for r in shared]
        rel = [abs(cur[r] - base[r]) / base[r] for r in shared if base[r] > 1]
        thr = threshold_of(results[label])
        print(f"\n{label}")
        print(f"  threshold        {thr} Hz   (baseline {threshold_of(results['A_full_min1'])} Hz)")
        print(f"  max abs error    {max(errs):.2f} Hz")
        print(f"  median rel error {np.median(rel):.1%}" if rel else "  no comparable points")
        for r in shared:
            print(f"    {r:>4} Hz  base {base[r]:6.2f} -> {cur[r]:6.2f}  "
                  f"({cur[r]-base[r]:+6.2f})")


if __name__ == "__main__":
    main()
