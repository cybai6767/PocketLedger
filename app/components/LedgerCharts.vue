<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CURRENCY_SYMBOLS } from '~~/shared/types/ledger'
import { buildMonthlyReport, buildYearReports, monthKey, shiftMonth } from '../utils/ledgerReports'

const { state, toBase, netWorth } = useLedger()
const { locale, t } = useLocale()
const selectedMonth = useState<string>('report-month', () => monthKey(new Date()))
const selectedDay = ref<string | null>(null)
const report = computed(() => buildMonthlyReport(state.transactions, selectedMonth.value, toBase))
const previous = computed(() => buildMonthlyReport(state.transactions, shiftMonth(selectedMonth.value, -1), toBase))
const year = computed(() => Number(selectedMonth.value.slice(0, 4)))
const annual = computed(() => buildYearReports(state.transactions, year.value, toBase))
const annualMax = computed(() => Math.max(1, ...annual.value.flatMap(item => [item.income, item.expense])))
const dailyMax = computed(() => Math.max(1, ...report.value.days.map(day => day.expense)))
const activeDay = computed(() => report.value.days.find(day => day.date === selectedDay.value))
const palette = ['#6366f1', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#15956a']

watch(selectedMonth, () => { selectedDay.value = null })

function money(value: number) {
  if (state.settings.masked) return '****'
  const precision = state.settings.baseCurrency === 'BTC' ? 8 : 2
  return (value < 0 ? '−' : '') + CURRENCY_SYMBOLS[state.settings.baseCurrency]
    + Math.abs(value).toLocaleString(locale.value, { minimumFractionDigits: precision, maximumFractionDigits: precision })
}

function monthName(month: string, full = false) {
  const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1)
  return date.toLocaleDateString(locale.value, full ? { year: 'numeric', month: 'long' } : { month: 'short' })
}

function changeMonth(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1900) selectedMonth.value = value
}

function moveMonth(offset: number) {
  selectedMonth.value = shiftMonth(selectedMonth.value, offset)
}

const comparison = computed(() => {
  if (state.settings.masked) return '****'
  if (!previous.value.expense) return t(report.value.expense ? 'report.previousEmpty' : 'report.unchanged')
  const change = (report.value.expense - previous.value.expense) / previous.value.expense * 100
  if (Math.abs(change) < 0.05) return t('report.unchanged')
  return t('report.vsPrevious', { change: (change > 0 ? '+' : '−') + Math.abs(change).toFixed(1) + '%' })
})

function monthDescription(item: (typeof annual.value)[number]) {
  return monthName(item.month, true) + ' · ' + t('transaction.expense') + ' ' + money(item.expense)
    + ' · ' + t('transaction.income') + ' ' + money(item.income) + ' · ' + t('report.net') + ' ' + money(item.net)
}
</script>

