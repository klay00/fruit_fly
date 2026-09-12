/* The spin bug, pinned down so it cannot come back.
 *
 * Reported as "the creature spins hysterically in place". Cause: the olfactory response
 * has a large, persistent left/right imbalance that does NOT encode direction, and it was
 * being fed into the differential steering term as if it did. */
import assert from 'node:assert';
import { drive, FLY, DRAGON } from '../app/composables/useBody.js';

const mk = (o) => ({ DNa01: { L: o.l1 ?? 0, R: o.r1 ?? 0 },
                     DNa02: { L: o.l2 ?? 0, R: o.r2 ?? 0 },
                     DNa08: { L: 0, R: 0 } });
const LOOM_L = mk({ r1: 46, r2: 6 });         // threat in the left eye
const LOOM_R = mk({ l1: 46, l2: 6 });         // threat in the right eye
const LOOM_BOTH = mk({ l1: 2, r1: 2, l2: 2, r2: 2 });
const ODOUR = mk({ l1: 43, l2: 58, r2: 10 }); // measured olfactory response

/* Angular velocity the scene would command, in rad/s. Mirrors BodyScene: the differential
 * term applies only on the looming channel. */
function omega(dn, channel, morph = FLY) {
  const c = drive(dn, morph);
  const w = channel === 'loom' ? c.steer * morph.turnRate : 0;
  return Math.max(-morph.turnRate, Math.min(morph.turnRate, w));
}

const oddN = omega(ODOUR, 'smell');
const oddWrong = omega(ODOUR, 'loom');
console.log(`odour on the smell channel : ${oddN.toFixed(2)} rad/s`);
console.log(`odour on the loom channel  : ${oddWrong.toFixed(2)} rad/s  (the bug)`);
assert(Math.abs(oddN) < 0.01, 'odour still commands a directional turn');
assert(Math.abs(oddWrong) > 5, 'the regression case no longer reproduces - check the test');

const l = omega(LOOM_L, 'loom'), r = omega(LOOM_R, 'loom'), b = omega(LOOM_BOTH, 'loom');
console.log(`\nlooming left eye  : ${l.toFixed(2)} rad/s`);
console.log(`looming right eye : ${r.toFixed(2)} rad/s`);
console.log(`looming both eyes : ${b.toFixed(2)} rad/s`);
assert(l * r < 0, 'the two eyes no longer turn the animal opposite ways');
assert(Math.abs(b) < Math.abs(l) / 3, 'a symmetric threat should not steer');
assert(Math.abs(l) < FLY.turnRate, 'steering saturates at full deflection');

/* Nothing must command a turn the body cannot make. */
for (const m of [FLY, DRAGON])
  for (const [nm, d] of [['loomL', LOOM_L], ['odour', ODOUR]])
    for (const ch of ['loom', 'smell', 'rest']) {
      const w = Math.abs(omega(d, ch, m));
      assert(w <= m.turnRate + 1e-9, `${m.label} ${nm}/${ch}: ${w} exceeds ${m.turnRate} rad/s`);
    }
console.log(`\nangular velocity never exceeds turnRate (fly ${FLY.turnRate}, dragon ${DRAGON.turnRate.toFixed(2)} rad/s)`);
console.log('\nOK - spin regression pinned');
