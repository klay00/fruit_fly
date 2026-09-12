/* Internal state: port of pipeline/state.py, which is the gated reference (phase 2).
 * Slow neuromodulators (seconds to hours) that set the gain of the fast spiking network.
 * Keep the constants in step with the Python file -- that one carries the citations. */

export const HOUR = 3600;
const BASAL_BURN = 1 / (40 * HOUR);
const MOTOR_BURN = 9 * BASAL_BURN;
const FEED_GAIN = 1 / 90;
const SLEEP_RISE = 1 / (16 * HOUR);
const SLEEP_FALL = 1 / (11 * HOUR);
const FEAR_TAU = 12;
const CIRCADIAN = 24 * HOUR;

const HUNGER_ON = 0.35, HUNGER_OFF = 0.08;
const SLEEP_ON = 0.62, SLEEP_OFF = 0.10;
const FEAR_ON = 0.30;
const STARVATION_WAKEFULNESS = 0.30;
const STARVATION_FRAGMENT = 0.55;
const AKH_ONSET = 0.45;

/* Measured, not chosen: the sugar drive at which MN9 first fires above its own trial
 * variability in the real connectome (experiments/phase2_doseresponse.py --fine).
 * Below this the proboscis cannot be extended, whatever the arbiter decides. */
export const MN9_THRESHOLD_HZ = 37;

export class State {
  constructor() {
    this.energy = 0.62;       // metabolic reserve; starts peckish, so the animal has
                              // somewhere to go the moment you open the page
    this.sleepPressure = 0;   // R5 integrator
    this.fear = 0;            // transient startle
    this.clock = 8 * HOUR;    // start mid-morning rather than at subjective midnight
    this.behaviour = 'explore';
    this.t = 0;
  }
  get hunger() { return 1 - this.energy; }
  get akh() { return Math.max(0, this.hunger - AKH_ONSET) / (1 - AKH_ONSET); }
  get night() { return 0.5 * (1 - Math.cos((2 * Math.PI * this.clock) / CIRCADIAN)); }
  get sleepDrive() { return Math.min(1, 0.7 * this.sleepPressure + 0.3 * this.night); }
  /* The single value that reaches the spiking network. */
  get sugarGain() { return 25 + 225 * this.hunger; }
  get canFeed() { return this.sugarGain >= MN9_THRESHOLD_HZ; }
  startle(s = 1) { this.fear = Math.min(1, this.fear + s); }

  /* dt advances metabolism, sleep pressure and the circadian clock -- all slow, and
   * time-lapsed when the viewer speeds the world up. dtReal advances fear, which decays
   * over about 12 s and must not be accelerated: a startle that disappears faster than the
   * viewer can see it is a startle that never happened. Defaults to dt so the headless
   * tests, which have no wall clock, behave exactly as before. */
  step(dt, { dtReal = dt, foodInReach = false, motor = 0.25 } = {}) {
    this.clock = (this.clock + dt) % CIRCADIAN;
    this.fear *= Math.max(0, 1 - dtReal / FEAR_TAU);

    let b = this.behaviour;
    if (this.fear > FEAR_ON) {
      b = 'escape';
    } else {
      if (b === 'escape') b = 'explore';
      if (b === 'feed') {
        if (this.hunger < HUNGER_OFF || !foodInReach) b = 'explore';
      } else if (b === 'sleep') {
        if (this.sleepPressure < SLEEP_OFF + STARVATION_FRAGMENT * this.akh) b = 'explore';
      } else if (this.hunger > HUNGER_ON && foodInReach && this.canFeed) {
        b = 'feed';
      } else if (this.sleepDrive > SLEEP_ON + STARVATION_WAKEFULNESS * this.akh) {
        b = 'sleep';
      }
    }
    this.behaviour = b;

    const effort = { sleep: 0, explore: motor, feed: 0.15, escape: 1 }[b];
    this.energy -= dt * (BASAL_BURN + MOTOR_BURN * effort);
    if (b === 'feed') this.energy += dt * FEED_GAIN;
    this.energy = Math.min(1, Math.max(0, this.energy));

    this.sleepPressure += dt * (b === 'sleep' ? -SLEEP_FALL : SLEEP_RISE);
    this.sleepPressure = Math.min(1, Math.max(0, this.sleepPressure));
    this.t += dt;
  }
}
