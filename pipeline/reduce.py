"""Reduce the connectome to the subgraph that carries a given sensorimotor pathway.

The reduction is defined graph-theoretically, not fitted to recorded activity: keep the
neurons that lie on a path from the sensory seeds to the motor targets. Deriving it from
the wiring rather than from the spikes is what lets the result be checked against the full
network instead of merely agreeing with the data it was built from.

Two strategies, both reported so the choice is visible:
  ball       everything within k hops downstream of the seeds
  corridor   ball INTERSECTED with everything within k hops upstream of the targets
"""

import sys
from pathlib import Path

import numpy as np
from scipy import sparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.connectome import index_of, load  # noqa: E402
from pipeline.neurons import ID_MN9, NEU_SUGAR  # noqa: E402


def _hops(A: sparse.csr_matrix, seeds: list[int], k: int) -> np.ndarray:
    """Boolean mask of nodes reachable from seeds in <= k hops (BFS by frontier)."""
    seen = np.zeros(A.shape[0], dtype=bool)
    seen[seeds] = True
    frontier = seen.copy()
    for _ in range(k):
        nxt = (A.T @ frontier.astype(np.int8)) > 0  # one hop along edge direction
        frontier = nxt & ~seen
        if not frontier.any():
            break
        seen |= frontier
    return seen


def corridor(W: sparse.csr_matrix, seeds: list[int], targets: list[int],
             k: int, strategy: str = "corridor") -> np.ndarray:
    """Indices to keep, sorted. Seeds and targets are always included."""
    A = (W != 0).astype(np.int8)
    fwd = _hops(A, seeds, k)
    if strategy == "ball":
        keep = fwd
    else:
        bwd = _hops(A.T.tocsr(), targets, k)  # upstream of the targets
        keep = fwd & bwd
    keep[seeds] = True
    keep[targets] = True
    return np.flatnonzero(keep)


def survey(min_synapses: int = 1) -> None:
    W, ids = load(min_synapses)
    idx = index_of(ids)
    seeds = [idx[n] for n in NEU_SUGAR if n in idx]
    targets = [idx[ID_MN9]]
    n = W.shape[0]
    print(f"\nfull network: {n:,} neurons, {W.nnz:,} edges  (min_synapses={min_synapses})")
    print(f"{'strategy':<10} {'k':>2} {'neurons':>9} {'edges':>11} {'% of full':>10}")
    for strategy in ("corridor", "ball"):
        for k in (2, 3, 4, 5):
            keep = corridor(W, seeds, targets, k, strategy)
            sub = W[keep][:, keep]
            print(f"{strategy:<10} {k:>2} {len(keep):>9,} {sub.nnz:>11,} "
                  f"{len(keep) / n:>9.2%}")


if __name__ == "__main__":
    for m in (1, 5):
        survey(m)
