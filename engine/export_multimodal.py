"""Export the multimodal corridor (the network the browser must actually run)."""
import json, sys
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.annotations import table, indices
from pipeline.connectome import index_of, load
from pipeline.lif import T_DLY, T_MBR, T_RFC, TAU, W_SYN
from pipeline.reduce import corridor
from pipeline.subset import write_subset

OUT = ROOT / "data" / "raw" / "subsets"

W5, ids = load(5); W1, _ = load(1); idx = index_of(ids); a = table()
def by_class(sub):
    m = a["cell_class"].astype(str).str.contains(sub, case=False, na=False)
    return np.array(sorted({idx[i] for i in a.loc[m, "root_id"].astype("int64") if i in idx}))
def by_type(ts):
    r = a.loc[a["cell_type"].astype(str).isin(ts), "root_id"].astype("int64")
    return np.array(sorted({idx[i] for i in r if i in idx}))

dns = indices(idx, super_class="descending")
gust = by_class("gustatory")
seeds = np.union1d(np.union1d(np.union1d(gust, by_class("olfactory")),
                              by_class("mechanosensory")), by_type(["LC4", "LPLC2"]))
keep = corridor(W5, list(seeds), list(dns), 2, "corridor")
pos = {int(k): i for i, k in enumerate(keep)}
Wc = (W1[keep][:, keep].tocsr() * W_SYN).astype(np.float32)
dt = 0.1
meta = {
    "n": int(len(keep)), "nnz": int(Wc.nnz),
    "dly": max(1, int(round(T_DLY/dt))), "rfc_steps": int(round(T_RFC/dt)),
    "decay_g": float(np.exp(-dt/TAU)), "decay_v": float(np.exp(-dt/T_MBR)), "dt": dt,
    "driven": [pos[int(k)] for k in gust if int(k) in pos],
    "dn": sorted(pos[int(d)] for d in dns if int(d) in pos),
    "rates": [50, 150, 250], "trials": 3,
}
(OUT / "wasm_meta.json").write_text(json.dumps(meta))
with open(OUT / "wasm_net.bin", "wb") as f:
    f.write(Wc.indptr.astype(np.int32).tobytes())
    f.write(Wc.indices.astype(np.int32).tobytes())
    f.write(Wc.data.astype(np.float32).tobytes())
sz = (OUT / "wasm_net.bin").stat().st_size
print(f"multimodal: {meta['n']:,} neurons, {meta['nnz']:,} edges, "
      f"{len(meta['dn']):,} DNs reachable, {len(meta['driven'])} gustatory driven")
print(f"binary {sz/1e6:.1f} MB")
import gzip
print(f"gzipped ~{len(gzip.compress(open(OUT/'wasm_net.bin','rb').read(), 6))/1e6:.1f} MB")
