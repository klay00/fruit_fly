"""Load the FlyWire v783 connectome into a signed sparse adjacency matrix.

Source data: https://github.com/philshiu/Drosophila_brain_model (MIT code, CC BY-NC data).
Underlying connectome: Dorkenwald et al., Nature 2024 (FlyWire FAFB v783).

The whole brain reduces to three arrays:
    W        signed CSR matrix, W[i, j] = synapse count from i to j, negative if inhibitory
    ids      int64 FlyWire neuron IDs, indexed by matrix row/column
    index_of dict FlyWire ID -> matrix index

That is the entire data model. Everything downstream is a function of W.
"""

from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from scipy import sparse

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
CACHE = RAW.parent / "connectome_783.npz"

# Published reference values, asserted at build time (Constitution VII).
N_NEURONS = 138_639
N_EDGES = 15_091_983


def build(min_synapses: int = 1) -> tuple[sparse.csr_matrix, np.ndarray]:
    """Build the signed adjacency matrix from the raw parquet.

    min_synapses drops weak edges; 1 keeps everything, which is what the
    reference model does. 5 is the common threshold in FlyWire analyses.
    """
    df = pq.read_table(
        RAW / "connectivity_783.parquet",
        columns=[
            "Presynaptic_Index",
            "Postsynaptic_Index",
            "Connectivity",
            "Excitatory",
        ],
    ).to_pandas()
    assert len(df) == N_EDGES, f"expected {N_EDGES} edges, got {len(df)}"

    ids = pd.read_csv(RAW / "completeness_783.csv", index_col=0).index.to_numpy()
    assert len(ids) == N_NEURONS, f"expected {N_NEURONS} neurons, got {len(ids)}"

    # The parquet ships dense 0-based indices already aligned to the completeness
    # file order. Verify rather than trust: a silent misalignment here would
    # rewire the whole brain and still run.
    assert df["Presynaptic_Index"].max() < N_NEURONS
    assert df["Postsynaptic_Index"].max() < N_NEURONS
    assert set(np.unique(df["Excitatory"])) <= {-1, 1}, "sign column is not +/-1"

    keep = df["Connectivity"] >= min_synapses
    df = df[keep]

    w = (df["Connectivity"] * df["Excitatory"]).to_numpy(dtype=np.int32)
    W = sparse.csr_matrix(
        (w, (df["Presynaptic_Index"], df["Postsynaptic_Index"])),
        shape=(N_NEURONS, N_NEURONS),
    )
    return W, ids


def load(min_synapses: int = 1) -> tuple[sparse.csr_matrix, np.ndarray]:
    """Cached build(). Rebuilds if the cache is missing or for a different threshold."""
    cache = CACHE.with_stem(f"{CACHE.stem}_min{min_synapses}")
    if cache.exists():
        z = np.load(cache, allow_pickle=False)
        W = sparse.csr_matrix((z["data"], z["indices"], z["indptr"]), shape=tuple(z["shape"]))
        return W, z["ids"]

    W, ids = build(min_synapses)
    np.savez_compressed(
        cache, data=W.data, indices=W.indices, indptr=W.indptr,
        shape=np.array(W.shape), ids=ids,
    )
    return W, ids


def index_of(ids: np.ndarray) -> dict[int, int]:
    """FlyWire neuron ID -> matrix index."""
    return {int(v): i for i, v in enumerate(ids)}


if __name__ == "__main__":
    W, ids = load()
    exc = int((W.data > 0).sum())
    inh = int((W.data < 0).sum())

    assert W.shape == (N_NEURONS, N_NEURONS)
    assert W.nnz == N_EDGES, f"{W.nnz} nonzeros != {N_EDGES} edges (duplicate edges?)"
    assert exc + inh == W.nnz and inh > 0, "sign split looks wrong"
    # Total synapses should land near the published 54.5M for FlyWire v783.
    total_syn = int(np.abs(W.data).sum())
    assert 4.0e7 < total_syn < 7.0e7, f"total synapses {total_syn:,} outside sane range"

    idx = index_of(ids)
    assert len(idx) == N_NEURONS, "duplicate neuron IDs"
    assert ids[idx[int(ids[12345])]] == ids[12345], "id/index round-trip broken"

    print(f"neurons        {N_NEURONS:,}")
    print(f"edges          {W.nnz:,}")
    print(f"synapses       {total_syn:,}")
    print(f"excitatory     {exc:,} ({exc / W.nnz:.1%})")
    print(f"inhibitory     {inh:,} ({inh / W.nnz:.1%})")
    print(f"density        {W.nnz / N_NEURONS**2:.2e}")
    print("OK")
