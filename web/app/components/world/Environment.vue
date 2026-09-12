<script setup>
/* Sky, ground and vegetation.
 *
 * Scattering uses a seeded generator rather than Math.random(), so the same world comes
 * back on every reload and two runs are actually comparable. Trees and grass are
 * InstancedMesh: thousands of blades cost one draw call, not one per blade.
 */
import * as THREE from 'three'
import { groundHeight } from '../../composables/useTerrain.js'

const props = defineProps({
  radius: { type: Number, default: 60 },
  treeCount: { type: Number, default: 90 },
  grassCount: { type: Number, default: 2600 },
  seed: { type: Number, default: 7 },
})

function rng(seed) {           // mulberry32
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ground = computed(() => {
  const seg = 120
  const g = new THREE.PlaneGeometry(props.radius * 2, props.radius * 2, seg, seg)
  g.rotateX(-Math.PI / 2)
  const pos = g.attributes.position
  const colour = []
  const near = new THREE.Color('#4e7a3a')
  const far = new THREE.Color('#63904a')
  const dry = new THREE.Color('#84964f')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    pos.setY(i, groundHeight(x, z))
    const t = Math.min(1, Math.hypot(x, z) / props.radius)
    const c = near.clone().lerp(far, t)
      .lerp(dry, Math.abs(Math.sin(x * 0.07 + z * 0.05)) * 0.3)
    colour.push(c.r, c.g, c.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3))
  g.computeVertexNormals()
  return g
})

function scatter(count, minR, maxR, seedOffset) {
  const r = rng(props.seed + seedOffset)
  const out = []
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2
    const d = minR + Math.sqrt(r()) * (maxR - minR)
    const x = Math.cos(a) * d, z = Math.sin(a) * d
    out.push({ x, z, y: groundHeight(x, z), s: 0.7 + r() * 0.8, rot: r() * Math.PI * 2 })
  }
  return out
}

const trees = computed(() => scatter(props.treeCount, 17, props.radius * 0.9, 0))
const grass = computed(() => scatter(props.grassCount, 2, props.radius * 0.8, 101))

const trunkRef = shallowRef(), canopyA = shallowRef(), canopyB = shallowRef(), grassRef = shallowRef()
const dummy = new THREE.Object3D()

function place(ref, items, fn) {
  const mesh = ref.value
  if (!mesh) return
  items.forEach((t, i) => { fn(t, i); mesh.setMatrixAt(i, dummy.matrix) })
  mesh.instanceMatrix.needsUpdate = true
  mesh.frustumCulled = false
}

onMounted(() => nextTick(() => {
  place(trunkRef, trees.value, (t) => {
    dummy.position.set(t.x, t.y + 1.7 * t.s, t.z)
    dummy.rotation.set(0, t.rot, 0)
    dummy.scale.setScalar(t.s); dummy.updateMatrix()
  })
  // Two stacked canopy cones rather than one: the stepped silhouette reads as foliage
  // instead of as a traffic cone, which a single cone stubbornly does.
  place(canopyA, trees.value, (t) => {
    dummy.position.set(t.x, t.y + 3.9 * t.s, t.z)
    dummy.rotation.set(0, t.rot, 0)
    dummy.scale.set(t.s, t.s, t.s); dummy.updateMatrix()
  })
  place(canopyB, trees.value, (t) => {
    dummy.position.set(t.x, t.y + 5.6 * t.s, t.z)
    dummy.rotation.set(0, t.rot + 0.7, 0)
    dummy.scale.set(t.s * 0.68, t.s * 0.8, t.s * 0.68); dummy.updateMatrix()
  })
  place(grassRef, grass.value, (t) => {
    dummy.position.set(t.x, t.y + 0.18, t.z)
    dummy.rotation.set(0, t.rot, 0)
    dummy.scale.set(1, 0.7 + t.s * 0.6, 1); dummy.updateMatrix()
  })
}))
</script>

<template>
  <TresMesh :scale="[-1, 1, 1]" :render-order="-1">
    <TresSphereGeometry :args="[radius * 3, 32, 20]" />
    <TresMeshBasicMaterial color="#8fb4d6" :fog="false" />
  </TresMesh>
  <!-- A second, lower dome fading to haze gives the horizon a gradient without a shader. -->
  <TresMesh :scale="[-1, 1, 1]" :position="[0, -radius * 0.6, 0]" :render-order="-1">
    <TresSphereGeometry :args="[radius * 2.9, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]" />
    <TresMeshBasicMaterial color="#d8e4e6" :fog="false" :transparent="true" :opacity="0.85" />
  </TresMesh>

  <TresFog :args="['#c3d4dc', radius * 0.5, radius * 2.2]" attach="fog" />

  <TresHemisphereLight :args="['#bcd9ef', '#3f5f2e', 0.9]" />
  <TresDirectionalLight :position="[38, 52, 20]" :intensity="1.4" color="#fff3d8" />
  <TresAmbientLight :intensity="0.2" color="#cfe0ea" />

  <TresMesh :geometry="ground">
    <TresMeshStandardMaterial :vertex-colors="true" :roughness="0.97" :metalness="0" />
  </TresMesh>

  <TresInstancedMesh ref="trunkRef" :args="[undefined, undefined, treeCount]">
    <TresCylinderGeometry :args="[0.2, 0.45, 3.6, 7]" />
    <TresMeshStandardMaterial color="#57402f" :roughness="0.95" />
  </TresInstancedMesh>
  <TresInstancedMesh ref="canopyA" :args="[undefined, undefined, treeCount]">
    <TresConeGeometry :args="[2.6, 4.2, 8]" />
    <TresMeshStandardMaterial color="#3a6a2c" :roughness="0.92" :flat-shading="true" />
  </TresInstancedMesh>
  <TresInstancedMesh ref="canopyB" :args="[undefined, undefined, treeCount]">
    <TresConeGeometry :args="[2.6, 4.2, 8]" />
    <TresMeshStandardMaterial color="#477e35" :roughness="0.92" :flat-shading="true" />
  </TresInstancedMesh>
  <TresInstancedMesh ref="grassRef" :args="[undefined, undefined, grassCount]">
    <TresConeGeometry :args="[0.15, 0.5, 4]" />
    <TresMeshStandardMaterial color="#5f8e3d" :roughness="1" :flat-shading="true" />
  </TresInstancedMesh>
</template>
