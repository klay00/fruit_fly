<script setup>
const { ready, dn, state, info, channel, sense, setClock, poke, reset } = useBrain()
const speed = ref(600)
const body = ref('fly')
const scene = ref(null)
/* Encounter tally, reset on every body swap. This is the phase 5 result accumulating live:
 * the brain is identical in both, only the body it commands is not. */
const tally = reactive({ fly: { n: 0, escaped: 0, kills: 0 },
                        dragon: { n: 0, escaped: 0, kills: 0 } })
function onEvent(e) {
  if (e.type === 'kill') { tally[body.value].kills++; return }
  const t = tally[body.value]
  t.n++
  if (e.type === 'escaped') t.escaped++
}
const rate = (k) => (tally[k].n ? Math.round((tally[k].escaped / tally[k].n) * 100) : null)

const chase = ref(true)
const paused = ref(false)
const showWorld = ref(true)
/* Sliders write straight into the neuromodulator layer. Everything downstream -- the
 * connectome, the weights, the body map -- is untouched, so the animal's response is still
 * the network's, only to a state you set rather than one it drifted into. */
const setHunger = (v) => poke({ energy: 1 - v })
const setSleep = (v) => poke({ sleepPressure: v })
const setHour = (v) => poke({ clockHours: v })
function resetAll() {
  scene.value?.resetWorld(); reset()
  tally.fly.n = tally.fly.escaped = tally.fly.kills = 0
  tally.dragon.n = tally.dragon.escaped = tally.dragon.kills = 0
}
watch(speed, (v) => setClock(v))

const pct = (x) => `${Math.round((x ?? 0) * 100)}%`
const roleColor = { escape: '#e0913a', steer: '#9277d2', stop: '#8ba0a8',
                    feed: '#e0913a', groom: '#8ba0a8', wing: '#34a09d', loom: '#9277d2',
                    reverse: '#8ba0a8' }
const dnRows = computed(() => Object.entries(dn.value ?? {})
  .map(([ct, d]) => ({ ct, ...d, max: Math.max(d.L, d.R) }))
  .sort((a, b) => b.max - a.max))
const behaviourLabel = { explore: 'exploring', feed: 'feeding', sleep: 'asleep', escape: 'escaping' }
</script>

