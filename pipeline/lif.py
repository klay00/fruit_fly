"""Standalone leaky integrate-and-fire engine — the reference for the GPU shader.

Replicates the reference Brian2 model exactly enough to be checked against it (Phase 3b
measures how exactly). Written in mV and ms so the constants read like the paper's.

Reference dynamics (model.py):
    dv/dt = (v_0 - v + g) / t_mbr        g is the synaptic conductance term, in volts
    dg/dt = -g / tau
    spike when v > v_th; reset v = v_rst, g = 0; refractory t_rfc
    a presynaptic spike adds w to g, after a fixed delay t_dly

Driven neurons receive a Poisson train whose per-event weight (w_syn * f_poi = 68.75 mV)
far exceeds the 7 mV gap from rest to threshold, so every event forces a spike. They are
therefore simulated as Poisson spike sources directly.

One subtlety, found by measuring rather than reasoning: the reference sets the driven
neurons' refractory period to zero, but Brian2 still never emits two spikes from them on
consecutive timesteps -- over 3000 spikes its minimum presynaptic ISI was 0.2 ms (two
steps), never 0.1 ms. Forcing spikes directly with no refractory produced back-to-back
pairs in ~3% of spikes, each dumping two full synaptic volleys into g within one step.
That inflated every downstream rate, compounding with synaptic depth (+2% at the driven
neurons, +25% one hop on, +34% at MN9). Driven neurons therefore get a one-step refractory,
which reproduces the reference's observed minimum ISI exactly.

`ponytail: exponential Euler holding g constant across the step, rather than Brian2's exact
two-timescale solution. At dt = 0.1 ms the truncation is far below trial-to-trial variance;
phase3b measures it. If dt ever needs to grow, switch to the exact linear update.`
"""

import numpy as np
from scipy import sparse

# Constants from reference/model.py default_params, in mV / ms.
V_0 = V_RST = -52.0
V_TH = -45.0
T_MBR = 20.0
TAU = 5.0
T_RFC = 2.2
T_DLY = 1.8
W_SYN = 0.275


