"""Export a corridor network in the flat binary layout engine/bench.mjs expects."""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.lif import T_DLY, T_MBR, T_RFC, TAU, W_SYN  # noqa: E402
from pipeline.neurons import ID_MN9, NEU_SUGAR  # noqa: E402
from experiments.phase3b_implementation import load_subset  # noqa: E402

OUT = ROOT / "data" / "raw" / "subsets"


def main(name: str = "corridor3_all") -> None:
    W, ids, idx = load_subset(name)
    Wc = (W.tocsr() * W_SYN).astype(np.float32)
    dt = 0.1
    driven = [int(idx[n]) for n in NEU_SUGAR if n in idx]
    meta = {
        "n": int(W.shape[0]), "nnz": int(Wc.nnz),
        "dly": max(1, int(round(T_DLY / dt))), "rfc_steps": int(round(T_RFC / dt)),
        "decay_g": float(np.exp(-dt / TAU)), "decay_v": float(np.exp(-dt / T_MBR)),
        "dt": dt, "driven": driven, "readout": int(idx[ID_MN9]),
        "rates": [37, 50, 100, 150, 250], "trials": 10,
    }
    (OUT / "wasm_meta.json").write_text(json.dumps(meta))
    with open(OUT / "wasm_net.bin", "wb") as f:
        f.write(Wc.indptr.astype(np.int32).tobytes())
        f.write(Wc.indices.astype(np.int32).tobytes())
        f.write(Wc.data.astype(np.float32).tobytes())
    print(f"{name}: {meta['n']:,} neurons, {meta['nnz']:,} edges -> "
          f"{(OUT / 'wasm_net.bin').stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main(*sys.argv[1:])
