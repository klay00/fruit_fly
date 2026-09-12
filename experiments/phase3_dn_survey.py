"""Does the corridor reduction survive when the target is the full descending vector?

Phase 3a measured one pathway (sugar -> MN9) and got 7,402 neurons. The project needs the
whole ~1,300-neuron DN bundle driven by several sensory modalities. The fly brain is
small-world -- 3 hops already reaches 50-70% of it -- so this is where the reduction is most
likely to collapse. Measuring before building anything on top of the 7,402 figure.
"""

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.annotations import indices  # noqa: E402
from pipeline.connectome import index_of, load  # noqa: E402
from pipeline.neurons import ID_MN9, NEU_SUGAR  # noqa: E402
from pipeline.reduce import corridor  # noqa: E402


def main() -> None:
    W5, ids = load(5)
    W1, _ = load(1)
    idx = index_of(ids)
    n = W5.shape[0]

    dns = indices(idx, super_class="descending")
    motor = indices(idx, super_class="motor")
    sugar = np.array([idx[i] for i in NEU_SUGAR if i in idx])
    sensory = indices(idx, super_class=("sensory", "sensory_ascending"))
    gust = indices(idx, super_class="sensory", cell_class="gustatory")
    vis = indices(idx, super_class="visual_projection")

    print(f"populations: {len(dns):,} DN · {len(motor)} motor · {len(sensory):,} sensory "
          f"({len(gust)} gustatory) · {len(vis):,} visual projection\n")

    scenarios = [
        ("sugar -> MN9            (phase 3a)", sugar, np.array([idx[ID_MN9]])),
        ("sugar -> all DNs", sugar, dns),
        ("gustatory -> all DNs", gust, dns),
        ("gustatory+visual -> DNs", np.union1d(gust, vis), dns),
        ("all sensory -> all DNs", sensory, dns),
        ("all sensory -> DN+motor", sensory, np.union1d(dns, motor)),
    ]
    print(f"{'scenario':<36} {'k':>2} {'neurons':>9} {'% brain':>8} {'edges(all syn)':>15}")
    for label, seeds, targets in scenarios:
        for k in (2, 3):
            keep = corridor(W5, list(seeds), list(targets), k, "corridor")
            sub = W1[keep][:, keep]
            print(f"{label:<36} {k:>2} {len(keep):>9,} {len(keep)/n:>7.1%} {sub.nnz:>15,}")
        print()


if __name__ == "__main__":
    main()
