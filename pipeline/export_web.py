"""Export the Phase 4 brain for the browser: network binary + interface descriptor.

The network is the union of two per-pathway corridors, each built at the depth its pathway
needs. A single corridor deep enough for feeding would have pulled in 92k neurons; built
per pathway and unioned, the same two behaviours cost 20k.
"""

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.annotations import table  # noqa: E402
from pipeline.connectome import index_of, load  # noqa: E402
from pipeline.lif import T_DLY, T_MBR, T_RFC, TAU, W_SYN  # noqa: E402
from pipeline.motor_map import build  # noqa: E402
from pipeline.reduce import corridor  # noqa: E402

OUT = ROOT / "web" / "public" / "brain"
DT = 0.1


def main() -> None:
    W5, ids = load(5)
    W1, _ = load(1)
    idx = index_of(ids)
    m = build(idx)
    a = table()

    mn9 = m["readout"]["MN9"]
    cmds = sorted({i for d in m["commands"].values() for i in d["left"] + d["right"]})
    # One corridor per behavioural pathway, each at the depth that pathway needs.
    # Olfaction earns its place: without a distance sense the animal has no connectome
    # route from "prey over there" to a motor command, and approach would have to be an
    # engineering stand-in. It costs 1.7 MB.
    feed = corridor(W5, m["sensory"]["sugar"], mn9, 3, "corridor")
    flee = corridor(W5, m["sensory"]["looming"], cmds, 2, "corridor")
    hunt = corridor(W5, m["sensory"]["smell"], cmds, 2, "corridor")
    keep = np.union1d(np.union1d(feed, flee), hunt)
    pos = {int(k): i for i, k in enumerate(keep)}
    Wc = (W1[keep][:, keep].tocsr() * W_SYN).astype(np.float32)

    def remap(gl):
        return sorted({pos[i] for i in gl if i in pos})

    def split_sides(rows):
        """Sensory populations are useless as one blob: a stimulus on one side has to be a
        different input from the same stimulus on the other, or the animal cannot turn
        toward or away from anything. Both looming and olfaction are kept bilateral."""
        out = {}
        for sd in ("left", "right"):
            g = [idx[int(r)] for r, s2 in zip(rows.root_id, rows.side)
                 if s2 == sd and int(r) in idx]
            out[sd] = remap(g)
        return out

    loom = a.loc[a["cell_type"].astype(str).isin(["LC4", "LPLC2"]), ["root_id", "side"]]
    eye = split_sides(loom)
    olf = a.loc[a["cell_class"].astype(str).str.contains("olfactory", case=False, na=False),
                ["root_id", "side"]]
    nose = split_sides(olf)

    iface = {
        "n": int(len(keep)),
        "nnz": int(Wc.nnz),
        "dt": DT,
        "dly": max(1, int(round(T_DLY / DT))),
        "rfc_steps": int(round(T_RFC / DT)),
        "decay_g": float(np.exp(-DT / TAU)),
        "decay_v": float(np.exp(-DT / T_MBR)),
        "sensory": {
            "sugar": remap(m["sensory"]["sugar"]),
            "smellL": nose["left"],
            "smellR": nose["right"],
            "loomL": eye["left"],
            "loomR": eye["right"],
        },
        "commands": {
            ct: {"role": d["role"], "note": d["note"],
                 "left": remap(d["left"]), "right": remap(d["right"])}
            for ct, d in m["commands"].items()
            if remap(d["left"]) or remap(d["right"])
        },
        "readout": {"MN9": remap(mn9)},
        "provenance": {
            "connectome": "FlyWire FAFB v783 (Dorkenwald et al., Nature 2024)",
            "annotations": "Schlegel et al., Nature 2024",
            "model": "Shiu et al., Nature 2024 (LIF); engine validated in results/phase3",
            "reduction": "union of per-pathway corridors: sugar->MN9 k=3, looming->DNs k=2, olfactory->DNs k=2",
            "license": "connectome data CC BY-NC 4.0 - non-commercial use only",
        },
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "interface.json").write_text(json.dumps(iface))
    with open(OUT / "net.bin", "wb") as f:
        f.write(Wc.indptr.astype(np.int32).tobytes())
        f.write(Wc.indices.astype(np.int32).tobytes())
        f.write(Wc.data.astype(np.float32).tobytes())

    assert iface["sensory"]["sugar"], "no sugar neurons survived the reduction"
    assert iface["sensory"]["smellL"] and iface["sensory"]["smellR"], "olfactory sides missing"
    assert iface["sensory"]["loomL"] and iface["sensory"]["loomR"], "looming eyes missing"
    assert iface["readout"]["MN9"], "MN9 missing"
    assert len(iface["commands"]) >= 8, "too few command DNs"
    size = (OUT / "net.bin").stat().st_size / 1e6
    print(f"{iface['n']:,} neurons, {iface['nnz']:,} edges -> {size:.1f} MB")
    print(f"sugar {len(iface['sensory']['sugar'])} · smell L{len(nose['left'])}/R{len(nose['right'])}"
          f" · loom L{len(eye['left'])}/R{len(eye['right'])}"
          f" · {len(iface['commands'])} command DNs")


if __name__ == "__main__":
    main()
