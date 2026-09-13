<script setup>
/* The board. Pieces are keyed by a stable id so a move animates the piece rather than
 * deleting one and creating another. The fly flies to the piece, carries it, sets it down. */
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useTresContext, useRenderLoop } from '@tresjs/core'
import * as THREE from 'three'

const props = defineProps({
  pieces: { type: Array, required: true },     // [{ id, type, color, square }]
  selected: { type: String, default: null },
  legalTo: { type: Array, default: () => [] },
  lastMove: { type: Object, default: null },   // { from, to }
  flyMove: { type: Object, default: null },    // { id, from, to, t0 } in-flight animation
  thinking: { type: Boolean, default: false },
  candidates: { type: Array, default: () => [] }, // [{ from, to, value }]
})
const emit = defineEmits(['square'])

const sq = (s) => ({ x: s.charCodeAt(0) - 97 - 3.5, z: 3.5 - (+s[1] - 1) })
const files = 'abcdefgh'
const squares = []
for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++)
  squares.push({ name: files[f] + (r + 1), x: f - 3.5, z: 3.5 - r, light: (r + f) % 2 === 1 })

const phase = ref(0)
const fly = reactive({ x: 0, y: 3.2, z: 5, carry: 0 })
const { onLoop } = useRenderLoop()

/* Fly choreography for a move: hover -> descend on `from` -> lift -> glide to `to` -> set
 * down -> rise. Duration 1.6 s. Piece position is interpolated by the same clock. */
const DUR = 1.6
const piecePos = (p) => {
  const base = sq(p.square)
  const m = props.flyMove
  if (m && m.id === p.id) {
    const t = Math.min(1, (performance.now() - m.t0) / 1000 / DUR)
    const a = sq(m.from), b = sq(m.to)
    const k = t < 0.3 ? 0 : t > 0.8 ? 1 : (t - 0.3) / 0.5
    const e = k * k * (3 - 2 * k)
    const lift = t < 0.3 ? t / 0.3 : t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1
    return { x: a.x + (b.x - a.x) * e, z: a.z + (b.z - a.z) * e, lift: Math.max(0, lift) }
  }
  return { x: base.x, z: base.z, lift: 0 }
}

onLoop(({ delta, elapsed }) => {
  phase.value = elapsed
  const m = props.flyMove
  let tx = 0, tz = 5.2, ty = 3.2
  if (m) {
    const t = Math.min(1, (performance.now() - m.t0) / 1000 / DUR)
    const a = sq(m.from), b = sq(m.to)
    const k = t < 0.3 ? 0 : t > 0.8 ? 1 : (t - 0.3) / 0.5
    const e = k * k * (3 - 2 * k)
    tx = a.x + (b.x - a.x) * e; tz = a.z + (b.z - a.z) * e
    ty = 1.4 + (t < 0.3 ? (1 - t / 0.3) * 1.2 : t > 0.8 ? ((t - 0.8) / 0.2) * 1.2 : 0)
  } else if (props.thinking) {
    tx = Math.sin(elapsed * 0.9) * 2.2; tz = 1.5 + Math.cos(elapsed * 0.7) * 1.5; ty = 2.6
  }
  const k = Math.min(1, delta * 5)
  fly.x += (tx - fly.x) * k; fly.z += (tz - fly.z) * k; fly.y += (ty - fly.y) * k
})

const candMap = computed(() => {
  const m = {}
  if (!props.candidates.length) return m
  const vals = props.candidates.map((c) => c.value)
  const lo = Math.min(...vals), hi = Math.max(...vals)
  for (const c of props.candidates) m[c.to] = hi > lo ? (c.value - lo) / (hi - lo) : 0.5
  return m
})

const CameraRig = defineComponent({
  setup() {
    const { camera, renderer } = useTresContext()
    let c
    onMounted(() => { c = new OrbitControls(camera.value, renderer.value.domElement)
      c.enableDamping = true; c.maxPolarAngle = Math.PI * 0.47; c.minDistance = 6; c.maxDistance = 22
      c.target.set(0, 0, 0) })
    onLoop(() => c?.update())
    onUnmounted(() => c?.dispose())
    return () => null
  },
})
</script>

