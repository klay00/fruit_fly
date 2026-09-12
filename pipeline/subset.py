"""Write a reduced connectome in the reference model's own input format.

Reusing model.py's format means the reduced network runs through the *same* simulator as
the full one, so a difference between them is a difference in the network, not in the code
that integrates it. Implementation error is tested separately (Phase 3b).
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
RAW = ROOT / "data" / "raw"

COLS = ["Presynaptic_Index", "Postsynaptic_Index", "Connectivity",
        "Excitatory", "Excitatory x Connectivity"]


def write_subset(name: str, keep: np.ndarray | None, min_synapses: int = 1) -> tuple[Path, Path]:
    """keep = matrix indices to retain (None = all neurons). Returns (comp_csv, con_parquet)."""
    out = RAW / "subsets"
    out.mkdir(parents=True, exist_ok=True)
    p_comp, p_con = out / f"{name}_comp.csv", out / f"{name}_con.parquet"
    if p_comp.exists() and p_con.exists():
        return p_comp, p_con

    comp = pd.read_csv(RAW / "completeness_783.csv", index_col=0)
    df = pq.read_table(RAW / "connectivity_783.parquet", columns=COLS).to_pandas()

    if keep is None:
        keep = np.arange(len(comp))
    keep = np.sort(np.asarray(keep))

    # Remap old dense indices -> new dense indices, -1 for dropped neurons.
    remap = np.full(len(comp), -1, dtype=np.int64)
    remap[keep] = np.arange(len(keep))

    pre = remap[df["Presynaptic_Index"].to_numpy()]
    post = remap[df["Postsynaptic_Index"].to_numpy()]
    mask = (pre >= 0) & (post >= 0) & (df["Connectivity"].to_numpy() >= min_synapses)

    sub = df[mask].copy()
    sub["Presynaptic_Index"] = pre[mask]
    sub["Postsynaptic_Index"] = post[mask]

    comp.iloc[keep].to_csv(p_comp)
    sub.reset_index(drop=True).to_parquet(p_con, index=False)
    assert sub["Presynaptic_Index"].max() < len(keep)
    print(f"  {name}: {len(keep):,} neurons, {len(sub):,} edges")
    return p_comp, p_con
