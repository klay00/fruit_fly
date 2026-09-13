"""Export the mushroom body for the chess project: PN -> KC -> MBON.

The fly's learning circuit, as wired. Only the KC->MBON synapses are plastic in the animal
(Aso et al. 2014), and only those learn here -- but they are NOT in this binary: the
network runs with the fixed connectome, and the readout weights over MBON rates live in
the trainer. This file ships the fixed part.
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

OUT = ROOT / "web" / "public" / "brain"
DT = 0.1


def main() -> None:
    W1, ids = load(1)
    idx = index_of(ids)
    a = table()

    def group(col, value):
        m = a[col].astype(str).eq(value)
        return sorted({idx[int(r)] for r in a.loc[m, "root_id"] if int(r) in idx})

    pn = group("cell_class", "ALPN")
    kc = group("cell_class", "Kenyon_Cell")
    mbon = group("cell_class", "MBON")
    # Kenyon cells are mutually inhibited through APL, one giant GABAergic neuron; without
    # it sparse coding does not happen. It is a cell_type, not a class.
    apl = sorted({idx[int(r)] for r in a.loc[a["cell_type"].astype(str).eq("APL"), "root_id"]
                  if int(r) in idx})
    keep = np.array(sorted(set(pn) | set(kc) | set(mbon) | set(apl)), dtype=np.int64)
    pos = {int(k): i for i, k in enumerate(keep)}
    Wc = (W1[keep][:, keep].tocsr() * W_SYN).astype(np.float32)

    remap = lambda g: [pos[i] for i in g]
    iface = {
        "n": int(len(keep)), "nnz": int(Wc.nnz), "dt": DT,
        "dly": max(1, int(round(T_DLY / DT))), "rfc_steps": int(round(T_RFC / DT)),
        "decay_g": float(np.exp(-DT / TAU)), "decay_v": float(np.exp(-DT / T_MBR)),
        "pn": remap(pn), "kc": remap(kc), "mbon": remap(mbon), "apl": remap(apl),
        "mbon_types": [str(t) for t in a.set_index("root_id").loc[[int(ids[k]) for k in mbon], "cell_type"]],
        "provenance": {
            "connectome": "FlyWire FAFB v783 (Dorkenwald et al., Nature 2024)",
            "annotations": "Schlegel et al., Nature 2024",
            "model": "Shiu et al., Nature 2024 (LIF); engine validated in results/phase3",
            "circuit": "mushroom body: ALPN -> Kenyon cells (+APL) -> MBON",
            "plasticity": "readout over MBON rates only (KC->MBON is the fly's plastic site)",
            "license": "connectome data CC BY-NC 4.0 - non-commercial use only",
        },
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "interface.json").write_text(json.dumps(iface))
    with open(OUT / "net.bin", "wb") as f:
        f.write(Wc.indptr.astype(np.int32).tobytes())
        f.write(Wc.indices.astype(np.int32).tobytes())
        f.write(Wc.data.astype(np.float32).tobytes())
    # every stage must be wired to the next or the circuit is three disconnected lists
    sub = W1[keep][:, keep].tocsr()
    pk = sub[remap(pn)][:, remap(kc)].nnz
    km = sub[remap(kc)][:, remap(mbon)].nnz
    ka = sub[remap(kc)][:, remap(apl)].nnz
    assert pk > 10000 and km > 10000 and ka > 1000, (pk, km, ka)
    print(f"{iface['n']:,} neurons, {iface['nnz']:,} synapses -> {(OUT/'net.bin').stat().st_size/1e6:.1f} MB")
    print(f"PN {len(pn)} -> KC {len(kc)} -> MBON {len(mbon)}; APL {len(apl)}")
    print(f"PN->KC {pk:,}  KC->MBON {km:,}  KC->APL {ka:,}  APL->KC {sub[remap(apl)][:, remap(kc)].nnz:,}")


if __name__ == "__main__":
    main()
