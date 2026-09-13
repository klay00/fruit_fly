<script setup>
/* The fly's brain, as it actually is.
 *
 * The shell is the FlyWire brain surface. Every line is a real arbor from the public 783
 * skeletons, at its measured position: 685 projection neurons, all 96 MBONs, both APL, and
 * one in twelve Kenyon cells. Colour is what the cell is; brightness is its firing for the
 * position the fly chose -- so the decision can be traced through the anatomy it ran on.
 * Anterior view, the way FlyWire draws it. The viewer turns it; nothing turns by itself. */
import * as THREE from 'three'
import { TresCanvas, useRenderLoop, useTresContext } from '@tresjs/core'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const props = defineProps({
  brain: Object, arbors: Object, groups: Object,
  pn: { type: Array, default: () => [] }, kc: { type: Array, default: () => [] }, mbon: { type: Array, default: () => [] },
  thinking: Boolean,
})

const COL = { pn: new THREE.Color('#4fb3e8'), kc: new THREE.Color('#f0a640'), mbon: new THREE.Color('#ff4f6d'), apl: new THREE.Color('#8ee6c8') }
const DIM = 0.22, S = 7            // brain drawn 7 units wide

const kindOf = computed(() => {
  const k = {}
  if (!props.groups) return k
  for (const i of props.groups.pn) k[i] = 'pn'; for (const i of props.groups.kc) k[i] = 'kc'
  for (const i of props.groups.mbon) k[i] = 'mbon'; for (const i of props.groups.apl) k[i] = 'apl'
  return k
})
const activity = computed(() => {
  const a = {}
  if (!props.groups) return a
  const put = (idx, rates, scale) => { for (let i = 0; i < idx.length && i < rates.length; i++) a[idx[i]] = Math.min(1, rates[i] / scale) }
  put(props.groups.pn, props.pn, 220); put(props.groups.kc, props.kc, 1); put(props.groups.mbon, props.mbon, 120)
  return a
})

/* Unit-box coordinates -> centred, y flipped (FlyWire y grows ventral), z toward viewer. */
const place = (src) => {
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i += 3) { out[i] = (src[i] - 0.5) * S; out[i + 1] = (0.5 - src[i + 1]) * S * 0.5 * 2; out[i + 2] = (src[i + 2] - 0.5) * S }
  return out
}
// the brain box is ~2.6:1.2:1 (x:y:z) in the unit frame; keep aspect by not re-scaling axes
const brainGeo = computed(() => {
  const g = new THREE.BufferGeometry()
  if (!props.brain) return g
  g.setAttribute('position', new THREE.BufferAttribute(place(props.brain.positions), 3))
  g.setIndex(new THREE.BufferAttribute(props.brain.index, 1)); g.computeVertexNormals()
  return g
})
const lineGeo = computed(() => {
  const g = new THREE.BufferGeometry()
  if (!props.arbors) return g
  const pos = place(props.arbors.positions)
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length), 3))
  return g
})

const cur = {}
function paint(ease = 1) {
  const col = lineGeo.value.getAttribute('color'); if (!col || !props.arbors) return
  const per = props.arbors.neuron, k = kindOf.value, tgt = activity.value, c = new THREE.Color()
  let last = -1
  for (let s = 0; s < per.length; s++) {
    const n = per[s]
    if (n !== last) {
      last = n
      cur[n] = (cur[n] ?? 0) + ((tgt[n] ?? 0) - (cur[n] ?? 0)) * ease
      const v = cur[n], base = COL[k[n]] ?? COL.kc
      c.copy(base).multiplyScalar(DIM + v * 1.1).lerp(new THREE.Color('#fff8ea'), v * 0.5)
    }
    const i = s * 6
    col.array[i] = c.r; col.array[i + 1] = c.g; col.array[i + 2] = c.b
    col.array[i + 3] = c.r; col.array[i + 4] = c.g; col.array[i + 5] = c.b
  }
  col.needsUpdate = true
}
let settle = 0
watch([activity, lineGeo], () => { settle = 30 }, { immediate: true })
const { onLoop } = useRenderLoop()
onLoop(() => { if (settle > 0) { paint(0.25); settle-- } })

const Rig = defineComponent({ setup() {
  const { camera, renderer } = useTresContext(); let c
  onMounted(() => { c = new OrbitControls(camera.value, renderer.value.domElement); c.enableDamping = true
    c.minDistance = 4; c.maxDistance = 20; c.enablePan = false })
  onLoop(() => c?.update()); onUnmounted(() => c?.dispose()); return () => null } })

const counts = computed(() => ({
  pn: props.pn.filter((v) => v > 1).length, kc: props.kc.filter((v) => v > 0).length, mbon: props.mbon.filter((v) => v > 0.5).length,
}))
</script>

<template>
  <div class="map" :class="{ thinking }">
    <TresCanvas clear-color="#070b14">
      <TresPerspectiveCamera :position="[0, 0.3, 9]" :look-at="[0, 0, 0]" :args="[36, 1.6, 0.1, 60]" />
      <Rig />
      <TresAmbientLight :intensity="0.35" color="#6f8fbf" />
      <TresDirectionalLight :position="[3, 6, 8]" :intensity="0.9" color="#bcd3ff" />
      <TresMesh :geometry="brainGeo" :render-order="2">
        <TresMeshPhysicalMaterial color="#1a2a55" :transparent="true" :opacity="0.28" :roughness="0.35"
                                  :metalness="0.1" :side="THREE.DoubleSide" :depth-write="false" />
      </TresMesh>
      <TresLineSegments :geometry="lineGeo" :render-order="1">
        <TresLineBasicMaterial :vertex-colors="true" :transparent="true" :opacity="0.95"
                               :blending="THREE.AdditiveBlending" :depth-write="false" />
      </TresLineSegments>
    </TresCanvas>
    <ul class="legend">
      <li><i style="background:#4fb3e8" /> projection neurons <b>{{ counts.pn }}</b>/{{ groups?.pn.length ?? 0 }}</li>
      <li><i style="background:#f0a640" /> Kenyon cells <b>{{ counts.kc }}</b>/{{ groups?.kc.length ?? 0 }} <span>(1 in 12 drawn)</span></li>
      <li><i style="background:#ff4f6d" /> MBONs <b>{{ counts.mbon }}</b>/{{ groups?.mbon.length ?? 0 }}</li>
      <li><i style="background:#8ee6c8" /> APL</li>
    </ul>
    <p class="hint" v-if="!arbors">loading arbors…</p>
  </div>
</template>

<style scoped>
.map { position: relative; width: 100%; aspect-ratio: 1.6; border-radius: 4px; overflow: hidden; border: 1px solid #2a3238; }
.map.thinking { box-shadow: inset 0 0 0 1px #d29a4a66; }
.legend { position: absolute; left: 8px; bottom: 6px; margin: 0; padding: 0; list-style: none; font-size: 9.5px; color: #98a3aa; line-height: 1.6; }
.legend i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.legend b { color: #e6e1d6; } .legend span { color: #5f6b72; }
.hint { position: absolute; inset: 0; margin: 0; display: grid; place-items: center; font-size: 11px; color: #d29a4a; }
</style>