<template>
  <div class="ledger-reports">
    <section class="report-panel bill-summary">
      <div class="report-heading">
        <div>
          <h3>{{ t('report.monthly') }}</h3>
          <p>{{ t('report.subtitle') }}</p>
        </div>
        <div class="month-picker">
          <button class="month-arrow" :aria-label="t('report.previousMonth')" :disabled="selectedMonth === '1900-01'" @click="moveMonth(-1)">‹</button>
          <input type="month" min="1900-01" max="9999-12" :aria-label="t('report.monthPicker')" :value="selectedMonth" @change="changeMonth">
          <button class="month-arrow" :aria-label="t('report.nextMonth')" :disabled="selectedMonth === '9999-12'" @click="moveMonth(1)">›</button>
          <button class="current-month" @click="selectedMonth = monthKey(new Date())">{{ t('report.thisMonth') }}</button>
        </div>
      </div>

      <div class="bill-period">
        <strong>{{ monthName(selectedMonth, true) }}</strong>
        <span>{{ t('report.currencyNote', { currency: state.settings.baseCurrency }) }}</span>
      </div>
      <div class="bill-metrics" aria-live="polite">
        <div class="metric net-metric" :class="{ deficit: report.net < 0 }">
          <span class="metric-label">{{ t(report.net < 0 ? 'report.deficit' : 'report.net') }}</span>
          <strong class="metric-value">{{ money(report.net) }}</strong>
          <span class="metric-detail">{{ t('report.netHint') }}<template v-if="report.savingsRate !== null"> · {{ t('report.savingsRate') }} {{ state.settings.masked ? '****' : report.savingsRate.toFixed(1) + '%' }}</template></span>
        </div>
        <div class="metric expense-metric">
          <span class="metric-label">{{ t('transaction.expense') }}</span>
          <strong class="metric-value">{{ money(report.expense) }}</strong>
          <span class="metric-detail" :class="{ decreased: report.expense < previous.expense }">{{ comparison }} · {{ t('report.entries', { count: report.expenseCount }) }}</span>
        </div>
        <div class="metric income-metric">
          <span class="metric-label">{{ t('transaction.income') }}</span>
          <strong class="metric-value">{{ money(report.income) }}</strong>
          <span class="metric-detail">{{ t('report.entries', { count: report.incomeCount }) }}</span>
        </div>
      </div>
      <div class="bill-footnote">
        <p>{{ t('report.explanation') }}</p>
        <span :title="t('report.currentAssetsHint')">{{ t('report.currentAssets') }} <strong>{{ money(netWorth) }}</strong></span>
      </div>
    </section>

    <section class="report-panel">
      <div class="report-heading">
        <div>
          <h3>{{ t('report.yearTitle', { year }) }}</h3>
          <p>{{ t('report.yearSubtitle') }}</p>
        </div>
        <div class="chart-legend"><span><i class="expense-dot" />{{ t('transaction.expense') }}</span><span><i class="income-dot" />{{ t('transaction.income') }}</span></div>
      </div>
      <div class="annual-chart" :aria-label="t('report.yearTitle', { year })">
        <button v-for="item in annual" :key="item.month" class="month-column" :class="{ selected: item.month === selectedMonth }"
          :aria-pressed="item.month === selectedMonth" :aria-label="monthDescription(item)" :title="monthDescription(item)" @click="selectedMonth = item.month">
          <span class="paired-bars" aria-hidden="true">
            <span class="annual-bar expense-bar" :class="{ zero: !item.expense }" :style="{ height: Math.max(2, item.expense / annualMax * 100) + '%' }" />
            <span class="annual-bar income-bar" :class="{ zero: !item.income }" :style="{ height: Math.max(2, item.income / annualMax * 100) + '%' }" />
          </span>
          <span class="month-label">{{ monthName(item.month) }}</span>
        </button>
      </div>
      <div class="year-focus" aria-live="polite">
        <strong>{{ monthName(selectedMonth) }}</strong>
        <span>{{ t('transaction.expense') }} <b class="expense-text">{{ money(report.expense) }}</b></span>
        <span>{{ t('transaction.income') }} <b class="income-text">{{ money(report.income) }}</b></span>
        <span>{{ t('report.net') }} <b>{{ money(report.net) }}</b></span>
      </div>
    </section>

    <div class="analysis-grid">
      <section class="report-panel">
        <div class="report-heading">
          <div><h3>{{ t('report.daysChart') }}</h3><p>{{ monthName(selectedMonth, true) }} · {{ t('report.daysHint') }}</p></div>
        </div>
        <div class="daily-insights">
          <div><span>{{ t('report.average') }}</span><strong>{{ money(report.averageExpense) }}</strong><small>{{ t('report.averageBasis', { days: report.averageDays }) }}</small></div>
          <div><span>{{ t('report.peakDay') }}</span><strong>{{ money(report.peakDay?.expense ?? 0) }}</strong><small>{{ report.peakDay ? report.peakDay.date : t('report.noExpenses') }}</small></div>
        </div>
        <div class="daily-chart">
          <button v-for="day in report.days" :key="day.date" class="daily-column" :class="{ selected: selectedDay === day.date }"
            :aria-label="day.date + ' · ' + t('transaction.expense') + ' ' + money(day.expense)" :aria-pressed="selectedDay === day.date"
            :title="day.date + ' · ' + money(day.expense)" @click="selectedDay = day.date">
            <span class="daily-bar-space" aria-hidden="true"><span class="daily-bar" :class="{ zero: !day.expense }" :style="{ height: Math.max(2, day.expense / dailyMax * 100) + '%' }" /></span>
            <span class="day-label">{{ [1, 7, 14, 21, report.days.length].includes(day.day) ? day.day : '' }}</span>
          </button>
        </div>
        <div class="day-detail" aria-live="polite">
          <template v-if="activeDay"><span>{{ activeDay.date }}</span><strong>{{ money(activeDay.expense) }}</strong><span>{{ t('report.entries', { count: activeDay.count }) }}</span></template>
          <span v-else>{{ t('report.chooseDay') }}</span>
        </div>
      </section>

      <section class="report-panel">
        <div class="report-heading"><div><h3>{{ t('report.categoryTitle') }}</h3><p>{{ monthName(selectedMonth, true) }} · {{ t('report.categoryHint') }}</p></div></div>
        <ol v-if="report.categories.length" class="category-list">
          <li v-for="(category, index) in report.categories" :key="category.name">
            <span class="category-rank" :style="{ color: palette[index % palette.length] }">{{ index + 1 }}</span>
            <div class="category-body">
              <div class="category-label"><strong>{{ category.name }}</strong><strong>{{ money(category.amount) }}</strong></div>
              <div class="category-meta"><span>{{ t('report.entries', { count: category.count }) }}</span><span>{{ category.percentage.toFixed(1) }}%</span></div>
              <div class="category-track"><div :style="{ width: category.percentage + '%', background: palette[index % palette.length] }" /></div>
            </div>
          </li>
        </ol>
        <p v-else class="empty-report">{{ t('report.noExpenses') }}</p>
      </section>
    </div>

    <section class="report-panel monthly-details">
      <div class="report-heading"><div><h3>{{ t('report.monthlyDetails') }}</h3><p>{{ t('report.detailsHint') }}</p></div><span class="year-badge">{{ year }}</span></div>
      <div class="month-table-heading" aria-hidden="true"><span>{{ t('report.month') }}</span><span>{{ t('transaction.expense') }}</span><span>{{ t('transaction.income') }}</span><span>{{ t('report.net') }}</span></div>
      <div class="month-table">
        <button v-for="item in annual" :key="item.month" class="month-row" :class="{ selected: item.month === selectedMonth, empty: !item.expenseCount && !item.incomeCount }"
          :aria-label="monthDescription(item)" :aria-pressed="item.month === selectedMonth" @click="selectedMonth = item.month">
          <strong>{{ monthName(item.month) }}</strong><span class="expense-text">{{ money(item.expense) }}</span><span class="income-text">{{ money(item.income) }}</span><strong :class="{ 'expense-text': item.net < 0 }">{{ money(item.net) }}</strong>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ledger-reports { display: grid; gap: 16px; min-width: 0; }
