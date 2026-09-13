/* LIF step loop. One source, two targets: a native shared library for the offline
 * experiments, and wasm32 for the browser. Mirrors pipeline/lif.py exactly -- that file
 * is the validated reference, this is the fast path.
 *
 * Constants live here rather than being passed in, so the two builds cannot drift. */
#include <stdint.h>
#include <stddef.h>

#define V_0   (-52.0f)
#define V_RST (-52.0f)
#define V_TH  (-45.0f)

typedef struct {
    int32_t  n, dly, rfc_steps, k;
    float    decay_g, decay_v, dt;
    const int32_t *indptr;   /* CSR over PREsynaptic rows, length n+1 */
    const int32_t *cols;
    const float   *vals;     /* already multiplied by w_syn */
    float    *v, *g, *ring;  /* ring is dly * n */
    int32_t  *rfc;
    uint64_t rng;
} Net;

/* xorshift64*, so a build is reproducible without linking a RNG library. */
static inline uint64_t xs(Net *s) {
    uint64_t x = s->rng;
    x ^= x >> 12; x ^= x << 25; x ^= x >> 27;
    s->rng = x;
    return x * 0x2545F4914F6CDD1DULL;
}
static inline float urand(Net *s) { return (float)((xs(s) >> 40) * (1.0 / 16777216.0)); }

/* Advance one dt. Spiking neuron indices are written to out; returns how many. */
/* rates may be NULL, in which case every driven neuron fires at rate_hz. A per-neuron
 * array is what an encoded input needs: a board position is not one odour at one
 * concentration but hundreds of PNs at hundreds of rates. */
int32_t lif_step_rates(Net *s, const int32_t *driven, const float *rates, int32_t n_driven,
                       float rate_hz, int32_t *out) {
    const int32_t n = s->n;
    float *slot = s->ring + (int64_t)(s->k % s->dly) * n;
    int32_t n_out = 0;

    for (int32_t i = 0; i < n; i++) {
        if (s->rfc[i] <= 0) {
            /* Synaptic input reaches only non-refractory targets: marking dg/dt
             * '(unless refractory)' in the reference suppresses the incoming g += w as
             * well as the decay, so input landing in that window is discarded. */
            float g = (s->g[i] + slot[i]) * s->decay_g;
            s->g[i] = g;
            float tgt = V_0 + g;
            float v = tgt + (s->v[i] - tgt) * s->decay_v;
            s->v[i] = v;
            if (v > V_TH) out[n_out++] = i;
        } else {
            s->rfc[i]--;
        }
        slot[i] = 0.0f;
    }

    if ((rate_hz > 0.0f || rates) && n_driven > 0) {
        const float p0 = rate_hz * s->dt / 1000.0f;
        for (int32_t d = 0; d < n_driven; d++) {
            int32_t i = driven[d];
            const float p = rates ? rates[d] * s->dt / 1000.0f : p0;
            /* Draw for every driven neuron, then discard if refractory, so the Poisson
             * statistics match the reference whether or not the target can fire. */
            int fired = (urand(s) < p);
            if (!fired || s->rfc[i] > 0) continue;
            int dup = 0;
            for (int32_t j = 0; j < n_out; j++) if (out[j] == i) { dup = 1; break; }
            if (!dup) out[n_out++] = i;
        }
    }

    if (n_out) {
        float *future = s->ring + (int64_t)((s->k + s->dly) % s->dly) * n;
        for (int32_t j = 0; j < n_out; j++) {
            int32_t i = out[j];
            s->v[i] = V_RST;
            s->g[i] = 0.0f;
            s->rfc[i] = s->rfc_steps;
            for (int32_t e = s->indptr[i]; e < s->indptr[i + 1]; e++)
                future[s->cols[e]] += s->vals[e];
        }
        /* Driven neurons take a one-step refractory, not the full period: the reference
         * never emits two spikes from a Poisson target on consecutive timesteps. */
        for (int32_t d = 0; d < n_driven; d++) {
            int32_t i = driven[d];
            for (int32_t j = 0; j < n_out; j++)
                if (out[j] == i) { s->rfc[i] = 1; break; }
        }
    }
    s->k++;
    return n_out;
}

/* Accumulate spike counts over `steps`, which is what the rate measurements need and
 * keeps the per-step call overhead out of the benchmark. */
int32_t lif_step(Net *s, const int32_t *driven, int32_t n_driven, float rate_hz,
                 int32_t *out) {
    return lif_step_rates(s, driven, 0, n_driven, rate_hz, out);
}

void lif_run(Net *s, const int32_t *driven, int32_t n_driven, float rate_hz,
             int32_t steps, int32_t *scratch, int64_t *counts) {
    for (int32_t t = 0; t < steps; t++) {
        int32_t m = lif_step(s, driven, n_driven, rate_hz, scratch);
        for (int32_t j = 0; j < m; j++) counts[scratch[j]]++;
    }
}

void lif_run_rates(Net *s, const int32_t *driven, const float *rates, int32_t n_driven,
                   int32_t steps, int32_t *scratch, int64_t *counts) {
    for (int32_t t = 0; t < steps; t++) {
        int32_t m = lif_step_rates(s, driven, rates, n_driven, 0.0f, scratch);
        for (int32_t j = 0; j < m; j++) counts[scratch[j]]++;
    }
}
