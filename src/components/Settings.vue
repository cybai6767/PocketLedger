<script setup lang="ts">
import { useStore } from '../composables/useStorage'
import { CURRENCY_LABELS } from '../types'

const { state, clearAll } = useStore()

function confirmClear() {
  if (confirm('确定要清空本地所有数据吗？此操作不可恢复。')) clearAll()
}
</script>

<template>
  <section class="panel">
    <h3>偏好设置</h3>
    <div class="field">
      <label>基准货币</label>
      <select v-model="state.settings.baseCurrency">
        <option v-for="(l, k) in CURRENCY_LABELS" :key="k" :value="k">{{ l }}</option>
      </select>
    </div>
    <div class="field">
      <label>金额遮罩</label>
      <div class="seg">
        <button :class="{ on: !state.settings.masked }" @click="state.settings.masked = false">关闭</button>
        <button :class="{ on: state.settings.masked }" @click="state.settings.masked = true">开启</button>
      </div>
    </div>
    <div class="field">
      <label>主题</label>
      <div class="seg">
        <button :class="{ on: state.settings.theme === 'light' }" @click="state.settings.theme = 'light'">浅色</button>
        <button :class="{ on: state.settings.theme === 'dark' }" @click="state.settings.theme = 'dark'">深色</button>
      </div>
    </div>
  </section>

  <section class="panel danger">
    <h3>危险区域</h3>
    <button class="danger-btn" @click="confirmClear">清空本地所有数据</button>
  </section>
</template>

<style scoped>
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
.panel.danger { border-color: #dc2626; }
h3 { margin: 0 0 14px; }
.field { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); }
select { padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); }
.seg { display: flex; gap: 4px; }
.seg button { padding: 6px 14px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; }
.seg button:first-child { border-radius: 8px 0 0 8px; }
.seg button:last-child { border-radius: 0 8px 8px 0; }
.seg button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.danger-btn { background: #dc2626; color: #fff; border: none; padding: 10px 18px; border-radius: 8px; cursor: pointer; }
</style>