<template>
  <TresCanvas clear-color="#151a1e" window-size shadows>
    <TresPerspectiveCamera :position="[0, 9.5, 9.5]" :look-at="[0, 0, 0]" :args="[42, 1, 0.1, 100]" />
    <CameraRig />
    <TresHemisphereLight :args="['#cfd8e2', '#2a2622', 0.7]" />
    <TresDirectionalLight :position="[6, 12, 5]" :intensity="1.6" color="#fff1dc" cast-shadow
                          :shadow-mapSize-width="2048" :shadow-mapSize-height="2048" />
    <TresPointLight :position="[-5, 6, -4]" :intensity="18" color="#8fb4d6" />

    <!-- table and board frame -->
    <TresMesh :position="[0, -0.32, 0]" receive-shadow>
      <TresCylinderGeometry :args="[9.5, 9.5, 0.3, 48]" />
      <TresMeshStandardMaterial color="#3b2a1f" :roughness="0.7" />
    </TresMesh>
    <TresMesh :position="[0, -0.11, 0]" receive-shadow>
      <TresBoxGeometry :args="[8.9, 0.22, 8.9]" />
      <TresMeshStandardMaterial color="#4a3526" :roughness="0.55" :metalness="0.05" />
    </TresMesh>
    <TresMesh v-for="s in squares" :key="s.name" :position="[s.x, 0.005, s.z]"
              :rotation="[-Math.PI / 2, 0, 0]" receive-shadow @click="emit('square', s.name)"
              @pointer-enter="() => {}">
      <TresPlaneGeometry :args="[1, 1]" />
      <TresMeshStandardMaterial
        :color="s.name === selected ? '#6f9d7a' : legalTo.includes(s.name) ? (s.light ? '#b9c9a0' : '#7c8f66')
                : (lastMove && (lastMove.from === s.name || lastMove.to === s.name)) ? (s.light ? '#d9c98a' : '#9c8a4f')
                : s.light ? '#e6d6b8' : '#6e4d36'"
        :roughness="0.6" />
    </TresMesh>
    <!-- the fly's evaluation, painted on the board: warm = preferred -->
    <TresMesh v-for="(v, name) in candMap" :key="'c' + name" :position="[sq(name).x, 0.02, sq(name).z]"
              :rotation="[-Math.PI / 2, 0, 0]">
      <TresPlaneGeometry :args="[0.9, 0.9]" />
      <TresMeshBasicMaterial :color="new THREE.Color().setHSL(0.08 + (1 - v) * 0.5, 0.75, 0.5)"
                             :transparent="true" :opacity="0.12 + v * 0.45" />
    </TresMesh>
    <TresMesh v-for="(v, name) in candMap" :key="'r' + name" :position="[sq(name).x, 0.03, sq(name).z]"
              :rotation="[-Math.PI / 2, 0, 0]">
      <TresRingGeometry :args="[0.38, 0.44, 32]" />
      <TresMeshBasicMaterial :color="new THREE.Color().setHSL(0.08 + (1 - v) * 0.5, 0.8, 0.55)" :transparent="true" :opacity="0.35 + v * 0.5" />
    </TresMesh>

    <TresGroup v-for="p in pieces" :key="p.id" :position="[piecePos(p).x, 0.01, piecePos(p).z]">
      <Piece3D :type="p.type" :color="p.color" :selected="p.square === selected" :lifted="piecePos(p).lift" />
    </TresGroup>

    <TresGroup :position="[fly.x, fly.y, fly.z]" :rotation="[0.1, Math.atan2(fly.x, fly.z + 2) + Math.PI, Math.sin(phase * 2) * 0.05]">
      <Fly3D :phase="phase" :thinking="thinking" />
    </TresGroup>
  </TresCanvas>
</template>
