<script setup>
/* The protagonist, in either body.
 *
 * Both are built to real proportions rather than assembled from whatever primitives were
 * to hand: the fly is head / thorax / abdomen with six jointed legs and two wings at the
 * thorax; the dragon is skull / neck / ribcage / tail with four limbs and membrane wings
 * whose spars fan from a shoulder joint. Proportions come from the animals, not from taste.
 *
 * Drawn at the same apparent size in both conditions. The comparison is about what the
 * body does with the brain's command, not how big it looks.
 */
import * as THREE from 'three'

const props = defineProps({
  body: { type: String, default: 'fly' },
  behaviour: { type: String, default: 'explore' },
  feed: { type: Number, default: 0 },      // MN9 -> proboscis / fire
  wingPhase: { type: Number, default: 0 },
})

const isDragon = computed(() => props.body === 'dragon')
const asleep = computed(() => props.behaviour === 'sleep')

const chitin = computed(() => (props.behaviour === 'escape' ? '#7a2f2a' : '#2f3a3d'))
const scale = computed(() => (props.behaviour === 'escape' ? '#7c3a2c' : '#5d6b3a'))

/* Wingbeat: a fly beats ~200 Hz, a dragon a couple of times a second. Both are shown
 * slowed to something the eye can follow, with the ratio kept. */
const flap = computed(() => Math.sin(props.wingPhase * (isDragon.value ? 4 : 26)))
const wingTilt = computed(() => (asleep.value ? -0.15 : flap.value * (isDragon.value ? 0.5 : 0.9)))
const legSwing = computed(() => (asleep.value ? 0 : Math.sin(props.wingPhase * 3) * 0.25))

const LEGS = [
  { z: 0.30, spread: 0.30, len: 0.46, phase: 0 },
  { z: 0.02, spread: 0.34, len: 0.50, phase: 2.1 },
  { z: -0.26, spread: 0.32, len: 0.56, phase: 4.2 },
]
/* Membrane wing spars: four fingers fanning back from the shoulder, as in a bat or
 * pterosaur wing. Angles chosen so the trailing edge sweeps rather than splays. */
const SPARS = [
  { rot: 0.05, len: 1.35 }, { rot: 0.38, len: 1.5 },
  { rot: 0.72, len: 1.4 }, { rot: 1.05, len: 1.1 },
]
</script>

