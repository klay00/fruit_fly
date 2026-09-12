<script setup>
import { TresCanvas } from '@tresjs/core'
import * as THREE from 'three'
import { drive, FLY, DRAGON } from '../composables/useBody.js'
import { groundHeight, WORLD_RADIUS } from '../composables/useTerrain.js'

const props = defineProps({
  dn: Object, state: Object,
  body: { type: String, default: 'fly' },
  channel: { type: String, default: 'rest' },
  chase: { type: Boolean, default: true },
  paused: { type: Boolean, default: false },
})
const emit = defineEmits(['world', 'event'])

const morph = computed(() => (props.body === 'dragon' ? DRAGON : FLY))
const cmd = computed(() => drive(props.dn ?? {}, morph.value))
/* Agility relative to the fly, straight from the morphology. The dragon's escape
 * acceleration is 2000x lower, so the same DN command displaces it proportionally less.
 * That single ratio is the Phase 5 result, made visible. */
const agility = computed(() => morph.value.escapeAccel / FLY.escapeAccel)

const bodyRef = shallowRef(), preyRef = shallowRef()
const self = reactive({ x: 0, y: 3, z: 0, heading: 0, vx: 0, vz: 0, vy: 0 })
const predator = reactive({ x: -80, y: 20, z: -80, active: false, t: 0, next: 12 })
const stats = reactive({ encounters: 0, escaped: 0, hits: 0, kills: 0 })
const sensing = reactive({ smell: 0, preyDist: -1 })
const phase = ref(0)
const flash = reactive({ life: 0, x: 0, z: 0 })

watch(() => props.body, () => {
  stats.encounters = stats.escaped = stats.hits = stats.kills = 0
  predator.active = false; predator.t = 0; predator.next = 8
  self.x = 0; self.z = 0; self.y = 3; self.vx = self.vz = 0
})

let prevAngle = 0
function looming(dt) {
  if (!predator.active) { prevAngle = 0; return { loomL: 0, loomR: 0 } }
  const dx = predator.x - self.x, dz = predator.z - self.z, dy = predator.y - self.y
  const dist = Math.max(0.5, Math.hypot(dx, dy, dz))
  const angle = 2 * Math.atan(1.6 / dist)
  const growth = Math.max(0, (angle - prevAngle) / Math.max(dt, 1e-3))
  prevAngle = angle
  const strength = Math.min(1, angle / 0.7) * 0.5 + Math.min(1, growth * 2.2) * 0.5
  const bearing = Math.atan2(dx, dz) - self.heading
  const b = Math.atan2(Math.sin(bearing), Math.cos(bearing))
  return { loomL: b < 0 ? strength : strength * 0.15,
           loomR: b > 0 ? strength : strength * 0.15 }
}

/* Odour from the herd. Measured fact (see results/phase6): driving the olfactory neurons
 * raises the steering DNs but does NOT lateralise -- left and right nostrils give the same
 * sign. So smell is reported as a single scalar and produces casting, the undirected
 * turning a fly does inside a plume. It does not tell the animal which way the prey is. */
function odour() {
  const herd = preyRef.value?.herd ?? []
  let best = null, bd = Infinity
  for (const d of herd) {
    if (!d.alive) continue
    const dist = Math.hypot(d.x - self.x, d.z - self.z)
    if (dist < bd) { bd = dist; best = d }
  }
  return { strength: best ? Math.max(0, 1 - bd / 26) : 0, dist: bd, target: best }
}

