<script setup lang="ts">
import { computed } from 'vue'
import { monthKey, shiftMonth } from '../utils/ledgerReports'

const selectedMonth = defineModel<string>({ required: true })
const { state } = useLedger()
const { locale, t } = useLocale()
const year = computed({
  get: () => Number(selectedMonth.value.slice(0, 4)),
  set(value: number) {
    if (value >= 1900 && value <= 9999) selectedMonth.value = `${value}-${selectedMonth.value.slice(5)}`
  },
})
const month = computed({
  get: () => selectedMonth.value.slice(5),
  set(value: string) {
    if (/^(0[1-9]|1[0-2])$/.test(value)) selectedMonth.value = `${selectedMonth.value.slice(0, 4)}-${value}`
  },
})
const yearChoices = computed(() => {
  const years = new Set<number>([year.value, new Date().getFullYear()])
  for (const transaction of state.transactions) years.add(Number(transaction.date.slice(0, 4)))
  const start = Math.max(1900, Math.min(...years) - 1)
  const end = Math.min(9999, Math.max(...years) + 1)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})
const monthChoices = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))

function monthLabel(month: string) {
  return new Date(2000, Number(month) - 1, 1).toLocaleDateString(locale.value, { month: 'long' })
}

</script>

<template>
  <div class="month-picker">
    <button class="month-arrow" :aria-label="t('report.previousMonth')" :disabled="selectedMonth === '1900-01'" @click="selectedMonth = shiftMonth(selectedMonth, -1)">‹</button>
    <select :aria-label="t('report.year')" v-model.number="year">
      <option v-for="item in yearChoices" :key="item" :value="item">{{ item }}</option>
    </select>
    <select :aria-label="t('report.month')" v-model="month">
      <option v-for="item in monthChoices" :key="item" :value="item">{{ monthLabel(item) }}</option>
    </select>
    <button class="month-arrow" :aria-label="t('report.nextMonth')" :disabled="selectedMonth === '9999-12'" @click="selectedMonth = shiftMonth(selectedMonth, 1)">›</button>
    <button class="current-month" @click="selectedMonth = monthKey(new Date())">{{ t('report.thisMonth') }}</button>
  </div>
</template>

<style scoped>
.month-picker { display: flex; align-items: center; gap: 6px; max-width: 100%; }
select { min-height: 36px; min-width: 0; padding: 6px 28px 6px 10px; border: 1px solid var(--border); border-radius: 9px; background: var(--input); color: var(--text); font-size: 13px; }
button { min-height: 36px; border: 1px solid var(--border); border-radius: 9px; background: var(--panel); color: var(--text); cursor: pointer; }
.month-arrow { width: 32px; padding: 0; font-size: 22px; }
.current-month { padding: 6px 10px; font-size: 12px; white-space: nowrap; }
button:hover { background: var(--accent-soft); color: var(--accent); }
button:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 640px) {
  .month-picker { width: 100%; }
  select { flex: 1; min-height: 40px; }
  button { min-height: 40px; }
}
</style>