.report-panel { min-width: 0; padding: 22px; border: 1px solid var(--border); border-radius: 16px; background: var(--panel); }
.report-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
h3 { margin: 0 0 6px; font-size: 17px; line-height: 1.4; }
p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
button { cursor: pointer; }
.month-picker { display: flex; align-items: center; gap: 6px; max-width: 100%; }
.month-picker input { width: 145px; min-height: 36px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 9px; background: var(--input); color: var(--text); font-size: 13px; }
.month-arrow, .current-month { min-height: 36px; border: 1px solid var(--border); border-radius: 9px; background: var(--panel); color: var(--text); }
.month-arrow { width: 32px; padding: 0; font-size: 22px; }
.current-month { padding: 6px 10px; font-size: 12px; white-space: nowrap; }
.month-arrow:hover, .current-month:hover { background: var(--accent-soft); color: var(--accent); }
.bill-period { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 12px; margin: 22px 0 12px; }
.bill-period strong { font-size: 14px; }
.bill-period > span { color: var(--muted); font-size: 11px; }
.bill-metrics { display: grid; grid-template-columns: 1.15fr 1fr 1fr; gap: 12px; }
.metric { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 18px; border: 1px solid var(--border); border-radius: 12px; background: var(--input); }
.net-metric { background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 25%, var(--border)); }
.metric-label { color: var(--muted); font-size: 12px; }
.net-metric .metric-label, .net-metric .metric-value { color: var(--accent); }
.metric-value { font-size: clamp(20px, 2vw, 29px); line-height: 1.2; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.metric-detail { color: var(--muted); font-size: 11px; line-height: 1.6; }
.expense-text, .expense-metric .metric-value, .deficit .metric-value, .deficit .metric-label { color: var(--danger); }
.income-text, .income-metric .metric-value, .metric-detail.decreased { color: var(--success); }
.bill-footnote { display: flex; justify-content: space-between; align-items: center; gap: 8px 20px; flex-wrap: wrap; margin-top: 14px; }
.bill-footnote p { max-width: 75ch; font-size: 11px; }
.bill-footnote > span { color: var(--muted); font-size: 11px; }
.bill-footnote strong { margin-left: 6px; color: var(--text); font-size: 13px; }
.chart-legend { display: flex; gap: 16px; font-size: 12px; color: var(--muted); }
.chart-legend span { display: flex; align-items: center; gap: 6px; }
.chart-legend i { width: 8px; height: 8px; border-radius: 3px; }
.expense-dot, .expense-bar { background: var(--danger); }
.income-dot, .income-bar { background: var(--success); }
.annual-chart { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 6px; margin-top: 20px; padding-top: 8px; border-bottom: 1px solid var(--border); }
.month-column { display: flex; flex-direction: column; align-items: stretch; gap: 10px; min-width: 0; padding: 8px 5px 10px; border: 0; border-radius: 9px 9px 0 0; background: transparent; color: var(--muted); }
.month-column:hover, .month-column.selected { background: var(--accent-soft); color: var(--accent); }
.paired-bars { display: flex; align-items: flex-end; justify-content: center; gap: 5px; height: 154px; border-bottom: 1px solid var(--border); }
.annual-bar { width: 26%; max-width: 19px; border-radius: 4px 4px 0 0; }
.zero { background: var(--border) !important; }
.month-label { text-align: center; font-size: 11px; white-space: nowrap; }
.month-column.selected .month-label { font-weight: 700; }
.year-focus { display: flex; flex-wrap: wrap; gap: 10px 22px; margin-top: 14px; padding: 12px 14px; border-radius: 10px; background: var(--input); font-size: 12px; }
.year-focus > strong { color: var(--accent); }
.year-focus span { color: var(--muted); }
.year-focus b { margin-left: 6px; font-variant-numeric: tabular-nums; }
.analysis-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; }
.daily-insights { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
.daily-insights > div { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 10px; background: var(--input); }
.daily-insights span, .daily-insights small { color: var(--muted); font-size: 11px; }
.daily-insights strong { font-size: 18px; overflow-wrap: anywhere; }
.daily-chart { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 2px; margin-top: 20px; }
.daily-column { min-width: 0; padding: 0; border: 0; background: transparent; color: var(--muted); }
.daily-bar-space { display: flex; align-items: flex-end; justify-content: center; height: 112px; border-bottom: 1px solid var(--border); }
.daily-bar { width: 85%; max-width: 12px; border-radius: 3px 3px 0 0; background: var(--accent); opacity: .6; }
.daily-column.selected .daily-bar, .daily-column:hover .daily-bar { opacity: 1; }
.day-label { display: block; min-height: 23px; padding-top: 7px; font-size: 10px; }
.day-detail { display: flex; flex-wrap: wrap; gap: 10px; min-height: 38px; margin-top: 8px; padding: 10px; border-radius: 8px; background: var(--input); color: var(--muted); font-size: 11px; }
.day-detail strong { color: var(--text); }
.category-list { display: flex; flex-direction: column; gap: 20px; max-height: 322px; overflow-y: auto; list-style: none; margin: 22px 0 0; padding: 0; }
.category-list li { display: flex; align-items: flex-start; gap: 10px; }
.category-rank { display: grid; place-items: center; flex: 0 0 24px; min-height: 24px; border-radius: 7px; background: var(--input); font-size: 12px; font-weight: 700; }
.category-body { flex: 1; min-width: 0; }
.category-label, .category-meta { display: flex; justify-content: space-between; gap: 10px; }
.category-label { font-size: 13px; }
.category-label strong { overflow-wrap: anywhere; }
.category-meta { margin: 6px 0 8px; color: var(--muted); font-size: 11px; }
.category-track { height: 6px; overflow: hidden; border-radius: 4px; background: var(--hover); }
.category-track > div { height: 100%; border-radius: inherit; }
.empty-report { display: grid; place-items: center; min-height: 200px; }
.year-badge { padding: 5px 10px; border: 1px solid var(--border); border-radius: 8px; color: var(--muted); font-size: 12px; }
.month-table-heading, .month-row { display: grid; grid-template-columns: 80px repeat(3, minmax(0, 1fr)); align-items: center; gap: 12px; }
.month-table-heading { margin-top: 18px; padding: 12px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 12px; }
.month-table-heading > :not(:first-child), .month-row > :not(:first-child) { text-align: right; }
.month-table { display: grid; gap: 3px; margin-top: 6px; }
.month-row { width: 100%; min-height: 44px; padding: 10px 12px; border: 0; border-radius: 9px; background: transparent; color: var(--text); text-align: left; font-size: 13px; font-variant-numeric: tabular-nums; }
.month-row > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.month-row > :not(:first-child) { white-space: normal; overflow-wrap: anywhere; }
.month-row:hover, .month-row.selected { background: var(--accent-soft); }
.month-row.selected > :first-child { color: var(--accent); }
.month-row.empty:not(.selected) { opacity: .6; }
@media (max-width: 1100px) { .analysis-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 640px) {
  .report-panel { padding: 16px; }
  h3 { font-size: 16px; }
  .report-heading { gap: 12px; }
  .month-picker { width: 100%; }
  .month-picker input { flex: 1; min-width: 0; width: 0; }
  .bill-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .net-metric { grid-column: 1 / -1; }
  .metric { gap: 8px; padding: 14px; }
  .net-metric .metric-value { font-size: 28px; }
  .metric-value { font-size: 19px; }
  .metric-detail { font-size: 10px; }
  .annual-chart { gap: 2px; }
  .month-column { padding-inline: 1px; }
  .paired-bars { gap: 2px; height: 130px; }
  .annual-bar { width: 34%; }
  .month-label { font-size: 9px; }
  .year-focus { gap: 9px; padding: 10px; }
  .year-focus > strong { flex-basis: 100%; }
  .year-focus span { font-size: 11px; }
  .year-focus b { margin-left: 3px; }
  .month-table-heading, .month-row { grid-template-columns: 35px repeat(3, minmax(0, 1fr)); gap: 6px; padding-inline: 6px; font-size: 11px; }
}
</style>
