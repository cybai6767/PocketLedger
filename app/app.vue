<script setup lang="ts">
import { computed, watch } from 'vue'
import Accounts from './components/Accounts.vue'
import Dashboard from './components/Dashboard.vue'
import Reports from './components/Reports.vue'
import Settings from './components/Settings.vue'
import Transactions from './components/Transactions.vue'
import type { LedgerSnapshot } from '~~/shared/types/ledger'
import { CURRENCY_SYMBOLS } from '~~/shared/types/ledger'

const {
  state,
  activeTab,
  lastError,
  busy,
  hydrate,
  setError,
  setTab,
  netWorth,
  monthIncome,
  monthExpense,
  toggleTheme,
} = useLedger()

const tabs = [
  { key: 'dashboard', label: '首页', icon: '⌂', component: Dashboard },
  { key: 'accounts', label: '账户', icon: '▣', component: Accounts },
  { key: 'transactions', label: '交易', icon: '↕', component: Transactions },
  { key: 'reports', label: '报表', icon: '⌁', component: Reports },
  { key: 'settings', label: '设置', icon: '⚙', component: Settings },
] as const

const { data, error, status, refresh } = await useFetch<LedgerSnapshot>('/api/ledger', {
  key: 'ledger-snapshot',
})

watch(data, snapshot => {
  if (snapshot) hydrate(snapshot)
}, { immediate: true })

watch(error, fetchError => {
  if (fetchError) setError(fetchError.statusMessage || '无法读取账本数据')
}, { immediate: true })

useHead(() => ({
  htmlAttrs: { 'data-theme': state.settings.theme },
}))

const current = computed(() => tabs.find(tab => tab.key === activeTab.value)?.component ?? Dashboard)
const currentLabel = computed(() => tabs.find(tab => tab.key === activeTab.value)?.label ?? '首页')
const symbol = computed(() => CURRENCY_SYMBOLS[state.settings.baseCurrency])

