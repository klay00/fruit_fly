"""ctypes binding to engine/lif.c — the fast path, same algorithm as pipeline/lif.py.

pipeline/lif.py stays the readable reference and the thing gate 3b validated against
Brian2. This must agree with it; experiments/phase3c_engine.py is what checks that.
"""

import ctypes
import sys
from pathlib import Path

import numpy as np
from scipy import sparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.lif import T_DLY, T_MBR, T_RFC, TAU, V_0, W_SYN  # noqa: E402

LIB = ROOT / "engine" / "liblif.dylib"


class _Net(ctypes.Structure):
    _fields_ = [
        ("n", ctypes.c_int32), ("dly", ctypes.c_int32),
        ("rfc_steps", ctypes.c_int32), ("k", ctypes.c_int32),
        ("decay_g", ctypes.c_float), ("decay_v", ctypes.c_float), ("dt", ctypes.c_float),
        ("indptr", ctypes.POINTER(ctypes.c_int32)),
        ("cols", ctypes.POINTER(ctypes.c_int32)),
        ("vals", ctypes.POINTER(ctypes.c_float)),
        ("v", ctypes.POINTER(ctypes.c_float)),
        ("g", ctypes.POINTER(ctypes.c_float)),
        ("ring", ctypes.POINTER(ctypes.c_float)),
        ("rfc", ctypes.POINTER(ctypes.c_int32)),
        ("rng", ctypes.c_uint64),
    ]


def _p(a, t):
    return a.ctypes.data_as(ctypes.POINTER(t))


class Network:
    def __init__(self, W: sparse.spmatrix, dt: float = 0.1, w_syn: float = W_SYN,
                 seed: int = 1):
        self.lib = ctypes.CDLL(str(LIB))
        self.lib.lif_run.restype = None
        self.lib.lif_step.restype = ctypes.c_int32
        Wc = W.tocsr() * w_syn
        self.n = W.shape[0]
        self.dt = dt
        self._indptr = Wc.indptr.astype(np.int32)
        self._cols = Wc.indices.astype(np.int32)
        self._vals = Wc.data.astype(np.float32)
        self.dly = max(1, int(round(T_DLY / dt)))
        self.rfc_steps = int(round(T_RFC / dt))
        self.decay_g = float(np.exp(-dt / TAU))
        self.decay_v = float(np.exp(-dt / T_MBR))
        self.seed = seed
        self._scratch = np.zeros(self.n, dtype=np.int32)
        self.reset()

    def reset(self, seed: int | None = None) -> None:
        self._v = np.full(self.n, V_0, dtype=np.float32)
        self._g = np.zeros(self.n, dtype=np.float32)
        self._rfc = np.zeros(self.n, dtype=np.int32)
        self._ring = np.zeros(self.dly * self.n, dtype=np.float32)
        self.s = _Net(
            n=self.n, dly=self.dly, rfc_steps=self.rfc_steps, k=0,
            decay_g=self.decay_g, decay_v=self.decay_v, dt=self.dt,
            indptr=_p(self._indptr, ctypes.c_int32), cols=_p(self._cols, ctypes.c_int32),
            vals=_p(self._vals, ctypes.c_float), v=_p(self._v, ctypes.c_float),
            g=_p(self._g, ctypes.c_float), ring=_p(self._ring, ctypes.c_float),
            rfc=_p(self._rfc, ctypes.c_int32),
            rng=ctypes.c_uint64(int(seed if seed is not None else self.seed) * 2654435761 + 1),
        )

    def rates(self, ms: float, driven: np.ndarray | None = None, rate_hz: float = 0.0,
              trials: int = 1) -> np.ndarray:
        steps = int(ms / self.dt)
        drv = np.ascontiguousarray(
            np.array([] if driven is None else driven, dtype=np.int32))
        acc = np.zeros(self.n, dtype=np.int64)
        for t in range(trials):
            self.reset(self.seed + t)
            counts = np.zeros(self.n, dtype=np.int64)
            self.lib.lif_run(ctypes.byref(self.s), _p(drv, ctypes.c_int32),
                             ctypes.c_int32(drv.size), ctypes.c_float(rate_hz),
                             ctypes.c_int32(steps), _p(self._scratch, ctypes.c_int32),
                             _p(counts, ctypes.c_int64))
            acc += counts
        return acc / trials / (ms / 1000.0)
