<script setup lang="ts">
import { computed } from 'vue'
import { CURRENCY_SYMBOLS } from '~~/shared/types/ledger'

const { state, toBase } = useLedger()
const sym = computed(() => CURRENCY_SYMBOLS[state.settings.baseCurrency])
const PAD_L = 48, PAD_R = 20, PAD_T = 20, PAD_B = 30
const W = 640, H = 240

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

const maxVal = computed(() => {
  const m = Math.max(1, ...trend.value.flatMap(t => [t.income, t.expense]))
  return Math.ceil(m * 1.1)
})
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
// 第 i 个点的 x 坐标
function px(i: number) {
  const n = trend.value.length
  const usable = W - PAD_L - PAD_R
  return PAD_L + (n <= 1 ? usable / 2 : (usable * i) / (n - 1))
}
// 数值 v 对应的 y 坐标
function py(v: number) {
  const usable = H - PAD_T - PAD_B
  return PAD_T + usable * (1 - v / maxVal.value)
}

// Y 轴刻度（5 等分）
const yTicks = computed(() =>
  Array.from({ length: 6 }, (_, k) => {
    const v = Math.round((maxVal.value / 5) * k)
    return { v, y: py(v) }
  })
)

function linePath(values: number[]) {
  const pts = values.map((v, i) => [px(i), py(v)] as const)
  if (pts.length < 2) return ''

  let d = `M ${pts[0]![0]} ${pts[0]![1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1] ?? pts[i]!
    const [x1, y1] = pts[i]!
    const [x2, y2] = pts[i + 1]!
    const [x3, y3] = pts[i + 2] ?? pts[i + 1]!
    const c1x = x1 + (x2 - x0) / 6
    const c1y = y1 + (y2 - y0) / 6
    const c2x = x2 - (x3 - x1) / 6
    const c2y = y2 - (y3 - y1) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`
  }
  return d
}

</script>

<template>
<section class="panel">
  <h3>12个月收支趋势 (基准)</h3>

  <svg class="chart" viewBox="0 0 640 240" preserveAspectRatio="none">
    <!-- 横向网格线 + Y 轴刻度 -->
    <g v-for="g in yTicks" :key="g.v">
      <line :x1="48" :y1="g.y" :x2="620" :y2="g.y" stroke="var(--border)" stroke-width="1" />
      <text :x="40" :y="g.y + 4" text-anchor="end" font-size="11" fill="var(--muted)">{{ g.v }}</text>
    </g>

    <!-- 支出折线（红，平滑曲线） -->
    <path :d="linePath(trend.map(t => t.expense))" fill="none" stroke="#dc2626" stroke-width="2.5" />
    <!-- 收入折线（绿，平滑曲线） -->
    <path :d="linePath(trend.map(t => t.income))" fill="none" stroke="#16a34a" stroke-width="2.5" />

    <!-- 数据点 -->
    <g v-for="(t, i) in trend" :key="'p' + t.m">
      <circle :cx="px(i)" :cy="py(t.expense)" r="3.5" fill="#fff" stroke="#dc2626" stroke-width="2" />
      <circle :cx="px(i)" :cy="py(t.income)" r="3.5" fill="#fff" stroke="#16a34a" stroke-width="2" />
    </g>

    <!-- X 轴月份标签（每隔几个显示一个，避免拥挤） -->
    <g v-for="(t, i) in trend" :key="'x' + t.m">
      <text v-if="i % 2 === 0" :x="px(i)" :y="228" text-anchor="middle"
            font-size="11" fill="var(--muted)">{{ t.m }}</text>
    </g>
  </svg>

  <div class="legend">
    <span><i style="background:#dc2626"></i>支出</span>
    <span><i style="background:#16a34a"></i>收入</span>
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

  <p v-else class="empty">暂无分类数据</p>
</section>
</template>

<style scoped>
.panel { width: 100%; min-width: 0; overflow: hidden; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
h3 { margin: 0 0 14px; }
.chart { width: 100%; height: 200px; }
.legend { display: flex; gap: 18px; font-size: 13px; margin-top: 8px; }
.legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; }
.cats { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.bar-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
.bar { height: 8px; background: var(--bg); border-radius: 4px; overflow: hidden; }
.fill { height: 100%; background: var(--accent); }
.muted { color: var(--muted); }
.chart {
  width: 100%;
  height: 240px;
  display: block;
}
.cats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.bar-row { display: flex; justify-content: space-between; font-size: 13px; color: var(--text); margin-bottom: 6px; }
.bar { height: 8px; background: var(--hover); border-radius: 6px; overflow: hidden; }
.fill { height: 100%; background: var(--accent); border-radius: 6px; transition: width .3s; }

/* 空状态：图里那种居中的灰字 */
.empty {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  margin: 0;
}

@media (max-width: 640px) {
  .panel { padding: 16px; }
  .chart { height: 200px; }
  .bar-row { align-items: flex-start; flex-direction: column; gap: 3px; }
}

</style>