function formatMoney(value: number) {
  if (state.settings.masked) return '****'
  return symbol.value + value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

async function retry() {
  setError(null)
  await refresh()
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand-row">
        <div class="brand">账</div>
        <div>
          <h1 class="title">我的记账本</h1>
          <p class="subtitle">NUXT 全栈版</p>
        </div>
      </div>

      <nav aria-label="主导航">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="['nav-item', { active: activeTab === tab.key }]"
          @click="setTab(tab.key)"
        >
          <span class="nav-icon" aria-hidden="true">{{ tab.icon }}</span>
          {{ tab.label }}
        </button>
      </nav>

      <div class="server-badge">
        <span class="status-dot" />
        服务端数据已启用
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div>
          <p class="eyebrow">个人财务中心</p>
          <h2>{{ currentLabel }}</h2>
        </div>
        <div class="topbar-actions">
          <span v-if="busy" class="saving">正在保存…</span>
          <button class="icon-button" title="切换主题" @click="toggleTheme">
            {{ state.settings.theme === 'light' ? '☾' : '☀' }}
            <span>主题</span>
          </button>
        </div>
      </header>

      <div v-if="lastError" class="error-banner" role="alert">
        <span>{{ lastError }}</span>
        <div>
          <button v-if="status === 'error'" @click="retry">重试</button>
          <button aria-label="关闭错误提示" @click="setError(null)">×</button>
        </div>
      </div>

      <section class="summary" aria-label="财务摘要">
        <div class="summary-card net-worth">
          <span class="summary-icon">◎</span>
          <div>
            <span class="label">净资产 · {{ state.settings.baseCurrency }}</span>
            <strong class="value">{{ formatMoney(netWorth) }}</strong>
          </div>
        </div>
        <div class="summary-card income">
          <span class="summary-icon">↗</span>
          <div>
            <span class="label">本月收入</span>
            <strong class="value">{{ formatMoney(monthIncome) }}</strong>
          </div>
        </div>
        <div class="summary-card expense">
          <span class="summary-icon">↘</span>
          <div>
            <span class="label">本月支出</span>
            <strong class="value">{{ formatMoney(monthExpense) }}</strong>
          </div>
        </div>
      </section>

      <div v-if="status === 'pending' && !data" class="loading-state">正在载入账本…</div>
      <component :is="current" v-else :key="activeTab" />
    </main>
  </div>
</template>

<style scoped>
.app-shell { min-height: 100vh; display: flex; }
.sidebar {
  position: sticky; top: 0; width: 232px; height: 100vh; padding: 28px 18px 20px;
  flex-shrink: 0; display: flex; flex-direction: column;
  background: var(--sidebar); border-right: 1px solid var(--border);
}
.brand-row { display: flex; align-items: center; gap: 12px; padding: 0 8px 28px; }
.brand {
  width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center;
  font-size: 20px; font-weight: 800; color: #fff;
  background: linear-gradient(145deg, var(--accent), var(--accent-strong));
  box-shadow: 0 8px 22px var(--accent-shadow);
}
.title { margin: 0; font-size: 17px; letter-spacing: .02em; }
.subtitle { margin: 3px 0 0; color: var(--muted); font-size: 10px; letter-spacing: .14em; }
nav { display: flex; flex-direction: column; gap: 6px; }
.nav-item {
  display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 13px;
  border: 0; border-radius: 10px; background: transparent; color: var(--muted);
  cursor: pointer; font-size: 14px; text-align: left; transition: .18s ease;
}
.nav-item:hover { color: var(--text); background: var(--hover); transform: translateX(2px); }
.nav-item.active { color: var(--accent); background: var(--accent-soft); font-weight: 650; }
.nav-icon { width: 20px; font-size: 18px; text-align: center; }
.server-badge {
  display: flex; align-items: center; gap: 8px; margin-top: auto; padding: 11px 12px;
  border: 1px solid var(--border); border-radius: 10px; color: var(--muted); font-size: 11px;
}
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); box-shadow: 0 0 0 4px var(--success-soft); }
.main { flex: 1; min-width: 0; padding: 28px clamp(22px, 4vw, 52px) 48px; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 26px; }
.topbar h2 { margin: 2px 0 0; font-size: 25px; }
.eyebrow { margin: 0; color: var(--muted); font-size: 11px; letter-spacing: .16em; text-transform: uppercase; }
.topbar-actions { display: flex; align-items: center; gap: 12px; }
.saving { color: var(--muted); font-size: 12px; }
.icon-button {
  display: flex; align-items: center; gap: 7px; padding: 9px 13px; border: 1px solid var(--border);
  border-radius: 10px; background: var(--panel); color: var(--text); cursor: pointer;
}
.summary { display: grid; grid-template-columns: 1.25fr 1fr 1fr; gap: 14px; margin-bottom: 22px; }
.summary-card {
  display: flex; align-items: center; gap: 15px; min-height: 100px; padding: 20px;
  border: 1px solid var(--border); border-radius: 16px; background: var(--panel);
  box-shadow: var(--panel-shadow);
}
.summary-icon { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font-size: 21px; }
.summary-card > div { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.label { color: var(--muted); font-size: 12px; }
.value { overflow: hidden; font-size: clamp(20px, 2vw, 27px); text-overflow: ellipsis; }
.income .summary-icon, .income .value { color: var(--success); }
.income .summary-icon { background: var(--success-soft); }
.expense .summary-icon, .expense .value { color: var(--danger); }
.expense .summary-icon { background: var(--danger-soft); }
.error-banner {
  display: flex; justify-content: space-between; gap: 16px; margin: -8px 0 18px; padding: 12px 15px;
  border: 1px solid var(--danger); border-radius: 10px; background: var(--danger-soft); color: var(--danger);
}
.error-banner button { margin-left: 8px; border: 0; background: transparent; color: inherit; cursor: pointer; font-weight: 700; }
.loading-state { min-height: 280px; display: grid; place-items: center; color: var(--muted); }
@media (max-width: 860px) {
  .app-shell { display: block; }
  .sidebar { position: static; width: 100%; height: auto; padding: 14px 18px; }
  .brand-row { padding: 0 0 12px; }
  .sidebar nav { flex-direction: row; overflow-x: auto; }
  .nav-item { width: auto; flex: 0 0 auto; }
  .server-badge { display: none; }
  .main { padding: 22px 18px 36px; }
  .summary { grid-template-columns: 1fr; }
}

@media (max-width: 540px) {
  .nav-icon, .icon-button span { display: none; }
  .topbar { margin-bottom: 18px; }
  .summary-card { min-height: 86px; }
}
</style>
