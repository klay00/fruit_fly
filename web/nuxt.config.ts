export default defineNuxtConfig({
  // Without this, Nuxt 3 treats the project root as srcDir and silently ignores app/ --
  // it builds and serves a blank page with no error, because "no pages found" is a valid
  // app. The layout here (app/pages, app/components, app/composables) is the Nuxt 4 one.
  future: { compatibilityVersion: 4 },
  modules: ['@tresjs/nuxt'],
  ssr: false,
  devtools: { enabled: false },
  compatibilityDate: '2025-01-01',
  vite: { worker: { format: 'es' } },
  app: { head: { title: 'Fly To Dragon', htmlAttrs: { lang: 'en' } } },
});
