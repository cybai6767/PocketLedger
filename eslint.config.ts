import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'

export default defineConfigWithVueTs(
  {
    name: 'accounting-tool/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },
  globalIgnores([
    '**/.nuxt/**',
    '**/.output/**',
    '**/coverage/**',
    '**/node_modules/**',
  ]),
  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
)
