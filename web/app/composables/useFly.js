export function useFly() {
  const ready = ref(false), info = ref(null), thinking = ref(false)
  const last = ref(null)          // { chosen, cands, kc, ms }
  let worker = null, resolve = null
  onMounted(() => {
    worker = new Worker(new URL('../../workers/chess.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const m = e.data
      if (m.type === 'ready') { info.value = m; ready.value = true }
      else if (m.type === 'moves') { last.value = m; thinking.value = false; resolve?.(m); resolve = null }
    }
    worker.postMessage({ type: 'boot', base: '/brain/' })
  })
  onUnmounted(() => worker?.terminate())
  return {
    ready, info, thinking, last,
    think: (fen, color) => new Promise((res) => { thinking.value = true; resolve = res
      worker.postMessage({ type: 'think', fen, color }) }),
  }
}
