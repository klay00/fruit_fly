<script setup>
/* Orbit the scene: drag to look around, scroll to zoom, right-drag to pan.
 * Uses three's own OrbitControls, which ships inside the three package already -- no extra
 * dependency for something that is solved. */
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useTresContext, useRenderLoop } from '@tresjs/core'

const props = defineProps({ follow: { type: Object, default: null },
                            chase: { type: Boolean, default: false } })
const { camera, renderer } = useTresContext()
let controls = null

onMounted(() => {
  const cam = camera.value
  const dom = renderer.value?.domElement
  if (!cam || !dom) return
  controls = new OrbitControls(cam, dom)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 1.5
  controls.maxDistance = 60
  controls.maxPolarAngle = Math.PI * 0.495   // stop just above the ground plane
  controls.target.set(0, 1, 0)
  controls.update()
})
onUnmounted(() => controls?.dispose())

const { onLoop } = useRenderLoop()
onLoop(({ delta }) => {
  if (!controls) return
  if (props.chase && props.follow) {
    // Keep the orbit centre on the animal without taking the angle away from the viewer:
    // they still control where they look from, we only move what they look at.
    const t = controls.target
    const k = Math.min(1, delta * 4)
    t.x += (props.follow.x - t.x) * k
    t.y += (props.follow.y - t.y) * k
    t.z += (props.follow.z - t.z) * k
  }
  controls.update()
})

defineExpose({ reset: () => { controls?.target.set(0, 1, 0); controls?.update() } })
</script>
<template><TresGroup /></template>
