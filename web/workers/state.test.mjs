/* The phase-2 gates, re-run against the JS port. If these diverge from
 * results/phase2/GATE.md the port has drifted from the validated model. */
import assert from 'node:assert';
import { State, HOUR } from './state.js';

function sim(hours, foodAvailable) {
  const s = new State();
  const budget = {}; let sleepBouts = 0, feedBouts = 0;
  for (let k = 0; k < hours * HOUR; k++) {
    const prev = s.behaviour;
    s.step(1, { foodInReach: foodAvailable });
    budget[s.behaviour] = (budget[s.behaviour] ?? 0) + 1;
    if (s.behaviour !== prev) {
      if (s.behaviour === 'sleep') sleepBouts++;
      if (s.behaviour === 'feed') feedBouts++;
    }
  }
  const perDay = {};
  for (const k in budget) perDay[k] = (budget[k] / (hours * HOUR)) * 24;
  return { perDay, sleepBouts, feedBouts, energy: s.energy };
}

const fed = sim(72, true);
const starved = sim(72, false);
console.log('fed    ', Object.fromEntries(
  Object.entries(fed.perDay).map(([k, v]) => [k, +v.toFixed(2)])),
  `sleepBouts=${fed.sleepBouts} feedBouts=${fed.feedBouts}`);
console.log('starved', `sleep=${starved.perDay.sleep?.toFixed(2) ?? 0} h/day`);

assert(fed.sleepBouts >= 2, 'no recurring sleep');
assert(fed.feedBouts >= 2, 'no recurring feeding');
assert(fed.energy > 0 && fed.energy < 1, 'energy pinned at a rail');
assert(fed.perDay.sleep > 7 && fed.perDay.sleep < 14,
  `sleep ${fed.perDay.sleep.toFixed(1)} h/day outside the ~8-12 h literature range`);
const ss = starved.perDay.sleep ?? 0;
assert(ss < fed.perDay.sleep, 'starvation did not suppress sleep');
assert(ss > 0.5, 'starved sleep is abolition, not loss');
assert(ss < 0.85 * fed.perDay.sleep, 'suppression too weak');

const s = new State();
s.sleepPressure = 0.95;
for (let i = 0; i < 6 * HOUR && s.behaviour !== 'sleep'; i++) s.step(1);
assert(s.behaviour === 'sleep', 'could not reach sleep');
s.startle(1); s.step(1);
assert(s.behaviour === 'escape', 'startle did not pre-empt sleep');
console.log('\nOK - JS port matches the phase 2 gates');
