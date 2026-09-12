"""Phase 1 gate: reproduce Shiu et al. — sugar-sensing neurons drive proboscis extension.

This is the validation gate of Constitution Principle II. We import the unmodified
reference model (philshiu/Drosophila_brain_model, MIT) rather than writing our own.
If MN9 does not fire when the sugar neurons are stimulated, the project stops here.

  uv run --python 3.12 --with brian2 --with pandas --with pyarrow --with joblib \
      python experiments/phase1_reproduce.py [--version 630|783] [--runs N]
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "reference"))
sys.path.insert(0, str(ROOT))

from brian2 import Hz, ms  # noqa: E402
from model import default_params, run_exp  # noqa: E402
import utils as utl  # noqa: E402

from pipeline.neurons import ID_MN9, NEU_SUGAR  # noqa: E402

DATA = {
    "630": ("completeness_630.csv", "connectivity_630.parquet"),
    "783": ("completeness_783.csv", "connectivity_783.parquet"),
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", choices=["630", "783"], default="630")
    ap.add_argument("--runs", type=int, default=30, help="trials; reference uses 30")
    ap.add_argument("--rate", type=float, default=150.0, help="Poisson drive [Hz]")
    ap.add_argument("--match-neurons", action="store_true",
                    help="use only sugar neurons present in BOTH versions, isolating the\n"
                         "effect of the connectome bump from the effect of a missing neuron")
    args = ap.parse_args()

    comp, con = DATA[args.version]
    name = f"sugarR_v{args.version}_{args.runs}x_{args.rate:g}Hz"
    if args.match_neurons:
        name += "_matched"
    out = ROOT / "results" / "phase1"
    out.mkdir(parents=True, exist_ok=True)  # reference run_exp does not create it

    params = dict(default_params)
    params["n_run"] = args.runs
    params["r_poi"] = args.rate * Hz

    # Neurons dropped by a connectome version bump are a finding, not an error.
    import pandas as pd
    present = set(pd.read_csv(ROOT / "data" / "raw" / comp, index_col=0).index.astype("int64"))
    sugar = [n for n in NEU_SUGAR if n in present]
    if len(sugar) < len(NEU_SUGAR):
        print(f"note: {len(NEU_SUGAR) - len(sugar)} sugar neuron(s) absent from v{args.version}")
    if args.match_neurons:
        both = set.intersection(*(
            set(pd.read_csv(ROOT / "data" / "raw" / c, index_col=0).index.astype("int64"))
            for c, _ in DATA.values()))
        sugar = [n for n in NEU_SUGAR if n in both]
        print(f"matched mode: driving {len(sugar)} neurons common to all versions")
    assert ID_MN9 in present, f"MN9 absent from v{args.version} — readout impossible"

    run_exp(
        exp_name=name, neu_exc=sugar,
        path_res=str(out),
        path_comp=str(ROOT / "data" / "raw" / comp),
        path_con=str(ROOT / "data" / "raw" / con),
        params=params, n_proc=-1, force_overwrite=True,
    )

    df_spike = utl.load_exps([str(out / f"{name}.parquet")])
    df_rate, df_std = utl.get_rate(df_spike, t_run=params["t_run"], n_run=params["n_run"])

    mn9 = float(df_rate.loc[ID_MN9, name]) if ID_MN9 in df_rate.index else 0.0
    active = int((df_rate[name] > 0).sum())

    print(f"\n{'=' * 52}\nPHASE 1 GATE — {name}\n{'=' * 52}")
    print(f"total spikes        {len(df_spike):,}")
    print(f"neurons active      {active:,}")
    print(f"MN9 firing rate     {mn9:.2f} Hz  (sd {float(df_std.loc[ID_MN9, name]):.2f})")

    # The gate. Reference: sugar stimulation drives MN9; ~400 neurons become active.
    assert mn9 > 0, "GATE FAILED: MN9 silent — sugar does not reach the proboscis"
    assert 100 < active < 2000, f"GATE FAILED: {active} active neurons, expected ~400"
    print("\nGATE PASSED: sugar -> proboscis extension reproduced.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
