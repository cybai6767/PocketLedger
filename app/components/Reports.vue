<script setup lang="ts">
import LedgerCharts from './LedgerCharts.vue'
import TransactionHistory from './TransactionHistory.vue'

const { t } = useLocale()
const activeView = useState<'statistics' | 'transactions'>('report-view', () => 'transactions')
</script>

<template>
  <div class="reports-content">
    <div class="report-tabs" role="group" :aria-label="t('tab.reports')">
      <button
        :class="{ active: activeView === 'transactions' }"
        :aria-pressed="activeView === 'transactions'"
        @click="activeView = 'transactions'"
      >{{ t('transaction.list') }}</button>
      <button
        :class="{ active: activeView === 'statistics' }"
        :aria-pressed="activeView === 'statistics'"
        @click="activeView = 'statistics'"
      >{{ t('report.statistics') }}</button>
    </div>

    <section v-show="activeView === 'statistics'" :aria-label="t('report.statistics')">
      <LedgerCharts part="insights" />
    </section>

    <section v-show="activeView === 'transactions'" :aria-label="t('transaction.list')">
      <TransactionHistory />
    </section>
  </div>
</template>

<style scoped>
.reports-content { min-width: 0; }
.report-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.report-tabs button {
  min-height: 44px; padding: 8px 16px; border: 1px solid var(--border);
  border-radius: 9px; background: var(--panel); color: var(--text); cursor: pointer;
}
.report-tabs button.active { border-color: var(--accent); background: var(--accent); color: #fff; }
.report-tabs button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
