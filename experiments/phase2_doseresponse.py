"""Phase 2a: does hunger actually change what the connectome outputs?

Hunger in the fly raises the gain of sugar-sensing pathways (NPF and AKH signalling;
Pool & Scott / Lin et al., Open Biology 2019). In the reference model the one available
handle on that pathway is the Poisson drive rate on the sugar neurons, so we sweep it and
measure MN9. The result is a measured dose-response curve, not an assumed one.

  uv run --python 3.12 --with brian2 --with pandas --with pyarrow --with joblib --with numpy \
      python experiments/phase2_doseresponse.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "reference"))
sys.path.insert(0, str(ROOT))

from brian2 import Hz  # noqa: E402
from model import default_params, run_exp  # noqa: E402
import utils as utl  # noqa: E402
from pipeline.neurons import ID_MN9, NEU_SUGAR  # noqa: E402

RATES = [25, 50, 100, 150, 200, 250]  # Hz of sugar-pathway drive
FINE = [28, 31, 34, 37, 40, 45]       # --fine: pin the feeding threshold in the 25-50 gap
N_RUN = 10                            # fewer trials than Phase 1: we need a curve, not a datum
OUT = ROOT / "results" / "phase2"


def main() -> None:
    import pandas as pd
    fine = "--fine" in sys.argv
    rates, tag = (FINE, "fine") if fine else (RATES, "coarse")
    OUT.mkdir(parents=True, exist_ok=True)
    comp = ROOT / "data" / "raw" / "completeness_783.csv"
    con = ROOT / "data" / "raw" / "connectivity_783.parquet"
    present = set(pd.read_csv(comp, index_col=0).index.astype("int64"))
    sugar = [n for n in NEU_SUGAR if n in present]

    curve = []
    for r in rates:
        name = f"dose_{r}Hz"
        params = dict(default_params)
        params["n_run"], params["r_poi"] = N_RUN, r * Hz
        run_exp(exp_name=name, neu_exc=sugar, path_res=str(OUT),
                path_comp=str(comp), path_con=str(con),
                params=params, n_proc=-1, force_overwrite=True)

        df = utl.load_exps([str(OUT / f"{name}.parquet")])
        rate, std = utl.get_rate(df, t_run=params["t_run"], n_run=N_RUN)
        mn9 = float(rate.loc[ID_MN9, name]) if ID_MN9 in rate.index else 0.0
        sd = float(std.loc[ID_MN9, name]) if ID_MN9 in std.index else 0.0
        curve.append({"drive_hz": r, "mn9_hz": round(mn9, 2), "mn9_sd": round(sd, 2),
                      "active": int((rate[name] > 0).sum())})
        print(f"  drive {r:>4} Hz -> MN9 {mn9:6.2f} Hz (sd {sd:.2f}), {curve[-1]['active']} active")

    (OUT / f"doseresponse_{tag}.json").write_text(json.dumps(curve, indent=2))

    rates = [c["mn9_hz"] for c in curve]
    mn9 = [c["mn9_hz"] for c in curve]
    assert mn9 == sorted(mn9), f"MN9 not monotonic in drive: {mn9}"
    assert mn9[-1] > mn9[0] + 5, "drive barely moves MN9 — hunger has no handle here"
    fired = [c["drive_hz"] for c in curve if c["mn9_hz"] > 0]
    silent = [c["drive_hz"] for c in curve if c["mn9_hz"] == 0]
    if fired and silent:
        print(f"\nfeeding threshold between {max(silent)} and {min(fired)} Hz of drive")
    print(f"MN9 {mn9[0]:.1f} -> {mn9[-1]:.1f} Hz across {rates[0]}-{rates[-1]} Hz")


if __name__ == "__main__":
    main()
