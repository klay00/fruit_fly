/* Main-thread handle on the brain worker. */
export function useBrain() {
  const ready = ref(false);
  const dn = ref({});
  const channel = ref('rest');
  const state = ref({
    behaviour: 'explore', energy: 1, hunger: 0, sleepPressure: 0, fear: 0,
    sugarGain: 25, canFeed: false, clockHours: 8, night: 0,
  });
  const info = ref(null);
  let worker = null;

  onMounted(() => {
    worker = new Worker(new URL('../../workers/brain.worker.js', import.meta.url),
                        { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') { info.value = m.iface; ready.value = true; worker.postMessage({ type: 'run' }); }
      else if (m.type === 'dn') { dn.value = m.dn; state.value = m.state; channel.value = m.channel; }
    };
    worker.postMessage({ type: 'boot', base: '/brain/' });
  });
  onUnmounted(() => worker?.terminate());

  return {
    ready, dn, state, info, channel,
    sense: (world) => worker?.postMessage({ type: 'world', world }),
    poke: (fields) => worker?.postMessage({ type: 'poke', ...fields }),
    setClock: (value) => worker?.postMessage({ type: 'clock', value }),
    reset: () => worker?.postMessage({ type: 'reset' }),
  };
}
