/* The fly body: descending-neuron vector in, motion out.
 *
 * This file IS the experiment. Everything upstream of it -- connectome, weights, LIF
 * constants, internal state -- is held fixed in Phase 5; only this mapping and the
 * morphology change when the body becomes a dragon. Keep it small and explicit so that
 * a diff against useDragonBody.js shows exactly what was swapped.
 */

export const FLY = {
  label: 'Drosophila melanogaster',
  bodyLength: 0.003,      // m
  wingspan: 0.006,
  mass: 0.8e-6,           // kg
  cruise: 0.35,           // m/s, forward flight
  turnRate: 12,           // rad/s at full differential drive
  escapeAccel: 200,       // m/s^2 -- a Drosophila escape jump is on the order of 20 g
  liftFudge: 1.0,         // a real fly needs no help
  effectors: { feed: 'proboscis extension', escape: 'takeoff' },
};

/* The dragon. Scale factor S = bodyLength ratio = 2000.
 *
 * Nothing above this line changes between the two conditions: the connectome, the weights,
 * the LIF constants, the internal state model, and `drive()` below -- including every
 * threshold in it -- are shared. Only these numbers and the effector names differ. That is
 * the whole experiment (Constitution III).
 *
 * Square-cube law, applied rather than waved at: muscle force goes with cross-section
 * (S^2) while mass goes with volume (S^3), so available acceleration falls as 1/S. The
 * dragon is 2000x longer and accelerates 2000x more slowly. Mass is set to 600 kg rather
 * than the 6.4 tonnes geometric similarity would give, because large flyers are far less
 * dense than small ones; that departure is declared, not hidden.
 *
 * ponytail: LIFT_FUDGE is the one declared lie (RESEARCH.md §7). Real flight at this size
 * is aerodynamically impossible; this single multiplier is displayed in the UI rather than
 * dissolved into a dozen equations. */
export const LIFT_FUDGE = 340;

export const DRAGON = {
  label: 'Dragon (fly brain, swapped body)',
  bodyLength: 6.0,        // m -- S = 2000 relative to the fly
  wingspan: 14.0,
  mass: 600,              // kg, declared departure from geometric similarity
  cruise: 0.35 * Math.sqrt(2000),        // Froude scaling: speed goes with sqrt(length)
  turnRate: 12 / Math.sqrt(2000),        // angular rate falls as 1/sqrt(L)
  escapeAccel: 200 / 2000,               // 1/S, straight from the square-cube law
  liftFudge: LIFT_FUDGE,
  effectors: { feed: 'fire breath', escape: 'evasive dodge' },
};
// Earlier drafts carried arbitrary multipliers (x60 on escape acceleration, x55 on turn
// rate) that had no justification beyond making the dragon look capable. They were removed:
// inventing a number that rescues the animal would have decided the experiment's outcome
// in the morphology file. LIFT_FUDGE stays because flight is impossible without it and it
// is declared; escape acceleration and turn rate now follow the scaling laws alone.

/* Convert the DN vector into body commands. Rates are in Hz.
 *
 * SHARED between the fly and the dragon, thresholds included. Retuning this for the dragon
 * would change two things at once and destroy the comparison: any difference in behaviour
 * could then be the body or the interface, and we could not say which.
 * Thresholds are read off the measured responses in results/phase4, not invented:
 * a resting network leaves these DNs near 0 Hz, a looming stimulus puts DNp01 above
 * 100 Hz, and steering DNs reach ~45 Hz on the side contralateral to the threat. */
export function drive(dn, morph = FLY) {
  const get = (ct) => dn[ct] ?? { L: 0, R: 0 };
  const p01 = get('DNp01'), p11 = get('DNp11'), p07 = get('DNp07');

  // Escape is the maximum across the escape DNs, not their sum: they are parallel
  // pathways to one behaviour, and summing would make redundancy look like urgency.
  const escape = Math.max(p01.L, p01.R, p11.L, p11.R, p07.L, p07.R) / 150;

  // The steering DNs carry two different things, and conflating them is what makes an
  // animal spin on the spot.
  //
  //   difference (R - L)  is direction, and is only meaningful where the stimulus is
  //                       direction-coded. Measured: looming is (+55 one eye, -65 the
  //                       other); olfaction is NOT (-73 left nostril, -53 right, same sign).
  //   sum (R + L)         is how hard the animal is turning at all, regardless of which
  //                       way. That is what an odour plume drives, and it is casting.
  //
  // Feeding the olfactory response into the differential term produced a constant
  // full-deflection turn command -- a faithful conversion of a signal that does not mean
  // what the conversion assumed. Both are reported; the caller picks the one its stimulus
  // supports.
  //
  // The normaliser is 120 Hz, not 45: three DN pairs each reaching ~60 Hz sum to ~180, so
  // 45 saturated the command on any stimulus at all and threw away every gradation.
  const dns = ['DNa01', 'DNa02', 'DNa08'].map(get);
  const steerRaw = dns.reduce((a, d) => a + (d.R - d.L), 0) / 120;
  const arousalRaw = dns.reduce((a, d) => a + d.R + d.L, 0) / 120;

  // A threat filling both eyes produces no turn: there is nowhere better to go, and the
  // symmetric case genuinely measures ~0 differential. Escape alone handles it.
  const steer = Math.max(-1, Math.min(1, steerRaw));
  const arousal = Math.min(1, arousalRaw);

  const stop = Math.max(get('DNp09').L, get('DNp09').R) / 40;
  const wing = Math.max(get('DNg100').L, get('DNg100').R) / 30;
  const groom = Math.max(get('DNg13').L, get('DNg13').R) / 30;
  const reverse = Math.max(get('DNb02').L, get('DNb02').R) / 30;
  const feed = (dn.MN9?.L ?? 0) / 90;      // proboscis extension -> fire breath in Phase 5

  return {
    escape: Math.min(1, escape),
    steer,
    arousal,
    stop: Math.min(1, stop),
    wing: Math.min(1, wing),
    groom: Math.min(1, groom),
    reverse: Math.min(1, reverse),
    feed: Math.min(1, feed),
    thrust: Math.min(1, Math.max(0, 1 - stop) * (0.35 + 0.65 * escape)),
  };
}