<template>
  <TresGroup>
    <!-- ============================ FLY ============================ -->
    <template v-if="!isDragon">
      <!-- abdomen: segmented taper -->
      <TresMesh :position="[0, 0.02, -0.42]" :rotation="[0.12, 0, 0]">
        <TresCapsuleGeometry :args="[0.155, 0.42, 8, 18]" />
        <TresMeshStandardMaterial :color="chitin" :roughness="0.42" :metalness="0.25" />
      </TresMesh>
      <TresMesh v-for="i in 3" :key="'seg' + i" :position="[0, 0.02, -0.25 - i * 0.15]">
        <TresTorusGeometry :args="[0.152 - i * 0.012, 0.018, 6, 16]" />
        <TresMeshStandardMaterial color="#1c2426" :roughness="0.6" />
      </TresMesh>
      <!-- thorax: the wing and leg anchor, visibly thicker than the abdomen -->
      <TresMesh :position="[0, 0.06, 0.02]">
        <TresSphereGeometry :args="[0.2, 20, 16]" />
        <TresMeshStandardMaterial :color="chitin" :roughness="0.35" :metalness="0.3" />
      </TresMesh>
      <!-- head and compound eyes -->
      <TresMesh :position="[0, 0.08, 0.3]">
        <TresSphereGeometry :args="[0.145, 18, 14]" />
        <TresMeshStandardMaterial color="#232c2e" :roughness="0.4" />
      </TresMesh>
      <TresMesh v-for="s in [-1, 1]" :key="'eye' + s" :position="[s * 0.1, 0.11, 0.33]">
        <TresSphereGeometry :args="[0.085, 16, 12]" />
        <TresMeshStandardMaterial color="#8c2f22" :roughness="0.25" :metalness="0.35"
                                  emissive="#3a0f08" />
      </TresMesh>
      <!-- proboscis: this is MN9, the Phase 1 readout, extending -->
      <TresMesh v-if="feed > 0.05" :position="[0, -0.02, 0.38 + feed * 0.12]"
                :rotation="[Math.PI / 2, 0, 0]">
        <TresCylinderGeometry :args="[0.032, 0.045, 0.1 + feed * 0.26, 8]" />
        <TresMeshStandardMaterial color="#c8a468" :roughness="0.55" />
      </TresMesh>
      <!-- six legs, femur + tibia, alternating tripod gait -->
      <template v-for="(L, li) in LEGS" :key="'leg' + li">
        <TresGroup v-for="s in [-1, 1]" :key="'lg' + li + s"
                   :position="[s * 0.13, -0.02, L.z]"
                   :rotation="[0, 0, s * (0.75 + legSwing * (li % 2 ? 1 : -1))]">
          <TresMesh :position="[s * L.spread * 0.5, -0.06, 0]" :rotation="[0, 0, s * 0.5]">
            <TresCylinderGeometry :args="[0.017, 0.022, L.len * 0.55, 6]" />
            <TresMeshStandardMaterial color="#1f2729" :roughness="0.7" />
          </TresMesh>
          <TresMesh :position="[s * L.spread * 0.92, -0.22, 0]" :rotation="[0, 0, s * -0.35]">
            <TresCylinderGeometry :args="[0.012, 0.017, L.len * 0.7, 6]" />
            <TresMeshStandardMaterial color="#1f2729" :roughness="0.7" />
          </TresMesh>
        </TresGroup>
      </template>
      <!-- wings: veined membrane, hinged at the thorax -->
      <TresGroup v-for="s in [-1, 1]" :key="'w' + s" :position="[s * 0.09, 0.17, 0.0]"
                 :rotation="[wingTilt * 0.5, s * -0.25, s * (0.2 + wingTilt)]">
        <TresMesh :position="[s * 0.4, 0, -0.12]" :rotation="[Math.PI / 2, 0, 0]">
          <TresCircleGeometry :args="[0.42, 20, 0, Math.PI]" />
          <TresMeshPhysicalMaterial color="#dbeef0" :transparent="true" :opacity="0.32"
                                    :roughness="0.1" :transmission="0.6"
                                    :side="THREE.DoubleSide" />
        </TresMesh>
      </TresGroup>
      <TresMesh v-for="s in [-1, 1]" :key="'hal' + s" :position="[s * 0.1, 0.03, -0.16]">
        <TresSphereGeometry :args="[0.026, 8, 6]" />
        <TresMeshStandardMaterial color="#c9bb7a" :roughness="0.6" />
      </TresMesh>
    </template>

    <!-- ============================ DRAGON ============================ -->
    <template v-else>
      <!-- ribcage -->
      <TresMesh :position="[0, 0.05, -0.1]" :scale="[1.05, 0.92, 1.5]">
        <TresSphereGeometry :args="[0.34, 20, 16]" />
        <TresMeshStandardMaterial :color="scale" :roughness="0.82" :flat-shading="true" />
      </TresMesh>
      <!-- neck: three tapering segments so it curves instead of pointing -->
      <TresMesh v-for="i in 3" :key="'n' + i"
                :position="[0, 0.14 + i * 0.075, 0.34 + i * 0.2]"
                :rotation="[-0.34 + i * 0.05, 0, 0]">
        <TresCylinderGeometry :args="[0.15 - i * 0.022, 0.19 - i * 0.022, 0.26, 8]" />
        <TresMeshStandardMaterial :color="scale" :roughness="0.82" :flat-shading="true" />
      </TresMesh>
      <!-- skull, jaw, horns -->
      <TresMesh :position="[0, 0.4, 1.02]" :rotation="[0.22, 0, 0]" :scale="[0.9, 0.78, 1.5]">
        <TresSphereGeometry :args="[0.17, 14, 12]" />
        <TresMeshStandardMaterial :color="scale" :roughness="0.78" :flat-shading="true" />
      </TresMesh>
      <TresMesh :position="[0, 0.32, 1.2]" :rotation="[Math.PI / 2 + 0.2, 0, 0]">
        <TresConeGeometry :args="[0.11, 0.34, 6]" />
        <TresMeshStandardMaterial color="#6b7742" :roughness="0.8" :flat-shading="true" />
      </TresMesh>
      <TresMesh v-for="s in [-1, 1]" :key="'h' + s" :position="[s * 0.09, 0.55, 0.94]"
                :rotation="[-0.6, 0, s * 0.3]">
        <TresConeGeometry :args="[0.035, 0.32, 5]" />
        <TresMeshStandardMaterial color="#d9cfae" :roughness="0.6" />
      </TresMesh>
      <TresMesh v-for="s in [-1, 1]" :key="'de' + s" :position="[s * 0.1, 0.44, 1.12]">
        <TresSphereGeometry :args="[0.038, 10, 8]" />
        <TresMeshStandardMaterial color="#e8a42c" emissive="#6b3f05" :roughness="0.2" />
      </TresMesh>
      <!-- fire: the MN9 command, same output as the fly's proboscis -->
      <TresMesh v-if="feed > 0.05" :position="[0, 0.3, 1.5 + feed * 0.85]"
                :rotation="[Math.PI / 2, 0, 0]">
        <TresConeGeometry :args="[0.1 + feed * 0.3, 0.9 + feed * 1.5, 12, 1, true]" />
        <TresMeshBasicMaterial color="#ff8a22" :transparent="true" :opacity="0.55 + feed * 0.4"
                               :side="THREE.DoubleSide" />
      </TresMesh>
      <!-- tail: five shrinking segments -->
      <TresMesh v-for="i in 5" :key="'t' + i"
                :position="[Math.sin(wingPhase * 2 + i * 0.6) * 0.06 * i, 0.02 - i * 0.012,
                            -0.52 - i * 0.3]"
                :rotation="[0.05, Math.sin(wingPhase * 2 + i * 0.6) * 0.12, 0]">
        <TresCylinderGeometry :args="[0.155 - i * 0.028, 0.185 - i * 0.028, 0.32, 7]" />
        <TresMeshStandardMaterial :color="scale" :roughness="0.84" :flat-shading="true" />
      </TresMesh>
      <TresMesh :position="[0, 0.02, -2.1]" :rotation="[Math.PI / 2, 0, 0]">
        <TresConeGeometry :args="[0.12, 0.45, 5]" />
        <TresMeshStandardMaterial color="#6b7742" :roughness="0.8" />
      </TresMesh>
      <!-- dorsal ridge -->
      <TresMesh v-for="i in 7" :key="'r' + i" :position="[0, 0.33 - i * 0.012, 0.2 - i * 0.22]"
                :rotation="[0.25, 0, 0]">
        <TresConeGeometry :args="[0.05, 0.17 - i * 0.012, 4]" />
        <TresMeshStandardMaterial color="#8d9a5a" :roughness="0.75" />
      </TresMesh>
      <!-- four limbs -->
      <TresGroup v-for="(L, li) in [{ z: 0.32, s: 0.85 }, { z: -0.34, s: 1 }]" :key="'lb' + li">
        <TresGroup v-for="s in [-1, 1]" :key="'lm' + li + s"
                   :position="[s * 0.28, -0.16, L.z]"
                   :rotation="[legSwing * (li ? 1 : -1) * 0.6, 0, s * 0.3]">
          <TresMesh :position="[0, -0.16, 0]">
            <TresCapsuleGeometry :args="[0.07 * L.s, 0.22 * L.s, 5, 8]" />
            <TresMeshStandardMaterial :color="scale" :roughness="0.84" />
          </TresMesh>
          <TresMesh :position="[0, -0.4, 0.04]">
            <TresCapsuleGeometry :args="[0.052 * L.s, 0.2 * L.s, 5, 8]" />
            <TresMeshStandardMaterial color="#4e5a31" :roughness="0.85" />
          </TresMesh>
          <TresMesh :position="[0, -0.56, 0.1]" :rotation="[0.5, 0, 0]">
            <TresConeGeometry :args="[0.07, 0.14, 5]" />
            <TresMeshStandardMaterial color="#d9cfae" :roughness="0.6" />
          </TresMesh>
        </TresGroup>
      </TresGroup>
      <!-- membrane wings: spars fanning from a shoulder, membrane stretched between -->
      <TresGroup v-for="s in [-1, 1]" :key="'dw' + s" :position="[s * 0.3, 0.3, -0.05]"
                 :rotation="[wingTilt * 0.35, 0, s * (0.28 + wingTilt * 0.55)]">
        <TresMesh :position="[s * 0.9, 0.05, -0.35]" :rotation="[Math.PI / 2, 0, s * 0.25]">
          <TresCircleGeometry :args="[1.35, 14, 0, Math.PI]" />
          <TresMeshStandardMaterial color="#7d5a3c" :roughness="0.88" :transparent="true"
                                    :opacity="0.94" :side="THREE.DoubleSide" />
        </TresMesh>
        <TresMesh v-for="(sp, i) in SPARS" :key="'sp' + i"
                  :position="[s * sp.len * 0.5 * Math.cos(sp.rot), 0.05,
                              -sp.len * 0.5 * Math.sin(sp.rot)]"
                  :rotation="[0, s * sp.rot, s * Math.PI / 2]">
          <TresCylinderGeometry :args="[0.022, 0.03, sp.len, 5]" />
          <TresMeshStandardMaterial color="#4b3a28" :roughness="0.8" />
        </TresMesh>
      </TresGroup>
    </template>
  </TresGroup>
</template>
