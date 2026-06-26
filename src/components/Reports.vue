<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from '../composables/useStorage'
import { CURRENCY_SYMBOLS } from '../types'

const { state, toBase } = useStore()
const sym = computed(() => CURRENCY_SYMBOLS[state.settings.baseCurrency])

// 近 12 个月
const months = computed(() => {
  const arr: string[] = []
  const d = new Date()
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    arr.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
  }
  return arr
})

const trend = computed(() => months.value.map(m => {
  const income = state.transactions
    .filter(t => t.type === 'income' && t.date.startsWith(m))
    .reduce((s, t) => s + toBase(t.amount, t.currency), 0)
  const expense = state.transactions
    .filter(t => t.type === 'expense' && t.date.startsWith(m))
    .reduce((s, t) => s + toBase(t.amount, t.currency), 0)
  return { m, income, expense }
}))

const maxVal = computed(() =>
  Math.max(1, ...trend.value.flatMap(t => [t.income, t.expense])))

const monthKey = computed(() => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
})

const categories = computed(() => {
  const map = new Map<string, number>()
  for (const t of state.transactions) {
    if (t.type !== 'expense' || !t.date.startsWith(monthKey.value)) continue
    map.set(t.category, (map.get(t.category) ?? 0) + toBase(t.amount, t.currency))
  }
  const total = [...map.values()].reduce((s, v) => s + v, 0) || 1
  return [...map.entries()].map(([cat, v]) => ({ cat, v, pct: v / total }))
})
</script>

<template>
  <section class="panel">
    <h3>12个月收支趋势 (基准)</h3>
    <svg class="chart" viewBox="0 0 600 200" preserveAspectRatio="none">
      <g v-for="(t, i) in trend" :key="t.m">
        <rect :x="i * 50 + 8" :y="180 - (t.income / maxVal) * 150"
              width="16" :height="(t.income / maxVal) * 150" fill="#16a34a" />
        <rect :x="i * 50 + 26" :y="180 - (t.expense / maxVal) * 150"
              width="16" :height="(t.expense / maxVal) * 150" fill="#dc2626" />
      </g>
    </svg>
    <div class="legend">
      <span><i style="background:#16a34a"></i>收入</span>
      <span><i style="background:#dc2626"></i>支出</span>
    </div>
  </section>

  <section class="panel">
    <h3>本月支出分类占比 (基准)</h3>
    <ul v-if="categories.length" class="cats">
      <li v-for="c in categories" :key="c.cat">
        <div class="bar-row">
          <span>{{ c.cat }}</span>
          <span>{{ sym }}{{ c.v.toFixed(2) }} · {{ (c.pct * 100).toFixed(1) }}%</span>
        </div>
        <div class="bar"><div class="fill" :style="{ width: c.pct * 100 + '%' }"></div></div>
      </li>
    </ul>
    <p v-else class="muted">暂无分类数据</p>
  </section>
</template>

<style scoped>
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
h3 { margin: 0 0 14px; }
.chart { width: 100%; height: 200px; }
.legend { display: flex; gap: 18px; font-size: 13px; margin-top: 8px; }
.legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; }
.cats { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.bar-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
.bar { height: 8px; background: var(--bg); border-radius: 4px; overflow: hidden; }
.fill { height: 100%; background: var(--accent); }
.muted { color: var(--muted); }
</style>
