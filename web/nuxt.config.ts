export default defineNuxtConfig({
  future: { compatibilityVersion: 4 },
  modules: ['@tresjs/nuxt'],
  ssr: false,
  devtools: { enabled: false },
  compatibilityDate: '2025-01-01',
  vite: { worker: { format: 'es' }, optimizeDeps: { include: ['chess.js'] } },
  app: { head: { title: 'Fly Chess', htmlAttrs: { lang: 'en' } } },
});
