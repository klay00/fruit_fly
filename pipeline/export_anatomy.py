"""Real anatomy for the brain view: the FlyWire brain surface and the arbors of the
mushroom-body circuit, from the public 783 precomputed skeletons (no token needed).

Everything is normalised by the brain mesh bounding box, so mesh, skeletons and the soma
positions in interface.json share one frame."""

import json
import struct
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
OUT = ROOT / "web" / "public" / "brain"
SRC = "https://flyem.mrc-lmb.cam.ac.uk/flyconnectome/flywire_skeletons_783/"
KC_EVERY = 12                       # 5,177 KCs is too much to ship; ~430 shows the lobes
FACTOR = {"pn": 10, "kc": 10, "mbon": 10, "apl": 24}
TWIG_NM = 3000        # prune terminal twigs shorter than 3 um: they hold ~75% of branch points


def fetch(root_id: int):
    r = requests.get(SRC + str(root_id), timeout=120)
    if r.status_code != 200:
        return None
    b = r.content
    nv, ne = struct.unpack("<II", b[:8])
    v = np.frombuffer(b[8:8 + nv * 12], dtype="<f4").reshape(-1, 3).astype(np.float64)
    e = np.frombuffer(b[8 + nv * 12:8 + nv * 12 + ne * 8], dtype="<u4").reshape(-1, 2)
    return v, e


def downsample(v, e, factor):
    """Collapse chains: keep branch points, leaves, and every `factor`-th node between."""
    import navis, pandas as pd
    parent = -np.ones(len(v), dtype=np.int64)
    # orient edges into a tree from node 0 by BFS
    adj = [[] for _ in range(len(v))]
    for a, b in e:
        adj[a].append(b); adj[b].append(a)
    seen = np.zeros(len(v), bool); seen[0] = True; stack = [0]
    while stack:
        n = stack.pop()
        for m in adj[n]:
            if not seen[m]:
                seen[m] = True; parent[m] = n; stack.append(m)
    df = pd.DataFrame({"node_id": np.arange(len(v)), "parent_id": parent,
                       "x": v[:, 0], "y": v[:, 1], "z": v[:, 2], "radius": 1.0})
    n = navis.TreeNeuron(df, units="nm")
    # Branch points and leaves survive downsampling, and a raw FlyWire skeleton is ~20%
    # branch points -- nearly all of them on tiny terminal twigs. Prune those first.
    n = navis.prune_twigs(n, TWIG_NM, inplace=False)
    n = navis.downsample_neuron(n, factor, inplace=False)
    nodes = n.nodes
    idx = {nid: i for i, nid in enumerate(nodes.node_id)}
    xyz = nodes[["x", "y", "z"]].to_numpy()
    segs = [(idx[r.node_id], idx[r.parent_id]) for r in nodes.itertuples() if r.parent_id in idx]
    return xyz, np.array(segs, dtype=np.int64)


def main():
    import flybrains
    from pipeline.annotations import table
    from pipeline.connectome import index_of, load
    iface = json.loads((OUT / "interface.json").read_text())
    _, ids = load(1); a = table().set_index("root_id")

    # the same `keep` order the export used: rebuild it from the interface groups
    W1, ids = load(1); idx = index_of(ids)
    def group(col, val):
        m = table()[col].astype(str).eq(val)
        return sorted({idx[int(r)] for r in table().loc[m, "root_id"] if int(r) in idx})
    pn, kc, mbon = group("cell_class", "ALPN"), group("cell_class", "Kenyon_Cell"), group("cell_class", "MBON")
    apl = sorted({idx[int(r)] for r in table().loc[table()["cell_type"].astype(str).eq("APL"), "root_id"] if int(r) in idx})
    keep = sorted(set(pn) | set(kc) | set(mbon) | set(apl))
    pos = {k: i for i, k in enumerate(keep)}
    assert len(keep) == iface["n"], (len(keep), iface["n"])

    mesh = flybrains.FLYWIRE.mesh
    lo = mesh.vertices.min(0); scale = float((mesh.vertices.max(0) - lo).max())
    norm = lambda p: ((np.asarray(p, dtype=np.float64) - lo) / scale).astype(np.float32)

    with open(OUT / "brain.bin", "wb") as f:
        V = norm(mesh.vertices); F = np.asarray(mesh.faces, dtype=np.uint32)
        f.write(struct.pack("<II", len(V), len(F))); f.write(V.tobytes()); f.write(F.tobytes())
    print(f"brain.bin: {len(V):,} vertices, {len(F):,} faces")

    want = [("pn", g) for g in pn] + [("mbon", g) for g in mbon] + [("apl", g) for g in apl] \
         + [("kc", g) for g in kc[::KC_EVERY]]
    print(f"fetching {len(want)} skeletons…")

    def job(item):
        kind, g = item
        r = fetch(int(ids[g]))
        if r is None: return None
        xyz, segs = downsample(*r, FACTOR[kind])
        return kind, pos[g], norm(xyz), segs
    with ThreadPoolExecutor(16) as ex:
        results = [r for r in ex.map(job, want) if r is not None]

    total = 0
    with open(OUT / "skeletons.bin", "wb") as f:
        f.write(struct.pack("<I", len(results)))
        for kind, i, xyz, segs in results:
            # uint16 in the unit box: 12 bytes a segment instead of 24, and 1/65535 of the
            # brain's width is far below anything a line on screen can show.
            seg = np.concatenate([xyz[segs[:, 0]], xyz[segs[:, 1]]], axis=1)
            q = np.clip(np.round(seg * 65535), 0, 65535).astype(np.uint16)
            f.write(struct.pack("<II", i, len(q))); f.write(q.tobytes()); total += len(q)
    print(f"skeletons.bin: {len(results)} neurons, {total:,} segments, "
          f"{(OUT / 'skeletons.bin').stat().st_size / 1e6:.1f} MB")

    # re-normalise the soma positions into the same frame
    P = np.zeros((len(keep), 3))
    for i, k in enumerate(keep):
        row = a.loc[int(ids[k])]
        xyz = [row["soma_x"], row["soma_y"], row["soma_z"]]
        if any(np.isnan(float(v)) for v in xyz): xyz = [row["pos_x"], row["pos_y"], row["pos_z"]]
        P[i] = xyz
    (OUT / "positions.bin").write_bytes(norm(P).tobytes())
    iface["frame"] = {"lo": lo.tolist(), "scale": scale, "brain": "brain.bin", "skeletons": "skeletons.bin"}
    (OUT / "interface.json").write_text(json.dumps(iface))
    print("interface.json updated")


if __name__ == "__main__":
    main()