let acc = 0
const { onLoop } = useRenderLoop()
onLoop(({ delta }) => {
  if (props.paused) return
  const dt = Math.min(delta, 0.05)
  phase.value += dt
  const c = cmd.value, m = morph.value, st = props.state ?? {}
  const ag = agility.value

  // --- the aerial predator that produces looming
  predator.t += dt
  if (!predator.active && predator.t > predator.next) {
    predator.active = true; predator.t = 0; stats.encounters++
    const a = Math.random() * Math.PI * 2
    predator.x = self.x + Math.cos(a) * 34
    predator.z = self.z + Math.sin(a) * 34
    predator.y = self.y + 9
  }
  if (predator.active) {
    const dx = self.x - predator.x, dy = (self.y + 1) - predator.y, dz = self.z - predator.z
    const d = Math.hypot(dx, dy, dz)
    const sp = (17 * dt) / Math.max(d, 0.001)
    predator.x += dx * sp; predator.y += dy * sp; predator.z += dz * sp
    if (d < 2.2) {
      predator.active = false; predator.t = 0; predator.next = 11 + Math.random() * 9
      stats.hits++; emit('event', { type: 'hit' })
      predator.x = -80; predator.y = 20; predator.z = -80
    } else if (predator.t > 5.5) {
      predator.active = false; predator.t = 0; predator.next = 11 + Math.random() * 9
      stats.escaped++; emit('event', { type: 'escaped' })
      predator.x = -80; predator.y = 20; predator.z = -80
    }
  }

  const od = odour()
  // Surface what the animal is actually sensing, so a quiet page can be told apart from a
  // broken one -- the difference that took a bug report to notice.
  sensing.smell = od.strength
  sensing.preyDist = Number.isFinite(od.dist) ? od.dist : -1
  acc += dt
  if (acc > 0.1) {
    acc = 0
    emit('world', { ...looming(dt), smell: od.strength, sugarNear: od.dist < 2.2 ? 1 : 0 })
  }

  const asleep = st.behaviour === 'sleep'
  const feeding = st.behaviour === 'feed'
  const fleeing = st.behaviour === 'escape' || c.escape > 0.4

  // --- steering. Connectome-driven where the measurements support it, and only there.
  // Angular velocity is accumulated and then clamped once, rather than letting three
  // separate terms each add an unbounded amount to the heading.
  let omega = 0
  if (!asleep) {
    // Directional turn, from the differential -- but ONLY for looming. Olfaction produces
    // a large, persistent left/right imbalance that does not encode direction (measured:
    // -73 from the left nostril, -53 from the right, same sign). Applying it as a turn
    // command made the animal pivot on the spot at full deflection for as long as it could
    // smell anything, which is exactly what it looked like.
    if (props.channel === 'loom') omega += c.steer * m.turnRate
    if (fleeing) {
      omega += 1.6 * (0.15 + 0.85 * ag)
    } else if (od.strength > 0.04) {
      // Casting: the odour response raises turning without pointing anywhere, so it is
      // applied as the amplitude of a slow side-to-side sweep, not as a turn direction.
      omega += Math.sin(phase.value * 1.6) * (0.4 + 1.4 * c.arousal) * od.strength * 1.4
      // engineering: a directed approach on top of casting. The corridor has no pathway
      // that resolves odour direction, so without this the animal finds prey only by luck.
      // Labelled here and in the UI; it is not a connectome result.
      if (od.target && (st.hunger ?? 0) > 0.15) {
        const want = Math.atan2(od.target.x - self.x, od.target.z - self.z)
        const err = Math.atan2(Math.sin(want - self.heading), Math.cos(want - self.heading))
        omega += err * 1.2
      }
    }
  }
  // A body cannot pivot faster than its own turn rate, whatever the brain asks for.
  const omegaMax = Math.max(0.6, m.turnRate)
  self.heading += Math.max(-omegaMax, Math.min(omegaMax, omega)) * dt

  const burst = fleeing ? 1 + 5.5 * ag : 1
  const hunting = !asleep && !fleeing && od.strength > 0.04 && (st.hunger ?? 0) > 0.15
  const speed = asleep ? 0
    : (props.body === 'dragon' ? 7.5 : 5.2) * (hunting ? 1.35 : 1) * burst * (0.35 + c.thrust)
  self.vx += (Math.sin(self.heading) * speed - self.vx) * Math.min(1, dt * 3)
  self.vz += (Math.cos(self.heading) * speed - self.vz) * Math.min(1, dt * 3)
  self.x += self.vx * dt; self.z += self.vz * dt

  const gh = groundHeight(self.x, self.z)
  const wantY = gh + (asleep ? 0.55 : feeding ? 0.95 : 2.6 + (fleeing ? 3.2 * ag : 0))
  self.vy += ((wantY - self.y) * 3.4 - self.vy) * Math.min(1, dt * 6)
  self.y += self.vy * dt

  const r = WORLD_RADIUS * 0.82
  const fc = Math.hypot(self.x, self.z)
  if (fc > r) { self.x *= r / fc; self.z *= r / fc; self.heading += Math.PI * dt * 2 }

  flash.life = Math.max(0, flash.life - dt * 1.4)

  if (bodyRef.value) {
    bodyRef.value.position.set(self.x, self.y, self.z)
    const bank = -Math.max(-0.5, Math.min(0.5, c.steer * 0.8))
    bodyRef.value.rotation.set(asleep ? 0.3 : -0.12, self.heading, bank)
  }
})

