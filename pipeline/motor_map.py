"""The brain-body interface: which neurons the world writes to, and which it reads.

This is the whole API between the connectome and any body (RESEARCH.md §1). Phase 5 swaps
the body on the far side of this file and changes nothing on the near side.

Every entry is a named, literature-documented cell type present in the FlyWire v783
annotations. Command DNs come in pairs -- one per hemisphere -- so steering is genuinely
differential: the difference between left and right activity is the turn signal, exactly as
in the animal. Nothing here is a free parameter.
"""

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.annotations import table  # noqa: E402

# --- inputs: what the world can stimulate -------------------------------------------
# A sensory *class* is not a channel. Driving all 408 gustatory neurons together drives
# sugar-sensing and bitter-sensing cells at once (30 are glutamatergic, 60 serotonergic),
# and measured non-monotonically: 200 Hz produced LESS proboscis activity than 50 Hz,
# because the aversive half suppresses feeding. Tasting everything at once is not a
# stimulus. So the food channel is the specific validated sugar population instead --
# the 20 LB3 labellar neurons every dose-response curve in phases 1-2 was measured on.
SENSORY = {
    "smell":   ("cell_class", "olfactory"),      # odour plume
    "touch":   ("cell_class", "mechanosensory"), # contact, airflow, wind
}
# Looming detectors: LC4 encodes angular velocity, LPLC2 angular size; both converge on the
# Giant Fiber (Ache/Card et al., Curr Biol 2019). Named types, not the whole optic lobe.
LOOMING = ["LC4", "LPLC2"]

# --- outputs: command DNs with a documented behavioural role -------------------------
COMMANDS = {
    "DNp01":  ("escape",   "Giant Fiber; short-mode escape takeoff"),
    "DNp11":  ("escape",   "escape / takeoff"),
    "DNp07":  ("escape",   "escape"),
    "DNa01":  ("steer",    "steering, differential left/right"),
    "DNa02":  ("steer",    "steering, differential left/right"),
    "DNa08":  ("steer",    "turning"),
    "DNp09":  ("stop",     "stopping / freezing"),
    "DNb02":  ("reverse",  "backward walking"),
    "DNg13":  ("groom",    "grooming"),
    "DNg100": ("wing",     "wing motor control"),
    "DNp18":  ("loom",     "looming-responsive descending"),
}
# MN9 is a motor neuron, not a descending neuron: it is the proboscis-extension output,
# the Phase 1 readout, and in Phase 5 the command that becomes the dragon's fire breath.
ID_MN9_TYPE = "MN9"


def build(pos: dict[int, int]) -> dict:
    """pos maps global matrix index -> index within the network being exported."""
    from pipeline.neurons import ID_MN9
    a = table()
    root_to_global = None  # filled by caller via `pos` keyed on global index

    def sel(col: str, value: str, contains: bool = False) -> list[int]:
        s = a[col].astype(str)
        m = s.str.contains(value, case=False, na=False) if contains else s.eq(value)
        return a.loc[m, "root_id"].astype("int64").tolist()

    out: dict = {"sensory": {}, "commands": {}, "readout": {}}

    from pipeline.neurons import NEU_SUGAR
    # The calibrated food channel: validated sugar-sensing neurons, not the whole class.
    out["sensory"]["sugar"] = sorted({pos[i] for i in NEU_SUGAR if i in pos})

    for name, (col, val) in SENSORY.items():
        ids = sel(col, val, contains=True)
        out["sensory"][name] = sorted({pos[i] for i in ids if i in pos})

    loom = [i for t in LOOMING for i in sel("cell_type", t)]
    out["sensory"]["looming"] = sorted({pos[i] for i in loom if i in pos})

    for ct, (role, note) in COMMANDS.items():
        m = a["cell_type"].astype(str).eq(ct)
        rows = a.loc[m, ["root_id", "side"]]
        left = sorted({pos[int(r)] for r, s in zip(rows.root_id, rows.side)
                       if s == "left" and int(r) in pos})
        right = sorted({pos[int(r)] for r, s in zip(rows.root_id, rows.side)
                        if s == "right" and int(r) in pos})
        if left or right:
            out["commands"][ct] = {"role": role, "note": note, "left": left, "right": right}

    out["readout"]["MN9"] = [pos[ID_MN9]] if ID_MN9 in pos else []
    return out


if __name__ == "__main__":
    from pipeline.connectome import index_of, load
    _, ids = load(5)
    idx = index_of(ids)
    m = build(idx)
    print("sensory inputs:")
    for k, v in m["sensory"].items():
        print(f"  {k:<10} {len(v):>6,} neurons")
    print("\ncommand DNs:")
    for ct, d in m["commands"].items():
        print(f"  {ct:<8} {d['role']:<8} L{len(d['left'])} R{len(d['right'])}  {d['note']}")
    print(f"\nreadout MN9: {m['readout']['MN9']}")
    assert all(m["sensory"].values()), "an empty sensory group"
    assert len(m["commands"]) >= 8, "too few command DNs resolved"
    assert m["readout"]["MN9"], "MN9 not found"
    print("\nOK")
