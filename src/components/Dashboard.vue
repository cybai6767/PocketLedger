<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from '../composables/useStorage'
import { ACCOUNT_TYPE_LABELS, CURRENCY_SYMBOLS } from '../types'

const { state, setTab, toBase } = useStore()

const sym = computed(() => CURRENCY_SYMBOLS[state.settings.baseCurrency])
const fmt = (n: number) => state.settings.masked ? '****' : sym.value + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// 资产结构（按类型占比）
const structure = computed(() => {
  const map = new Map<string, number>()
  for (const a of state.accounts) {
    const v = toBase(a.balance, a.currency)
    if (v <= 0) continue
    const label = ACCOUNT_TYPE_LABELS[a.type]
    map.set(label, (map.get(label) ?? 0) + v)
  }
  const total = [...map.values()].reduce((s, v) => s + v, 0) || 1
  const colors = ['#6366f1', '#16a34a', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#64748b']
  let acc = 0
  return [...map.entries()].map(([label, v], i) => {
    const start = acc / total; acc += v
    return { label, v, pct: v / total, start, end: acc / total, color: colors[i % colors.length] }
  })
})

function arc(start: number, end: number) {
  const r = 60, cx = 70, cy = 70
  const a0 = start * 2 * Math.PI - Math.PI / 2
  const a1 = end * 2 * Math.PI - Math.PI / 2
  const large = end - start > 0.5 ? 1 : 0
  return `M${cx} ${cy} L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} ` +
    `A${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`
}
</script>

<template>
  <div class="grid">
    <section class="panel">
      <h3>账户概览</h3>
      <div class="overview">
        <button class="primary" @click="setTab('accounts')">+ 新建账户</button>
        <button class="accent" @click="setTab('transactions')">✍️ 记一笔</button>
      </div>

      <ul class="acc-list" v-if="state.accounts.length">
        <li v-for="a in state.accounts" :key="a.id">
          <span class="acc-name">{{ a.name }} ({{ a.currency }})</span>
          <span class="acc-bal">{{ fmt(toBase(a.balance, a.currency)) }}</span>
        </li>
      </ul>
      <p v-else class="muted">暂无账户，点击「新建账户」开始记账</p>
    </section>

    <section class="panel">
      <h3>资产结构</h3>
      <div class="structure" v-if="structure.length">
        <svg width="180" height="180" viewBox="0 0 140 140">
          <path v-for="s in structure" :key="s.label" :d="arc(s.start, s.end)" :fill="s.color" />
          <circle cx="70" cy="70" r="34" fill="var(--panel)" />
        </svg>
        <ul class="legend">
          <li v-for="s in structure" :key="s.label">
            <span class="dot" :style="{ background: s.color }"></span>
            {{ s.label }} · {{ (s.pct * 100).toFixed(1) }}%
          </li>
        </ul>
      </div>
      <p v-else class="muted">暂无资产数据</p>
    </section>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  /* 撑满下方空白：占满首屏剩余高度 */
  min-height: calc(100vh - 220px);
}
.panel {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 16px; padding: 28px;
  display: flex; flex-direction: column;
}
h3 { margin: 0 0 20px; font-size: 20px; }

/* 账户概览 */
.overview { display: flex; gap: 12px; margin-bottom: 20px; }
.primary { background: var(--accent); color: #fff; border: none; padding: 12px 20px; border-radius: 10px; cursor: pointer; font-size: 15px; }
.accent { background: #16a34a; color: #fff; border: none; padding: 12px 20px; border-radius: 10px; cursor: pointer; font-size: 15px; }
.acc-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.acc-list li {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 18px; border-radius: 12px; background: var(--bg);
}
.acc-name { font-size: 17px; }
.acc-bal { font-size: 20px; font-weight: 700; }

/* 资产结构 —— 保持原样式，仅随面板放大 */
.structure { display: flex; align-items: center; gap: 28px; flex: 1; }
.legend { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.legend li { display: flex; align-items: center; gap: 10px; font-size: 16px; }
.dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.muted { color: var(--muted); }
</style>
