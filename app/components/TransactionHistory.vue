<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CURRENCY_SYMBOLS } from '~~/shared/types/ledger'
import { buildTransactionHistory } from '../utils/ledgerHistory'
import TransactionDayList from './TransactionDayList.vue'

const { state, toBase, snapshotVersion } = useLedger()
const { locale, t } = useLocale()
const panel = ref<HTMLElement | null>(null)
const page = useState<'recent' | 'all'>('history-page', () => 'recent')
const filterAcc = useState<string>('history-account-filter', () => 'all')
const searchQuery = useState<string>('history-search', () => '')
const expandedMonths = useState<string[]>('history-expanded-months', () => [])
const historySnapshot = useState<number>('history-snapshot', () => snapshotVersion.value)

watch(snapshotVersion, version => {
  if (historySnapshot.value === version) return
  page.value = 'recent'
  filterAcc.value = 'all'
  searchQuery.value = ''
  expandedMonths.value = []
  historySnapshot.value = version
}, { immediate: true })

const history = computed(() => buildTransactionHistory(state.transactions.filter(transaction => {
  const matchAccount = filterAcc.value === 'all' || String(transaction.accountId) === filterAcc.value
  const matchKeyword = transaction.category.includes(searchQuery.value) || (transaction.note || '').includes(searchQuery.value)
  return matchAccount && matchKeyword
}), toBase))

function money(value: number) {
  if (state.settings.masked) return '****'
  const precision = state.settings.baseCurrency === 'BTC' ? 8 : 2
  return (value < 0 ? '−' : '') + CURRENCY_SYMBOLS[state.settings.baseCurrency]
    + Math.abs(value).toLocaleString(locale.value, { minimumFractionDigits: precision, maximumFractionDigits: precision })
}

function monthName(month: string) {
  return new Date(2000, Number(month.slice(5)) - 1, 1).toLocaleDateString(locale.value, { month: 'short' })
}