<template>
  <div class="wrap">
    <BodyScene ref="scene" :dn="dn" :state="state" :body="body" :channel="channel"
               :chase="chase" :paused="paused" @world="sense" @event="onEvent" />

    <header class="hud top-left">
      <p class="eyebrow">Fly to Dragon · Phase 4 · the control</p>
      <h1>{{ body === 'fly' ? 'A real fly brain, in a body it evolved for'
                             : 'The same brain, in a body it never did' }}</h1>
      <div class="swap">
        <button :class="{ on: body === 'fly' }" @click="body = 'fly'">Fly body</button>
        <button :class="{ on: body === 'dragon' }" @click="body = 'dragon'">Dragon body</button>
      </div>
      <p class="sub swapnote">
        Switching changes the morphology and the effectors — nothing upstream. Same
        connectome, same weights, same thresholds.
      </p>
      <p class="tally" v-if="tally.fly.n || tally.dragon.n">
        escapes survived · fly <b>{{ rate('fly') ?? '—' }}<span v-if="rate('fly') !== null">%</span></b>
        ({{ tally.fly.n }}) · dragon <b>{{ rate('dragon') ?? '—' }}<span v-if="rate('dragon') !== null">%</span></b>
        ({{ tally.dragon.n }})
        · prey taken <b>{{ tally[body].kills }}</b>
      </p>
      <p class="sub" v-if="info">
        {{ info.n.toLocaleString() }} neurons · {{ info.nnz.toLocaleString() }} synapses ·
        running live in this tab
      </p>
      <p class="sub loading" v-else>loading connectome…</p>
    </header>

    <section class="hud top-right" v-if="ready">
      <h2>Internal state</h2>
      <p class="behaviour" :class="state.behaviour">{{ behaviourLabel[state.behaviour] }}</p>
      <dl>
        <dt>Energy</dt><dd><i :style="{ width: pct(state.energy), background: '#34a09d' }" /><b>{{ pct(state.energy) }}</b></dd>
        <dt>Hunger</dt><dd><i :style="{ width: pct(state.hunger), background: '#ce7b24' }" /><b>{{ pct(state.hunger) }}</b></dd>
        <dt>Sleep pressure</dt><dd><i :style="{ width: pct(state.sleepPressure), background: '#9277d2' }" /><b>{{ pct(state.sleepPressure) }}</b></dd>
        <dt>Fear</dt><dd><i :style="{ width: pct(state.fear), background: '#c2504f' }" /><b>{{ pct(state.fear) }}</b></dd>
      </dl>
      <p class="gain">
        sugar-pathway gain <b>{{ Math.round(state.sugarGain) }} Hz</b>
        <span :class="state.canFeed ? 'ok' : 'no'">
          {{ state.canFeed ? 'above' : 'below' }} the measured 37 Hz feeding threshold
        </span>
      </p>
      <p class="gain">MN9 drives <b>{{ body === 'dragon' ? 'fire breath' : 'proboscis extension' }}</b></p>
      <p class="gain" v-if="scene?.sensing">
        odour <b>{{ Math.round((scene.sensing.smell ?? 0) * 100) }}%</b>
        · channel <b>{{ channel }}</b>
        · nearest prey
        <b>{{ scene.sensing.preyDist >= 0 ? scene.sensing.preyDist.toFixed(1) + ' m' : '—' }}</b>
      </p>
      <p class="gain">subjective time <b>{{ state.clockHours.toFixed(1) }} h</b> ·
        {{ state.night > 0.5 ? 'night' : 'day' }}</p>
      <label class="speed">life-seconds per real second
        <input id="speed" v-model.number="speed" type="range" min="60" max="2400" step="20" />
        <b>{{ speed }}×</b>
      </label>
    </section>

    <section class="hud bottom-left" v-if="ready">
      <h2>Descending vector</h2>
      <p class="sub">the entire brain–body interface · Hz, left / right hemisphere</p>
      <ul>
        <li v-for="r in dnRows" :key="r.ct" :class="{ dim: r.max < 1 }">
          <span class="ct">{{ r.ct }}</span>
          <span class="role" :style="{ color: roleColor[r.role] }">{{ r.role }}</span>
          <span class="bars">
            <i :style="{ width: Math.min(100, r.L / 2) + '%', background: roleColor[r.role] }" />
            <i :style="{ width: Math.min(100, r.R / 2) + '%', background: roleColor[r.role] }" />
          </span>
          <span class="num">{{ r.L.toFixed(0) }}/{{ r.R.toFixed(0) }}</span>
        </li>
      </ul>
    </section>

    <section class="hud world" v-if="ready">
      <div class="wtitle">
        <h2>World</h2>
        <button class="mini" @click="showWorld = !showWorld">{{ showWorld ? '–' : '+' }}</button>
      </div>
      <template v-if="showWorld">
        <div class="btns">
          <button @click="scene?.sendPredator()">Send predator</button>
          <button @click="poke({ energy: 0.3 })">Make hungry</button>
        </div>
        <div class="btns">
          <button @click="paused = !paused">{{ paused ? 'Resume' : 'Pause' }}</button>
          <button @click="chase = !chase">{{ chase ? 'Free camera' : 'Follow animal' }}</button>
        </div>
        <div class="btns">
          <button @click="poke({ startle: 1 })">Startle</button>
          <button @click="resetAll()">Reset</button>
        </div>
        <label class="sl">hunger
          <input id="hunger" type="range" min="0" max="1" step="0.01"
                 :value="state.hunger" @input="setHunger(+$event.target.value)" />
          <b>{{ Math.round(state.hunger * 100) }}%</b></label>
        <label class="sl">sleep pressure
          <input id="sleepp" type="range" min="0" max="1" step="0.01"
                 :value="state.sleepPressure" @input="setSleep(+$event.target.value)" />
          <b>{{ Math.round(state.sleepPressure * 100) }}%</b></label>
        <label class="sl">time of day
          <input id="hour" type="range" min="0" max="24" step="0.25"
                 :value="state.clockHours" @input="setHour(+$event.target.value)" />
          <b>{{ state.clockHours.toFixed(1) }}h</b></label>
        <p class="hint">drag to look · scroll to zoom · right-drag to pan</p>
      </template>
    </section>

    <footer class="hud bottom-right" v-if="info">
      <p>Connectome {{ info.provenance.connectome }}</p>
      <p>Annotations {{ info.provenance.annotations }}</p>
      <p class="warn">Neural dynamics, not consciousness.</p>
      <p class="warn">Odour raises turning — casting — from the connectome, but measurably
        does <em>not</em> resolve direction, so the directed approach to prey is an
        engineering stand-in. The strike itself (MN9) is connectome-driven.</p>
      <p class="warn">The deer are behaviour-tree NPCs; only the protagonist has a
        connectome.</p>
      <p class="warn">Dragon flight uses a declared lift multiplier (LIFT_FUDGE = 340);
        escape acceleration and turn rate follow the square-cube law with no fudge.</p>
      <p class="warn">{{ info.provenance.license }}</p>
    </footer>
  </div>
</template>

