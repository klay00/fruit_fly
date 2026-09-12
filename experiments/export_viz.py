"""Export Phase 1 spike data for the browser visualisation.

Neurons are ordered by synaptic depth: BFS hop distance from the driven sugar
neurons over the real connectome. That ordering is what turns a raster plot into
a picture of a signal descending through the network to the motor neuron.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.sparse import csgraph

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.connectome import index_of, load  # noqa: E402
from pipeline.neurons import ID_MN9, NEU_SUGAR  # noqa: E402

TRIAL = 0
SRC = ROOT / "results" / "phase1" / "sugarR_v783_30x_150Hz.parquet"
OUT = ROOT / "web" / "public" / "data" / "phase1.json"


def main() -> None:
    df = pd.read_parquet(SRC)
    n_trials = df["trial"].nunique()
    W, ids = load()
    idx = index_of(ids)

    # Synaptic depth from the sugar neurons. Unweighted BFS on the real graph:
    # we want hop count, not signal strength.
    seeds = [idx[n] for n in NEU_SUGAR if n in idx]
    dist = csgraph.shortest_path(
        (W != 0).astype(np.int8), method="D", directed=True, unweighted=True, indices=seeds
    ).min(axis=0)

    active = df["flywire_id"].unique()
    rate = df.groupby("flywire_id").size() / n_trials  # spikes/s, 1 s trials

    rows = []
    for fid in active:
        i = idx.get(int(fid))
        d = dist[i] if i is not None else np.inf
        rows.append({
            "id": str(fid),
            "depth": int(d) if np.isfinite(d) else -1,
            "rate": round(float(rate[fid]), 2),
            "sugar": bool(fid in NEU_SUGAR),
            "mn9": bool(fid == ID_MN9),
        })
    # Order: sugar first, then by depth, then by rate. This is the y-axis.
    rows.sort(key=lambda r: (not r["sugar"], r["depth"] if r["depth"] >= 0 else 99, -r["rate"]))
    order = {r["id"]: k for k, r in enumerate(rows)}

    one = df[df["trial"] == TRIAL]
    spikes = [[order[str(f)], round(float(t), 4)] for f, t in zip(one["flywire_id"], one["t"])]
    spikes.sort(key=lambda s: s[1])

    # First-spike latency per depth band: the propagation delay, measured.
    lat = {}
    first = one.groupby("flywire_id")["t"].min()
    for r in rows:
        fid = int(r["id"])
        if fid in first.index and r["depth"] >= 0:
            lat.setdefault(r["depth"], []).append(float(first[fid]))

    payload = {
        "meta": {
            "dataset": "FlyWire v783",
            "experiment": "sugarR 150 Hz Poisson, 30 x 1 s trials",
            "trial_shown": TRIAL,
            "n_trials": n_trials,
            "total_spikes": int(len(df)),
            "neurons_active": int(len(active)),
            "neurons_total": int(W.shape[0]),
            "mn9_rate": round(float(rate.get(ID_MN9, 0.0)), 2),
            "sugar_driven": int(len(seeds)),
        },
        "neurons": rows,
        "spikes": spikes,
        "latency_by_depth": {
            str(d): round(float(np.median(v)) * 1000, 1) for d, v in sorted(lat.items())
        },
        "depth_counts": {
            str(d): sum(1 for r in rows if r["depth"] == d)
            for d in sorted({r["depth"] for r in rows})
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")))

    assert len(spikes) > 1000, "suspiciously few spikes in the shown trial"
    assert any(r["mn9"] for r in rows), "MN9 missing from the export"
    assert payload["latency_by_depth"], "no latency data — depth computation failed"

    print(f"{OUT.relative_to(ROOT)}  {OUT.stat().st_size / 1024:.0f} KB")
    print(f"neurons {len(rows)}  spikes(trial {TRIAL}) {len(spikes)}")
    print(f"depth counts      {payload['depth_counts']}")
    print(f"median 1st spike  {payload['latency_by_depth']} ms")
    print(f"MN9 depth         {[r['depth'] for r in rows if r['mn9']][0]}")


if __name__ == "__main__":
    main()
