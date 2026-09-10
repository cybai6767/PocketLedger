const isTauriBuild = process.env.NUXT_TAURI === 'true' || Boolean(process.env.TAURI_ENV_PLATFORM)

export default defineNuxtConfig({
  compatibilityDate: '2026-08-23',
  ssr: !isTauriBuild,
  devtools: { enabled: !isTauriBuild },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      tauri: isTauriBuild,
    },
  },
  typescript: {
    // `npm run typecheck` is the CI gate. Keeping build transpilation-only also
    // avoids vue-tsc worker path parsing issues when this checkout path has spaces.
    typeCheck: false,
  },
  nitro: {
    preset: 'node-server',
  },
  vite: {
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_'],
    server: {
      strictPort: true,
    },
  },
  ignore: ['**/src-tauri/**'],
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: 'PocketLedger',
      meta: [
        { name: 'description', content: '基于 Nuxt 的个人财务记账与资产管理工具' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      ],
    },
  },
})