<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body, #__nuxt { margin: 0; height: 100%; background: #0d1316; }
.wrap { position: relative; height: 100vh; overflow: hidden;
  font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #dee5e7; }
.hud { position: absolute; background: rgba(13, 19, 22, .82); border: 1px solid #223038;
  border-radius: 4px; padding: 14px 16px; backdrop-filter: blur(8px); max-width: 340px; }
.top-left { top: 16px; left: 16px; max-width: 420px; }
.top-right { top: 16px; right: 16px; }
.bottom-left { bottom: 16px; left: 16px; max-width: 380px; }
.bottom-right { bottom: 16px; right: 16px; max-width: 320px; }
.eyebrow { font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase;
  color: #7e8d94; margin: 0 0 8px; }
h1 { font-family: Newsreader, Georgia, serif; font-weight: 500; font-size: 1.5rem;
  line-height: 1.15; margin: 0 0 8px; letter-spacing: -.01em; }
h2 { font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: #7e8d94;
  font-weight: 500; margin: 0 0 10px; }
.sub { font-size: 11.5px; color: #8ba0a8; margin: 0; line-height: 1.6; }
.loading { color: #ce7b24; }
.swap { display: flex; gap: 6px; margin: 10px 0 8px; }
.swap button { flex: 1; font: inherit; font-size: 11px; letter-spacing: .06em;
  text-transform: uppercase; padding: 7px 10px; border-radius: 3px; cursor: pointer;
  background: #16232a; color: #8ba0a8; border: 1px solid #223038; transition: .15s; }
.swap button.on { background: #34a09d; border-color: #34a09d; color: #0d1316; }
.swap button:hover:not(.on) { color: #dee5e7; border-color: #34a09d; }
.swap button:focus-visible { outline: 2px solid #34a09d; outline-offset: 2px; }
.swapnote { font-size: 10.5px; }
.tally { font-size: 11px; color: #8ba0a8; margin: 10px 0 0; }
.tally b { color: #dee5e7; }
.world { top: 50%; right: 16px; transform: translateY(-50%); width: 250px; }
.wtitle { display: flex; align-items: center; justify-content: space-between; }
.wtitle h2 { margin: 0 0 8px; }
.mini { background: none; border: 1px solid #223038; color: #8ba0a8; width: 22px;
  height: 20px; border-radius: 3px; cursor: pointer; font: inherit; line-height: 1; }
.btns { display: flex; gap: 6px; margin-bottom: 6px; }
.btns button { flex: 1; font: inherit; font-size: 10px; letter-spacing: .05em;
  text-transform: uppercase; padding: 7px 4px; border-radius: 3px; cursor: pointer;
  background: #16232a; color: #8ba0a8; border: 1px solid #223038; transition: .15s; }
.btns button:hover { color: #dee5e7; border-color: #34a09d; }
.btns button:focus-visible { outline: 2px solid #34a09d; outline-offset: 2px; }
.sl { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; font-size: 10px;
  color: #7e8d94; margin-top: 8px; align-items: center; }
.sl input { grid-column: 1 / -1; width: 100%; accent-color: #34a09d; }
.sl b { color: #dee5e7; font-size: 10px; }
.hint { font-size: 9.5px; color: #5f7078; margin: 10px 0 0; line-height: 1.5; }
.behaviour { font-family: Newsreader, Georgia, serif; font-size: 1.6rem; margin: 0 0 12px;
  color: #34a09d; }
.behaviour.escape { color: #c2504f; } .behaviour.feed { color: #ce7b24; }
.behaviour.sleep { color: #9277d2; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 7px 12px; margin: 0 0 12px;
  font-size: 11px; align-items: center; }
dt { color: #7e8d94; white-space: nowrap; }
dd { margin: 0; position: relative; height: 14px; background: #1a252b; border-radius: 2px; }
dd i { position: absolute; inset: 0 auto 0 0; border-radius: 2px; transition: width .2s; }
dd b { position: absolute; right: 5px; top: 0; font-size: 10px; line-height: 14px;
  font-weight: 500; }
.gain { font-size: 10.5px; color: #8ba0a8; margin: 0 0 6px; line-height: 1.7; }
.gain b { color: #dee5e7; } .ok { color: #34a09d; } .no { color: #7e8d94; }
.speed { display: block; font-size: 10.5px; color: #7e8d94; margin-top: 10px; }
.speed input { width: 100%; accent-color: #34a09d; margin-top: 5px; }
.bottom-left ul { list-style: none; margin: 0; padding: 0; display: flex;
  flex-direction: column; gap: 3px; }
.bottom-left li { display: grid; grid-template-columns: 54px 52px 1fr 44px; gap: 7px;
  align-items: center; font-size: 10px; }
.bottom-left li.dim { opacity: .35; }
.ct { color: #dee5e7; } .role { font-size: 9px; }
.bars { display: flex; flex-direction: column; gap: 1.5px; }
.bars i { height: 4px; border-radius: 1px; min-width: 1px; transition: width .15s; }
.num { text-align: right; color: #8ba0a8; font-variant-numeric: tabular-nums; }
.bottom-right p { font-size: 9.5px; color: #7e8d94; margin: 0 0 5px; line-height: 1.6; }
.warn { color: #8ba0a8; }
@media (max-width: 860px) {
  .hud { max-width: calc(100vw - 32px); }
  .bottom-left, .bottom-right, .top-right { display: none; }
  .world { top: auto; bottom: 16px; right: 16px; left: 16px; width: auto;
    transform: none; max-height: 45vh; overflow-y: auto; }
}
</style>
