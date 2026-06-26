<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from '../composables/useStorage'
import { ACCOUNT_TYPE_LABELS, CURRENCY_SYMBOLS } from '../types'

const { state, setTab, toBase, removeAccount } = useStore()

const sym = computed(() => CURRENCY_SYMBOLS[state.settings.baseCurrency])
const fmt = (n: number) => state.settings.masked ? '****' : sym.value + n.toFixed(2)

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
    </section>

    <section class="panel">
      <h3>资产结构</h3>
      <div class="structure" v-if="structure.length">
        <svg width="140" height="140" viewBox="0 0 140 140">
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

    <section class="panel span2">
      <div class="row">
        <h3>账户列表</h3>
      </div>
      <table>
        <thead>
          <tr><th>名称</th><th>类型</th><th>币种</th><th>余额 (本币)</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="a in state.accounts" :key="a.id">
            <td>{{ a.name }}</td>
            <td>{{ ACCOUNT_TYPE_LABELS[a.type] }}</td>
            <td>{{ a.currency }}</td>
            <td>{{ fmt(toBase(a.balance, a.currency)) }}</td>
            <td>
              <button class="link" @click="removeAccount(a.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.panel {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 12px; padding: 18px;
}
.span2 { grid-column: 1 / -1; }
h3 { margin: 0 0 14px; }
.overview { display: flex; gap: 12px; }
.structure { display: flex; align-items: center; gap: 20px; }
.legend { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.legend li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); font-size: 14px; }
.link { background: none; border: none; color: #dc2626; cursor: pointer; }
.muted { color: var(--muted); }
.row { display: flex; justify-content: space-between; align-items: center; }
.primary { background: var(--accent); color: #fff; border: none; padding: 9px 16px; border-radius: 8px; cursor: pointer; }
.accent { background: #16a34a; color: #fff; border: none; padding: 9px 16px; border-radius: 8px; cursor: pointer; }
</style>
