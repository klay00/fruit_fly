<script setup>
/* The player. Head / thorax / abdomen, six jointed legs, two membrane wings, halteres.
 * Hovers over the board; descends to pick a piece up and carries it to its square. */
import * as THREE from 'three'
const props = defineProps({ phase: { type: Number, default: 0 }, thinking: { type: Boolean, default: false } })
const flap = computed(() => Math.sin(props.phase * 28) * 0.85)
const legSwing = computed(() => Math.sin(props.phase * 3) * 0.2)
const LEGS = [{ z: 0.3, len: 0.5 }, { z: 0.02, len: 0.55 }, { z: -0.26, len: 0.6 }]
const eye = computed(() => (props.thinking ? '#ff6a3a' : '#8c2f22'))
</script>
<template>
  <TresGroup>
    <TresMesh :position="[0, 0.02, -0.42]" :rotation="[0.12, 0, 0]">
      <TresCapsuleGeometry :args="[0.16, 0.42, 8, 18]" />
      <TresMeshStandardMaterial color="#2f3a3d" :roughness="0.42" :metalness="0.25" />
    </TresMesh>
    <TresMesh v-for="i in 3" :key="'s' + i" :position="[0, 0.02, -0.25 - i * 0.15]">
      <TresTorusGeometry :args="[0.155 - i * 0.012, 0.018, 6, 16]" />
      <TresMeshStandardMaterial color="#1c2426" :roughness="0.6" />
    </TresMesh>
    <TresMesh :position="[0, 0.06, 0.02]">
      <TresSphereGeometry :args="[0.21, 20, 16]" />
      <TresMeshStandardMaterial color="#2f3a3d" :roughness="0.35" :metalness="0.3" />
    </TresMesh>
    <TresMesh :position="[0, 0.08, 0.3]">
      <TresSphereGeometry :args="[0.15, 18, 14]" />
      <TresMeshStandardMaterial color="#232c2e" :roughness="0.4" />
    </TresMesh>
    <TresMesh v-for="s in [-1, 1]" :key="'e' + s" :position="[s * 0.1, 0.11, 0.33]">
      <TresSphereGeometry :args="[0.09, 16, 12]" />
      <TresMeshStandardMaterial :color="eye" :roughness="0.25" :metalness="0.35" :emissive="thinking ? '#7a2a10' : '#3a0f08'" />
    </TresMesh>
    <template v-for="(L, li) in LEGS" :key="'l' + li">
      <TresGroup v-for="s in [-1, 1]" :key="'lg' + li + s" :position="[s * 0.13, -0.02, L.z]"
                 :rotation="[0, 0, s * (0.75 + legSwing * (li % 2 ? 1 : -1))]">
        <TresMesh :position="[s * 0.15, -0.06, 0]" :rotation="[0, 0, s * 0.5]">
          <TresCylinderGeometry :args="[0.017, 0.022, L.len * 0.55, 6]" /><TresMeshStandardMaterial color="#1f2729" />
        </TresMesh>
        <TresMesh :position="[s * 0.3, -0.24, 0]" :rotation="[0, 0, s * -0.35]">
          <TresCylinderGeometry :args="[0.012, 0.017, L.len * 0.7, 6]" /><TresMeshStandardMaterial color="#1f2729" />
        </TresMesh>
      </TresGroup>
    </template>
    <TresGroup v-for="s in [-1, 1]" :key="'w' + s" :position="[s * 0.09, 0.18, 0]"
               :rotation="[flap * 0.4, s * -0.25, s * (0.2 + flap)]">
      <TresMesh :position="[s * 0.42, 0, -0.12]" :rotation="[Math.PI / 2, 0, 0]">
        <TresCircleGeometry :args="[0.44, 20, 0, Math.PI]" />
        <TresMeshPhysicalMaterial color="#dbeef0" :transparent="true" :opacity="0.3" :roughness="0.1" :side="THREE.DoubleSide" />
      </TresMesh>
    </TresGroup>
    <TresMesh v-for="s in [-1, 1]" :key="'h' + s" :position="[s * 0.1, 0.03, -0.16]">
      <TresSphereGeometry :args="[0.026, 8, 6]" /><TresMeshStandardMaterial color="#c9bb7a" />
    </TresMesh>
  </TresGroup>
</template>
