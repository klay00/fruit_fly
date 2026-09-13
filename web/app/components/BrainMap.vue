<script setup>
/* The fly's brain, as it actually is.
 *
 * Every point is one of the 5,960 neurons in the circuit, at its measured position in
 * the FlyWire brain. Not a diagram: the calyx, the lobes and the antennal lobe are where
 * they are because that is where these cells are. Brightness is the cell's firing rate
 * for the position the fly chose; colour is what it is -- projection neuron, Kenyon cell,
 * MBON, APL. So you can see which part of the brain the decision passed through and
 * how much of it took part. */
import * as THREE from 'three'
import { TresCanvas, useRenderLoop } from '@tresjs/core'

const props = defineProps({
  positions: { type: Array, default: null },
  groups: { type: Object, default: null },
  pn: { type: Array, default: () => [] },
  kc: { type: Array, default: () => [] },
  mbon: { type: Array, default: () => [] },
  thinking: { type: Boolean, default: false },
})

const COLOURS = { pn: new THREE.Color('#5bb0d6'), kc: new THREE.Color('#d29a4a'),
                  mbon: new THREE.Color('#e4574f'), apl: new THREE.Color('#9fd0b0') }
const DIM = 0.16

const n = computed(() => (props.positions ? props.positions.length / 3 : 0))
const kind = computed(() => {
  const k = new Uint8Array(n.value)             // 0 pn 1 kc 2 mbon 3 apl
  if (!props.groups) return k
  for (const i of props.groups.kc) k[i] = 1
  for (const i of props.groups.mbon) k[i] = 2
  for (const i of props.groups.apl) k[i] = 3
  return k
})

const geometry = computed(() => {
  const g = new THREE.BufferGeometry()
  if (!props.positions) return g
  const pos = new Float32Array(n.value * 3)
  for (let i = 0; i < n.value * 3; i++) pos[i] = (props.positions[i] - 0.5) * 6
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n.value * 3), 3))
  g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n.value).fill(1), 1))
  return g
})

/* Activity per neuron in `keep` order, from the three group vectors. */
const activity = computed(() => {
  const a = new Float32Array(n.value)
  if (!props.groups) return a
  const put = (idx, rates, scale) => { for (let i = 0; i < idx.length && i < rates.length; i++) a[idx[i]] = Math.min(1, rates[i] / scale) }
  put(props.groups.pn, props.pn, 220)
  put(props.groups.kc, props.kc, 1)
  put(props.groups.mbon, props.mbon, 120)
  return a
})

const target = ref(new Float32Array(0))
const current = ref(new Float32Array(0))
watch(activity, (a) => { target.value = a; if (current.value.length !== a.length) current.value = new Float32Array(a.length) }, { immediate: true })

const pointsRef = shallowRef()
const { onLoop } = useRenderLoop()
onLoop(({ delta, elapsed }) => {
  const g = geometry.value, col = g.getAttribute('color'), sz = g.getAttribute('size')
  if (!col || !current.value.length) return
  const k = kind.value, cur = current.value, tgt = target.value
  const ease = Math.min(1, delta * 6)
  const pulse = props.thinking ? 0.5 + 0.5 * Math.sin(elapsed * 6) : 0
  const c = new THREE.Color()
  for (let i = 0; i < n.value; i++) {
    cur[i] += (tgt[i] - cur[i]) * ease
    const base = COLOURS[['pn', 'kc', 'mbon', 'apl'][k[i]]]
    const v = cur[i]
    // dim resting cells to a ghost of their colour; active ones burn toward white
    c.copy(base).multiplyScalar(DIM + v * 0.9).lerp(new THREE.Color('#fff4e0'), v * 0.45)
    if (props.thinking && k[i] === 1 && v < 0.05) c.multiplyScalar(1 + pulse * 0.6)
    col.setXYZ(i, c.r, c.g, c.b)
    sz.setX(i, k[i] === 1 ? 1 + v * 2.2 : k[i] === 2 ? 2.2 + v * 3 : k[i] === 3 ? 3.5 : 1.6 + v * 1.5)
  }
  col.needsUpdate = true; sz.needsUpdate = true
  if (pointsRef.value) pointsRef.value.rotation.y = elapsed * 0.12
})

const vert = `attribute float size; varying vec3 vC;
  void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = size * (140.0 / -mv.z); gl_Position = projectionMatrix * mv; }`
const frag = `varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d);
  if (r > 0.25) discard; float a = smoothstep(0.25, 0.05, r);
  gl_FragColor = vec4(vC * (0.6 + 0.8 * a), a); }`

const counts = computed(() => {
  const act = (arr, thr) => arr.filter((v) => v > thr).length
  return { pn: act(props.pn, 1), kc: act(props.kc, 0), mbon: act(props.mbon, 0.5) }
})
</script>

<template>
  <div class="map">
    <TresCanvas clear-color="#0f1316" :alpha="false">
      <TresPerspectiveCamera :position="[0, 1.2, 6.2]" :look-at="[0, 0, 0]" :args="[38, 1, 0.1, 50]" />
      <TresPoints ref="pointsRef" :geometry="geometry">
        <TresShaderMaterial :vertex-shader="vert" :fragment-shader="frag" :vertex-colors="true"
                            :transparent="true" :depth-write="false" :blending="THREE.AdditiveBlending" />
      </TresPoints>
    </TresCanvas>
    <ul class="legend">
      <li><i style="background:#5bb0d6" /> projection neurons <b>{{ counts.pn }}</b>/{{ groups?.pn.length ?? 0 }}</li>
      <li><i style="background:#d29a4a" /> Kenyon cells <b>{{ counts.kc }}</b>/{{ groups?.kc.length ?? 0 }}</li>
      <li><i style="background:#e4574f" /> MBONs <b>{{ counts.mbon }}</b>/{{ groups?.mbon.length ?? 0 }}</li>
      <li><i style="background:#9fd0b0" /> APL (inhibition) {{ groups?.apl.length ?? 0 }}</li>
    </ul>
  </div>
</template>

<style scoped>
.map { position: relative; width: 100%; aspect-ratio: 1.15; border-radius: 4px; overflow: hidden; border: 1px solid #2a3238; }
.legend { position: absolute; left: 8px; bottom: 6px; margin: 0; padding: 0; list-style: none; font-size: 9.5px; color: #98a3aa; line-height: 1.6; }
.legend i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.legend b { color: #e6e1d6; }
</style>
