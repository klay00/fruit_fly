"""Cell-type annotations for FlyWire v783 (Schlegel et al., Nature 2024).

Source: github.com/flyconnectome/flywire_annotations, supplemental file 1. This is what
turns anonymous neuron IDs into populations we can address by role -- descending neurons,
motor neurons, sensory classes -- which the connectivity data alone does not carry.
"""

import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
TSV = ROOT / "data" / "raw" / "annotations_783.tsv"


@lru_cache(maxsize=1)
def table() -> pd.DataFrame:
    return pd.read_csv(TSV, sep="\t", low_memory=False)


def indices(idx: dict[int, int], **filters) -> np.ndarray:
    """Matrix indices of annotated neurons matching column=value filters.

    e.g. indices(idx, super_class="descending") -> the ~1,300 DNs present in the matrix.
    A value may be a string or a collection of strings.
    """
    a = table()
    mask = np.ones(len(a), dtype=bool)
    for col, want in filters.items():
        want = {want} if isinstance(want, str) else set(want)
        mask &= a[col].isin(want).to_numpy()
    ids = a.loc[mask, "root_id"].astype("int64")
    return np.array(sorted({idx[i] for i in ids if i in idx}), dtype=np.int64)


if __name__ == "__main__":
    from pipeline.connectome import index_of, load
    _, ids = load(5)
    idx = index_of(ids)
    a = table()
    print(f"annotations {len(a):,} rows · matrix {len(ids):,} neurons")
    for sc in ("descending", "motor", "sensory", "ascending", "visual_projection"):
        got = indices(idx, super_class=sc)
        tot = int((a["super_class"] == sc).sum())
        print(f"  {sc:<18} {tot:>7,} annotated  {len(got):>7,} in matrix "
              f"({len(got)/max(tot,1):.1%})")
    assert len(indices(idx, super_class="descending")) > 1000, "DNs missing from the matrix"