function onCaught(e) {
  stats.kills++
  flash.life = 1; flash.x = e.x; flash.z = e.z
  emit('event', { type: 'kill' })
}

function sendPredator() {
  if (predator.active) return
  predator.active = true; predator.t = 0; stats.encounters++
  const a = Math.random() * Math.PI * 2
  predator.x = self.x + Math.cos(a) * 34
  predator.z = self.z + Math.sin(a) * 34
  predator.y = self.y + 9
}
function resetWorld() {
  self.x = 0; self.z = 0; self.y = 3; self.vx = self.vz = 0; self.heading = 0
  predator.active = false; predator.t = 0; predator.next = 10
  stats.encounters = stats.escaped = stats.hits = stats.kills = 0
}
defineExpose({ stats, sensing, self, sendPredator, resetWorld,
               preyAlive: computed(() => preyRef.value?.alive ?? 0) })
</script>

<template>
  <TresCanvas clear-color="#a8c6dd" window-size :shadows="false">
    <TresPerspectiveCamera :position="[0, 12, 24]" :look-at="[0, 2, 0]" :args="[55, 1, 0.1, 400]" />
    <CameraRig :follow="self" :chase="chase" />

    <WorldEnvironment :radius="WORLD_RADIUS" />

    <WorldPrey ref="preyRef" :hunter="self" :paused="paused" :count="8"
               :radius="WORLD_RADIUS * 0.6" @caught="onCaught" />

    <TresGroup ref="bodyRef">
      <WorldCreature :body="body" :behaviour="state?.behaviour ?? 'explore'"
                     :feed="cmd.feed" :wing-phase="phase" />
    </TresGroup>

    <!-- aerial predator: a raptor silhouette, the source of the looming stimulus -->
    <TresGroup v-if="predator.active" :position="[predator.x, predator.y, predator.z]"
               :rotation="[0.25, Math.atan2(self.x - predator.x, self.z - predator.z), 0]">
      <TresMesh :rotation="[Math.PI / 2, 0, 0]" :scale="[1, 1, 2.1]">
        <TresCapsuleGeometry :args="[0.42, 0.8, 6, 10]" />
        <TresMeshStandardMaterial color="#3c3128" :roughness="0.85" />
      </TresMesh>
      <TresMesh v-for="s in [-1, 1]" :key="'pw' + s" :position="[s * 1.5, 0.1, -0.2]"
                :rotation="[Math.PI / 2, 0, s * 0.35]">
        <TresCircleGeometry :args="[1.7, 12, 0, Math.PI]" />
        <TresMeshStandardMaterial color="#4a3d30" :roughness="0.9" :side="THREE.DoubleSide" />
      </TresMesh>
      <TresMesh :position="[0, 0.05, 1.35]" :rotation="[Math.PI / 2, 0, 0]">
        <TresConeGeometry :args="[0.16, 0.5, 6]" />
        <TresMeshStandardMaterial color="#d0a63c" :roughness="0.5" />
      </TresMesh>
    </TresGroup>

    <TresMesh v-if="flash.life > 0.02"
              :position="[flash.x, groundHeight(flash.x, flash.z) + 0.4, flash.z]">
      <TresSphereGeometry :args="[0.5 + (1 - flash.life) * 2.2, 14, 10]" />
      <TresMeshBasicMaterial color="#d8894a" :transparent="true" :opacity="flash.life * 0.4" />
    </TresMesh>
  </TresCanvas>
</template>
