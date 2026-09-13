/* Loads brain.bin (surface mesh) and skeletons.bin (arbors) once, parsed to typed arrays. */
export function useAnatomy() {
  const brain = ref(null)        // { positions: Float32Array, index: Uint32Array }
  const arbors = ref(null)       // { positions: Float32Array (xyz pairs), neuron: Uint32Array per segment, ranges: Map }
  onMounted(async () => {
    const [b, s] = await Promise.all([
      fetch('/brain/brain.bin').then((r) => r.arrayBuffer()),
      fetch('/brain/skeletons.bin').then((r) => r.arrayBuffer()),
    ])
    const bh = new Uint32Array(b, 0, 2)
    brain.value = { positions: new Float32Array(b, 8, bh[0] * 3), index: new Uint32Array(b, 8 + bh[0] * 12, bh[1] * 3) }

    const dv = new DataView(s); let off = 0
    const count = dv.getUint32(off, true); off += 4
    const chunks = [], ranges = new Map()
    let total = 0
    for (let i = 0; i < count; i++) {
      const neuron = dv.getUint32(off, true), n = dv.getUint32(off + 4, true); off += 8
      chunks.push({ neuron, n, off }); ranges.set(neuron, [total, total + n]); total += n; off += n * 12
    }
    const positions = new Float32Array(total * 6)
    const per = new Uint32Array(total)
    let seg = 0
    for (const c of chunks) {
      const q = new Uint16Array(s, c.off, c.n * 6)
      for (let k = 0; k < c.n * 6; k++) positions[seg * 6 + k] = q[k] / 65535
      per.fill(c.neuron, seg, seg + c.n); seg += c.n
    }
    arbors.value = { positions, neuron: per, ranges, count }
  })
  return { brain, arbors }
}
