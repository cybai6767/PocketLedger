export default defineNuxtConfig({
  compatibilityDate: '2026-08-23',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  typescript: {
    // `npm run typecheck` is the CI gate. Keeping build transpilation-only also
    // avoids vue-tsc worker path parsing issues when this checkout path has spaces.
    typeCheck: false,
  },
  nitro: {
    preset: 'node-server',
  },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: '我的记账本',
      meta: [
        { name: 'description', content: '基于 Nuxt 的个人财务记账与资产管理工具' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },
})
