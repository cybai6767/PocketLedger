vue复制<script setup lang="ts">import { computed, watchEffect } from 'vue'
import Dashboard from './components/Dashboard.vue'
import Accounts from './components/Accounts.vue'
import Transactions from './components/Transactions.vue'
import Budget from './components/Budget.vue'
import Reports from './components/Reports.vue'
import Settings from './components/Settings.vue'
import { useStore } from './composables/useStorage'
import { CURRENCY_SYMBOLS } from './types'

const { state, activeTab, setTab, netWorth, monthIncome, monthExpense, toggleTheme } =
 useStore()

const tabs = [
  { key: 'dashboard', label: '仪表盘', comp: Dashboard },
  { key: 'accounts', label: '账户', comp: Accounts },
  { key: 'transactions', label: '交易', comp: Transactions },
  { key: 'budget', label: '预算', comp: Budget },
  { key: 'reports', label: '报表', comp: Reports },
  { key: 'settings', label: '设置', comp: Settings },
] as const


const current = computed(() => tabs.find(t => t.key === activeTab.value)!.comp)

const sym = computed(() => CURRENCY_SYMBOLS[state.settings.baseCurrency])
const fmt = (n: number) =>
  state.settings.masked ? '****' : sym.value + n.toFixed(2)

// 同步主题到 <html>
watchEffect(() => {
  document.documentElement.setAttribute('data-theme', state.settings.theme)
})
</script>

<template>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">账</div>
      <h1 class="title">我的记账本</h1>
      <nav>
        <button
          v-for="t in tabs" :key="t.key"
          :class="['nav-item', { active: activeTab === t.key }]"
          @click="activeTab = t.key">
          {{ t.label }}
        </button>
      </nav>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="actions">
          <button class="ghost">切换ID</button>
          <button class="ghost" @click="toggleTheme">🌙 主题</button>
        </div>
      </header>

      <section class="summary">
        <div class="card">
          <span class="label">净资产 (折算至基准)</span>
          <strong class="value">{{ fmt(netWorth) }}</strong>
        </div>
        <div class="card income">
          <span class="label">本月收入</span>
          <strong class="value">{{ fmt(monthIncome) }}</strong>
        </div>
        <div class="card expense">
          <span class="label">本月支出</span>
          <strong class="value">{{ fmt(monthExpense) }}</strong>
        </div>
      </section>

      <component :is="current" />
    </main>
  </div>
</template>

<style scoped>
.app { display: flex; min-height: 100vh; }
.sidebar {
  width: 200px; padding: 20px 14px; flex-shrink: 0;
  background: var(--panel); border-right: 1px solid var(--border);
}
.brand {
  width: 40px; height: 40px; border-radius: 10px;
  display: grid; place-items: center; font-weight: 700; color: #fff;
  background: var(--accent); margin-bottom: 10px;
}
.title { font-size: 18px; margin: 0 0 20px; }
nav { display: flex; flex-direction: column; gap: 4px; }
.nav-item {
  text-align: left; padding: 10px 12px; border: none; border-radius: 8px;
  background: transparent; color: var(--text); cursor: pointer; font-size: 14px;
}
.nav-item:hover { background: var(--hover); }
.nav-item.active { background: var(--accent); color: #fff; }
.main { flex: 1; padding: 20px 28px; }
.topbar { display: flex; justify-content: flex-end; margin-bottom: 18px; }
.actions { display: flex; gap: 10px; }
.ghost {
  padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--panel); color: var(--text); cursor: pointer;
}
.summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
.card {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 8px;
}
.label { color: var(--muted); font-size: 13px; }
.value { font-size: 24px; }
.income .value { color: #16a34a; }
.expense .value { color: #dc2626; }
</style>