async function changePage(next: 'recent' | 'all') {
  page.value = next
  await nextTick()
  panel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function toggleMonth(month: string) {
  expandedMonths.value = expandedMonths.value.includes(month)
    ? expandedMonths.value.filter(item => item !== month)
    : [...expandedMonths.value, month]
}
</script>

<template>
  <div ref="panel" class="transaction-history">
    <section class="history-panel">
      <button v-if="page === 'all'" class="back-button" @click="changePage('recent')">‹ {{ t('history.backRecent') }}</button>
      <header class="history-heading">
        <div>
          <h3>{{ t(page === 'recent' ? 'history.recent' : 'history.all') }}</h3>
          <p>{{ t(page === 'recent' ? 'history.recentHint' : 'history.allHint') }}</p>
        </div>
        <div class="filters">
          <select v-model="filterAcc" :aria-label="t('transaction.account')">
            <option value="all">{{ t('transaction.allAccounts') }}</option>
            <option v-for="account in state.accounts" :key="account.id" :value="String(account.id)">{{ account.name }}</option>
          </select>
          <input v-model="searchQuery" :aria-label="t('transaction.search')" :placeholder="t('transaction.search')" type="search">
        </div>
      </header>

      <template v-if="page === 'recent'">
        <p class="currency-note">{{ t('history.currencyNote', { currency: state.settings.baseCurrency }) }}</p>
        <TransactionDayList v-if="history.recentDays.length" :days="history.recentDays" />
        <p v-else class="empty-history">{{ t('transaction.empty') }}</p>
        <button class="view-more" @click="changePage('all')">{{ t('history.viewMore') }} <span aria-hidden="true">›</span></button>
      </template>
      <div v-else class="history-summary">
        <span>{{ t('report.net') }}</span>
        <strong class="summary-net" :class="{ deficit: history.net < 0 }">{{ money(history.net) }}</strong>
        <div class="summary-amounts">
          <span>{{ t('transaction.income') }} <b class="income">{{ money(history.income) }}</b></span>
          <span>{{ t('transaction.expense') }} <b class="expense">{{ money(history.expense) }}</b></span>
          <span>{{ t('history.recordCount', { count: history.count }) }}</span>
        </div>
        <p>{{ t('history.currencyNote', { currency: state.settings.baseCurrency }) }}</p>
      </div>
    </section>

    <template v-if="page === 'all'">
      <article v-for="month in history.months" :key="month.month" class="month-card" :class="{ expanded: expandedMonths.includes(month.month) }">
        <button class="month-toggle" :aria-expanded="expandedMonths.includes(month.month)" :aria-controls="`history-month-${month.month}`" @click="toggleMonth(month.month)">
          <span class="month-period"><strong>{{ monthName(month.month) }}</strong><small>{{ month.month.slice(0, 4) }}</small></span>
          <span class="month-figures">
            <span class="month-net">{{ t('report.net') }} <strong :class="{ deficit: month.net < 0 }">{{ money(month.net) }}</strong></span>
            <span class="month-income-expense">
              <span>{{ t('transaction.income') }} <b class="income">{{ money(month.income) }}</b></span>
              <span>{{ t('transaction.expense') }} <b class="expense">{{ money(month.expense) }}</b></span>
            </span>
          </span>
          <span class="month-chevron" aria-hidden="true">⌄</span>
        </button>
        <div v-if="expandedMonths.includes(month.month)" :id="`history-month-${month.month}`" class="month-details">
          <TransactionDayList :days="month.days" />
        </div>
      </article>
      <p v-if="!history.months.length" class="empty-history history-panel">{{ t('transaction.empty') }}</p>
    </template>
  </div>
</template>

<style scoped>
.transaction-history { min-width: 0; display: grid; gap: 14px; }
.history-panel, .month-card { min-width: 0; border: 1px solid var(--border); border-radius: 16px; background: var(--panel); }
.history-panel { padding: 22px; }
.history-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
h3 { margin: 0; font-size: 19px; line-height: 1.5; }
p { margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
.filters { display: flex; flex-wrap: wrap; gap: 10px; max-width: 100%; }
input, select { min-width: 0; min-height: 40px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 9px; background: var(--input); color: var(--text); font-size: 13px; }
input { width: 180px; }
.currency-note { margin: 12px 0 8px; font-size: 11px; }
.empty-history { margin: 0; padding: 42px 16px; color: var(--muted); text-align: center; }
.view-more { display: flex; justify-content: center; align-items: center; gap: 8px; width: 100%; min-height: 48px; margin-top: 14px; border: 0; border-top: 1px solid var(--border); background: transparent; color: var(--accent); cursor: pointer; font-size: 13px; }
.view-more span { font-size: 23px; }
.view-more:hover { background: var(--accent-soft); border-radius: 0 0 9px 9px; }
.back-button { display: inline-flex; align-items: center; min-height: 36px; margin: -4px 0 12px; padding: 0; border: 0; background: transparent; color: var(--accent); font-size: 12px; cursor: pointer; }
.history-summary { display: grid; gap: 8px; margin-top: 20px; padding: 18px; border-radius: 12px; background: var(--accent-soft); }
.history-summary > span { font-size: 12px; color: var(--muted); }
.summary-net { color: var(--accent); font-size: clamp(23px, 3vw, 32px); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.summary-amounts { display: flex; flex-wrap: wrap; gap: 8px 20px; color: var(--muted); font-size: 12px; }
.summary-amounts b { margin-left: 4px; font-weight: 600; }
.history-summary p { margin: 0; font-size: 11px; }
.income { color: var(--success); }
.expense, .deficit { color: var(--danger); }
.month-toggle { display: grid; grid-template-columns: minmax(60px, auto) minmax(0, 1fr) 24px; align-items: center; gap: 16px; width: 100%; padding: 20px 22px; border: 0; border-radius: 16px; background: transparent; color: var(--text); text-align: left; cursor: pointer; }
.month-toggle:hover { background: var(--input); }
.month-period { display: flex; flex-direction: column; gap: 4px; }
.month-period strong { font-size: 20px; }
.month-period small { color: var(--muted); font-size: 12px; }
.month-figures { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; min-width: 0; }
.month-net { display: flex; justify-content: flex-end; align-items: baseline; flex-wrap: wrap; gap: 5px; color: var(--muted); font-size: 12px; }
.month-net strong { color: var(--text); font-size: 21px; font-weight: 600; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.month-net strong.deficit { color: var(--danger); }
.month-income-expense { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 6px 14px; color: var(--muted); font-size: 12px; }
.month-income-expense b { margin-left: 4px; font-weight: 500; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.month-chevron { display: grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--border); border-radius: 8px; color: var(--muted); font-size: 19px; line-height: 1; }
.expanded .month-chevron { transform: rotate(180deg); color: var(--accent); }
.expanded { border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); }
.month-details { padding: 0 22px 12px; border-top: 1px solid var(--border); }
@media (max-width: 640px) {
  .history-panel { padding: 16px; }
  .history-heading { gap: 12px; }
  .filters { width: 100%; }
  .filters select { flex: 1 1 110px; }
  .filters input { width: auto; flex: 2 1 150px; }
  .month-toggle { grid-template-columns: minmax(46px, auto) minmax(0, 1fr) 22px; padding: 17px 14px; gap: 10px; }
  .month-period strong { font-size: 18px; }
  .month-net strong { font-size: 18px; }
  .month-income-expense { gap: 4px 9px; font-size: 11px; }
  .month-details { padding: 0 14px 8px; }
}
</style>
