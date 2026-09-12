<script setup>
/* Prey: a small herd of deer that graze, notice a predator, and run.
 *
 * These are NPCs. Constitution V: only the protagonist gets a connectome; a behaviour tree
 * with a flee radius is the right amount of machinery for an animal whose job is to be
 * hunted. Modelling them neurally would cost as much as the protagonist and answer nothing.
 *
 * Herd cohesion is three boid rules (separation, alignment, cohesion) plus a flee vector,
 * because a herd that scatters individually does not read as a herd.
 */
import * as THREE from 'three'
import { groundHeight } from '../../composables/useTerrain.js'

const props = defineProps({
  hunter: { type: Object, required: true },   // { x, y, z }
  count: { type: Number, default: 7 },
  paused: { type: Boolean, default: false },
  radius: { type: Number, default: 38 },
})
const emit = defineEmits(['caught'])

const FLEE_RADIUS = 11      // deer notice a predator at this range
const PANIC_RADIUS = 6      // ... and sprint inside it
const CATCH_RADIUS = 1.5
const GRAZE_SPEED = 0.7
const FLEE_SPEED = 7.2

function make(i) {
  const a = (i / props.count) * Math.PI * 2 + 0.4
  const d = 14 + (i % 3) * 5
  const x = Math.cos(a) * d, z = Math.sin(a) * d
  return { id: i, x, z, y: groundHeight(x, z), vx: 0, vz: 0, heading: a,
           alive: true, alarm: 0, gait: Math.random() * 6.28, respawn: 0 }
}
const herd = reactive(Array.from({ length: props.count }, (_, i) => make(i)))
const alive = computed(() => herd.filter((d) => d.alive).length)

const { onLoop } = useRenderLoop()
onLoop(({ delta }) => {
  if (props.paused) return
  const dt = Math.min(delta, 0.05)
  const H = props.hunter

  for (const d of herd) {
    if (!d.alive) {
      d.respawn -= dt
      if (d.respawn <= 0) { Object.assign(d, make(d.id)); }
      continue
    }

    const dx = d.x - H.x, dz = d.z - H.z
    const dist = Math.hypot(dx, dz)

    if (dist < CATCH_RADIUS) {
      d.alive = false; d.respawn = 9 + Math.random() * 6
      emit('caught', { id: d.id, x: d.x, z: d.z })
      continue
    }

    d.alarm = dist < FLEE_RADIUS
      ? Math.min(1, d.alarm + dt * (dist < PANIC_RADIUS ? 5 : 1.8))
      : Math.max(0, d.alarm - dt * 0.55)

    // --- boids over the living herd, plus a flee vector away from the hunter
    let sx = 0, sz = 0, ax = 0, az = 0, cx = 0, cz = 0, n = 0
    for (const o of herd) {
      if (o === d || !o.alive) continue
      const ox = d.x - o.x, oz = d.z - o.z
      const od = Math.hypot(ox, oz)
      if (od < 9) {
        n++; cx += o.x; cz += o.z; ax += o.vx; az += o.vz
        if (od < 3.2 && od > 0.001) { sx += ox / od; sz += oz / od }
      }
    }
    let wx = sx * 1.6, wz = sz * 1.6
    if (n) {
      wx += (ax / n) * 0.35 + ((cx / n) - d.x) * 0.06
      wz += (az / n) * 0.35 + ((cz / n) - d.z) * 0.06
    }
    if (d.alarm > 0.02 && dist > 0.001) {
      wx += (dx / dist) * d.alarm * 9
      wz += (dz / dist) * d.alarm * 9
    } else {
      // grazing wander
      wx += Math.cos(d.gait * 0.7) * 0.35
      wz += Math.sin(d.gait * 0.9) * 0.35
    }
    // keep the herd inside the field
    const fromCentre = Math.hypot(d.x, d.z)
    if (fromCentre > props.radius) {
      wx -= (d.x / fromCentre) * (fromCentre - props.radius) * 0.9
      wz -= (d.z / fromCentre) * (fromCentre - props.radius) * 0.9
    }

    const want = GRAZE_SPEED + (FLEE_SPEED - GRAZE_SPEED) * d.alarm
    const wl = Math.hypot(wx, wz) || 1
    d.vx += ((wx / wl) * want - d.vx) * Math.min(1, dt * 3.2)
    d.vz += ((wz / wl) * want - d.vz) * Math.min(1, dt * 3.2)
    d.x += d.vx * dt; d.z += d.vz * dt
    d.y = groundHeight(d.x, d.z)
    const sp = Math.hypot(d.vx, d.vz)
    if (sp > 0.05) d.heading = Math.atan2(d.vx, d.vz)
    d.gait += dt * (2 + sp * 1.6)
  }
})

defineExpose({ herd, alive })
</script>

<template>
  <TresGroup v-for="d in herd" :key="d.id">
    <TresGroup v-if="d.alive" :position="[d.x, d.y + 0.62, d.z]" :rotation="[0, d.heading, 0]">
      <!-- barrel body -->
      <TresMesh :rotation="[Math.PI / 2, 0, 0]" :scale="[1, 1, 0.82]">
        <TresCapsuleGeometry :args="[0.26, 0.5, 6, 12]" />
        <TresMeshStandardMaterial :color="d.alarm > 0.4 ? '#8a6240' : '#7a5738'"
                                  :roughness="0.9" />
      </TresMesh>
      <!-- neck + head, lowered while grazing, raised when alarmed -->
      <TresMesh :position="[0, 0.2 + d.alarm * 0.28, 0.42]"
                :rotation="[0.95 - d.alarm * 0.85, 0, 0]">
        <TresCylinderGeometry :args="[0.08, 0.11, 0.46, 7]" />
        <TresMeshStandardMaterial color="#7a5738" :roughness="0.9" />
      </TresMesh>
      <TresMesh :position="[0, 0.36 + d.alarm * 0.5, 0.62 + d.alarm * 0.04]"
                :rotation="[0.5 - d.alarm * 0.5, 0, 0]" :scale="[0.8, 0.8, 1.25]">
        <TresSphereGeometry :args="[0.13, 12, 10]" />
        <TresMeshStandardMaterial color="#6d4d31" :roughness="0.88" />
      </TresMesh>
      <TresMesh v-for="s in [-1, 1]" :key="'ear' + s"
                :position="[s * 0.09, 0.47 + d.alarm * 0.5, 0.58]" :rotation="[0, 0, s * 0.7]">
        <TresConeGeometry :args="[0.045, 0.15, 5]" />
        <TresMeshStandardMaterial color="#5c4027" :roughness="0.9" />
      </TresMesh>
      <!-- four legs, trotting -->
      <TresMesh v-for="(L, i) in [[0.3, 0.28], [0.3, -0.26], [-0.3, 0.28], [-0.3, -0.26]]"
                :key="'pl' + i"
                :position="[L[0] * 0.62, -0.34, L[1]]"
                :rotation="[Math.sin(d.gait + i * 1.7) * (0.2 + d.alarm * 0.7), 0, 0]">
        <TresCylinderGeometry :args="[0.042, 0.055, 0.66, 6]" />
        <TresMeshStandardMaterial color="#5f4429" :roughness="0.9" />
      </TresMesh>
      <TresMesh :position="[0, 0.12, -0.5]" :rotation="[0.6 - d.alarm * 1.1, 0, 0]">
        <TresConeGeometry :args="[0.06, 0.2, 6]" />
        <TresMeshStandardMaterial color="#e0d5c2" :roughness="0.85" />
      </TresMesh>
    </TresGroup>
  </TresGroup>
</template>
