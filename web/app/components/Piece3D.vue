<script setup>
/* Chess pieces as lathe profiles -- the classic Staunton silhouette is a revolved curve,
 * so each piece is one LatheGeometry from a handful of (radius, height) points, not a pile
 * of primitives. Knight and king get one extra mesh for the head / cross. */
import * as THREE from 'three'

const props = defineProps({
  type: { type: String, required: true },      // p n b r q k
  color: { type: String, required: true },     // w b
  selected: { type: Boolean, default: false },
  lifted: { type: Number, default: 0 },        // 0..1, the fly carrying it
})

const PROFILES = {
  p: [[0, 0], [0.34, 0], [0.34, 0.06], [0.27, 0.1], [0.2, 0.28], [0.16, 0.42], [0.2, 0.47], [0.13, 0.52], [0.19, 0.66], [0.1, 0.78], [0, 0.8]],
  r: [[0, 0], [0.36, 0], [0.36, 0.07], [0.28, 0.12], [0.24, 0.5], [0.3, 0.55], [0.3, 0.68], [0.32, 0.8], [0.22, 0.8], [0.22, 0.72], [0, 0.72]],
  b: [[0, 0], [0.35, 0], [0.35, 0.07], [0.26, 0.12], [0.18, 0.4], [0.24, 0.5], [0.16, 0.56], [0.22, 0.72], [0.18, 0.92], [0.08, 1.0], [0.1, 1.06], [0, 1.1]],
  q: [[0, 0], [0.38, 0], [0.38, 0.07], [0.29, 0.13], [0.2, 0.5], [0.27, 0.6], [0.18, 0.66], [0.26, 0.9], [0.32, 1.06], [0.24, 1.1], [0.14, 1.06], [0.1, 1.16], [0, 1.2]],
  k: [[0, 0], [0.38, 0], [0.38, 0.07], [0.29, 0.13], [0.2, 0.52], [0.28, 0.62], [0.18, 0.68], [0.26, 0.95], [0.3, 1.1], [0.16, 1.14], [0, 1.16]],
  n: [[0, 0], [0.36, 0], [0.36, 0.07], [0.27, 0.12], [0.22, 0.4], [0.26, 0.46], [0, 0.46]],
}
const geo = computed(() => new THREE.LatheGeometry(
  PROFILES[props.type].map(([r, y]) => new THREE.Vector2(r, y)), 28))

const mat = computed(() => props.color === 'w'
  ? { color: '#ece2cf', roughness: 0.35, metalness: 0.05 }
  : { color: '#2b2622', roughness: 0.4, metalness: 0.15 })
const emissive = computed(() => (props.selected ? '#3f6d5b' : '#000000'))
</script>

<template>
  <TresGroup :position="[0, lifted * 0.9, 0]" :rotation="[lifted * 0.15, 0, lifted * -0.12]">
    <TresMesh :geometry="geo" cast-shadow>
      <TresMeshStandardMaterial v-bind="mat" :emissive="emissive" :emissive-intensity="0.7" />
    </TresMesh>
    <!-- knight: a swept neck and head over the base -->
    <template v-if="type === 'n'">
      <TresMesh :position="[0, 0.66, 0.02]" :rotation="[-0.25, 0, 0]" :scale="[0.7, 1, 1]">
        <TresCapsuleGeometry :args="[0.16, 0.3, 6, 12]" />
        <TresMeshStandardMaterial v-bind="mat" :emissive="emissive" :emissive-intensity="0.7" />
      </TresMesh>
      <TresMesh :position="[0, 0.9, 0.18]" :rotation="[0.9, 0, 0]" :scale="[0.75, 1, 1.3]">
        <TresSphereGeometry :args="[0.15, 14, 10]" />
        <TresMeshStandardMaterial v-bind="mat" :emissive="emissive" :emissive-intensity="0.7" />
      </TresMesh>
      <TresMesh v-for="s in [-1, 1]" :key="s" :position="[s * 0.07, 1.04, 0.1]" :rotation="[-0.3, 0, s * 0.35]">
        <TresConeGeometry :args="[0.04, 0.14, 5]" />
        <TresMeshStandardMaterial v-bind="mat" />
      </TresMesh>
    </template>
    <!-- king's cross -->
    <template v-if="type === 'k'">
      <TresMesh :position="[0, 1.27, 0]"><TresBoxGeometry :args="[0.06, 0.24, 0.06]" /><TresMeshStandardMaterial v-bind="mat" /></TresMesh>
      <TresMesh :position="[0, 1.3, 0]"><TresBoxGeometry :args="[0.18, 0.06, 0.06]" /><TresMeshStandardMaterial v-bind="mat" /></TresMesh>
    </template>
    <!-- queen's crown points -->
    <template v-if="type === 'q'">
      <TresMesh v-for="i in 6" :key="i" :position="[Math.cos(i * 1.047) * 0.2, 1.1, Math.sin(i * 1.047) * 0.2]">
        <TresSphereGeometry :args="[0.04, 8, 6]" /><TresMeshStandardMaterial v-bind="mat" />
      </TresMesh>
    </template>
  </TresGroup>
</template>
