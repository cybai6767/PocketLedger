<script setup lang="ts">
import { computed } from 'vue'
import { ACCOUNT_TYPE_LABELS, CURRENCY_SYMBOLS } from '~~/shared/types/ledger'

const { state, setTab, toBase } = useLedger()

const sym = computed(() => CURRENCY_SYMBOLS[state.settings.baseCurrency])
const fmt = (n: number) =>
  state.settings.masked
    ? '****'
    : sym.value + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
  if (end - start >= 0.999999) {
    return `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx} ${cy + r} `
      + `A${r} ${r} 0 1 1 ${cx} ${cy - r} Z`
  }
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
      <ul class="acc-list" v-if="state.accounts.length">
        <li v-for="a in state.accounts" :key="a.id">
          <span class="acc-name">{{ a.name }} ({{ a.currency }})</span>
          <span class="acc-balance">{{ fmt(toBase(a.balance, a.currency)) }}</span>
        </li>
      </ul>
      <p v-else class="muted">暂无账户，点击「新建账户」添加</p>
    </section>

    <section class="panel">
      <h3>资产结构</h3>
      <div class="structure" v-if="structure.length">
        <svg width="220" height="220" viewBox="0 0 140 140">
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

  <div class="overview">
    <button class="primary" @click="setTab('accounts')">+ 新建账户</button>
    <button class="accent" @click="setTab('transactions')">✍️ 记一笔</button>
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.panel {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 12px; padding: 18px;
}
h3 { margin: 0 0 14px; }

/* 两张卡片下方、水平居中的操作按钮 */
.overview {
  display: flex; gap: 12px;
  justify-content: center;
  margin-top: 20px;
}

/* 简明账户列表：*/
.acc-list {
  list-style: none; margin: 0; padding: 0;
  max-height: 300px;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 4px;
}
.acc-list li {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 14px; border-radius: 8px; background: var(--bg);
  font-size: 15px;
}
.acc-name { color: var(--text); }
.acc-balance { font-weight: 600; }
.acc-list::-webkit-scrollbar { width: 6px; }
.acc-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

.structure { display: flex; align-items: center; justify-content: space-around; gap: 40px; flex-direction: column}
.legend { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.legend li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.muted { color: var(--muted); }
.primary { background: var(--accent); color: #fff; border: none; padding: 9px 16px; border-radius: 8px; cursor: pointer; }
.accent { background: #16a34a; color: #fff; border: none; padding: 9px 16px; border-radius: 8px; cursor: pointer; }

@media (max-width: 700px) {
  .grid { grid-template-columns: minmax(0, 1fr); }
  .panel { min-width: 0; }
  .structure svg { width: min(220px, 100%); height: auto; }
  .acc-name, .acc-balance { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .overview { flex-wrap: wrap; }
}
</style>