class Network:
    """A connectome-constrained LIF network.

    W is a signed synapse-count matrix (pre x post): W[i, j] > 0 excitatory, < 0 inhibitory.
    Weights are W * w_syn, matching the reference's 'Excitatory x Connectivity' * w_syn.
    """

    def __init__(self, W: sparse.spmatrix, dt: float = 0.1, w_syn: float = W_SYN,
                 seed: int | None = None):
        self.n = W.shape[0]
        self.dt = dt
        # Kept as CSR over PREsynaptic rows so a step gathers only the rows of the neurons
        # that actually spiked. A full `W.T @ spikes` matvec costs the same whether 5
        # neurons fire or 5,000, and spikes are extremely sparse -- of 38k neurons at ~30 Hz
        # only ~100 fire in a 0.1 ms step. Gathering is what makes the step scale with
        # activity instead of with network size.
        Wc = W.tocsr() * w_syn
        self.indptr = Wc.indptr.astype(np.int64)
        self.cols = Wc.indices.astype(np.int64)
        self.vals = Wc.data.astype(np.float32)
        self.decay_g = np.float32(np.exp(-dt / TAU))
        self.decay_v = np.float32(np.exp(-dt / T_MBR))
        self.rfc_steps = int(round(T_RFC / dt))
        self.dly_steps = max(1, int(round(T_DLY / dt)))
        self.rng = np.random.default_rng(seed)
        self.reset()

    def reset(self) -> None:
        self.v = np.full(self.n, V_0, dtype=np.float32)
        self.g = np.zeros(self.n, dtype=np.float32)
        self.rfc = np.zeros(self.n, dtype=np.int32)      # steps remaining refractory
        self.ring = np.zeros((self.dly_steps, self.n), dtype=np.float32)  # delayed input
        self.k = 0

    def step(self, driven: np.ndarray | None = None, rate_hz: float = 0.0) -> np.ndarray:
        """Advance one dt. Returns indices of neurons that spiked."""
        slot = self.k % self.dly_steps

        free = self.rfc <= 0

        # Synaptic input that was scheduled t_dly ago arrives now -- but ONLY for neurons
        # that are not refractory. Marking dg/dt '(unless refractory)' in the reference
        # suppresses both the decay AND the incoming 'g += w' while the target is
        # refractory, so input landing in that window is discarded outright. Measured
        # directly from a Brian2 trace: an event arriving 0.6 ms after a spike left g at
        # exactly 0.000 for the whole 2.2 ms refractory period.
        #
        # Getting this wrong is silent and rate-dependent. It cost 25-34% on downstream
        # rates, compounding with synaptic depth, and it hid from a deterministic test:
        # a regular 4 ms input train never lands inside a 2.2 ms refractory window, so
        # spike-for-spike agreement there proved nothing about the irregular case.
        self.g[free] += self.ring[slot][free]
        self.ring[slot] = 0.0
        # Gating the decay as well is a no-op and is deliberately not offered as an option:
        # the reset zeroes g at the spike and refractoriness begins in the same step, so g
        # is identically 0 for the whole refractory window and decaying zero changes
        # nothing. Measured -- gating input alone and gating both gave bit-identical rates.
        self.g[free] *= self.decay_g
        # Exponential Euler toward the instantaneous steady state v_0 + g.
        target = V_0 + self.g
        self.v[free] = target[free] + (self.v[free] - target[free]) * self.decay_v
        self.rfc[~free] -= 1

        spiked = np.flatnonzero(free & (self.v > V_TH))

        # Driven neurons: every Poisson event forces a spike (weight >> threshold gap).
        if driven is not None and rate_hz > 0:
            p = rate_hz * self.dt / 1000.0
            # Drawn for every driven neuron, then discarded for any that is refractory:
            # the reference generates the Poisson event regardless and loses it if the
            # target cannot spike, so consuming the draw keeps the statistics identical.
            fire = driven[(self.rng.random(driven.size) < p) & free[driven]]
            spiked = np.union1d(spiked, fire)

        if spiked.size:
            self.v[spiked] = V_RST
            self.g[spiked] = 0.0
            self.rfc[spiked] = self.rfc_steps
            if driven is not None:
                # One step, not zero: matches the reference simulator's observed minimum
                # ISI of 0.2 ms for Poisson-driven neurons (see module docstring).
                # Only the driven neurons that actually spiked this step -- assigning to
                # all of `driven` here silently gagged every sensory neuron on any step
                # where anything anywhere in the network fired, which in a live network
                # is nearly every step.
                self.rfc[np.intersect1d(spiked, driven, assume_unique=True)] = 1
            # Gather the outgoing rows of the spiking neurons and scatter-add them into
            # the delay slot that will be read t_dly from now.
            starts, ends = self.indptr[spiked], self.indptr[spiked + 1]
            counts = ends - starts
            total = int(counts.sum())
            if total:
                offs = np.arange(total) - np.repeat(np.cumsum(counts) - counts, counts)
                pos = np.repeat(starts, counts) + offs
                slot2 = (self.k + self.dly_steps) % self.dly_steps
                self.ring[slot2] += np.bincount(
                    self.cols[pos], weights=self.vals[pos], minlength=self.n
                ).astype(np.float32)

        self.k += 1
        return spiked

    def run(self, ms: float, driven: np.ndarray | None = None,
            rate_hz: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
        """Run for `ms`. Returns (neuron_index, spike_time_ms) arrays."""
        idx, tms = [], []
        for _ in range(int(ms / self.dt)):
            s = self.step(driven, rate_hz)
            if s.size:
                idx.append(s)
                tms.append(np.full(s.size, self.k * self.dt, dtype=np.float32))
        if not idx:
            return np.array([], dtype=int), np.array([], dtype=np.float32)
        return np.concatenate(idx), np.concatenate(tms)

    def rates(self, ms: float, driven: np.ndarray | None = None, rate_hz: float = 0.0,
              trials: int = 1) -> np.ndarray:
        """Mean firing rate [Hz] per neuron over `trials` runs of `ms`."""
        acc = np.zeros(self.n)
        for _ in range(trials):
            self.reset()
            idx, _ = self.run(ms, driven, rate_hz)
            np.add.at(acc, idx, 1.0)
        return acc / trials / (ms / 1000.0)


if __name__ == "__main__":
    # A strong chain propagates all the way: drive A, expect B and C to follow.
    W = sparse.csr_matrix(np.array([[0, 300, 0],
                                    [0, 0, 300],
                                    [0, 0, 0]], dtype=np.float32))
    net = Network(W, seed=0)
    driven = np.array([0])
    r = net.rates(1000.0, driven=driven, rate_hz=100.0, trials=3)
    print(f"strong chain [Hz]: A={r[0]:.1f}  B={r[1]:.1f}  C={r[2]:.1f}")
    assert 80 < r[0] < 120, f"driven neuron should fire near 100 Hz, got {r[0]:.1f}"
    assert r[1] > 1, "excitation did not propagate A -> B"
    assert r[2] > 1, "excitation did not propagate B -> C"

    # Synaptic attenuation is a real property of these constants, not a bug, and it is why
    # only ~435 of 138,639 neurons activate under sugar stimulation. A 60-synapse edge
    # delivers 16.5 mV into g, which clears the 7 mV gap to threshold on paper — but g
    # decays with tau = 5 ms while v follows with t_mbr = 20 ms, so the two-timescale
    # filter passes only about a quarter of it. Single synapses do not transmit; the
    # network needs convergence. Locked in here so a future "optimisation" cannot quietly
    # remove it by, say, collapsing g into a direct v jump.
    w60 = sparse.csr_matrix(np.array([[0, 60, 0],
                                      [0, 0, 60],
                                      [0, 0, 0]], dtype=np.float32))
    r60 = Network(w60, seed=0).rates(1000.0, driven=driven, rate_hz=100.0, trials=3)
    print(f"weak chain   [Hz]: A={r60[0]:.1f}  B={r60[1]:.1f}  C={r60[2]:.1f}")
    assert r60[1] < 0.5 * r60[0], "60-synapse edge should attenuate, not relay one-for-one"
    assert r60[2] == 0.0, "a 21 Hz presynaptic train should not drive a 60-synapse target"

    # An inhibitory edge must suppress, not excite.
    Wi = sparse.csr_matrix(np.array([[0, -60], [0, 0]], dtype=np.float32))
    ri = Network(Wi, seed=0).rates(1000.0, driven=np.array([0]), rate_hz=100.0)
    assert ri[1] == 0.0, f"inhibited neuron fired at {ri[1]:.1f} Hz"

    # Silence in, silence out: no drive must mean no spikes anywhere.
    rq = Network(W, seed=0).rates(500.0)
    assert rq.sum() == 0.0, "network spikes with no input"
    print("OK")
