<script setup lang="ts">
import { CURRENCY_SYMBOLS, type Transaction, type Currency } from '~~/shared/types/ledger'
import type { TransactionDayGroup } from '../utils/ledgerHistory'

defineProps<{ days: TransactionDayGroup[] }>()
const { state, busy, openTransactionEditor, removeTransaction } = useLedger()
const { locale, t } = useLocale()

function dateLabel(date: string, weekday = false) {
  const value = new Date(0)
  value.setFullYear(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
  value.setHours(12, 0, 0, 0)
  return value.toLocaleDateString(locale.value, weekday ? { weekday: 'short' } : {
    year: value.getFullYear() === new Date().getFullYear() ? undefined : 'numeric', month: 'short', day: 'numeric',
  })
}

function money(amount: number, currency: Currency = state.settings.baseCurrency) {
  if (state.settings.masked) return '****'
  const precision = currency === 'BTC' ? 8 : 2
  return CURRENCY_SYMBOLS[currency] + amount.toLocaleString(locale.value, {
    minimumFractionDigits: precision, maximumFractionDigits: precision,
  })
}

function accountName(id: number) {
  return state.accounts.find(account => account.id === id)?.name || t('transaction.unknownAccount')
}

function askRemove(transaction: Transaction) {
  if (confirm(t(transaction.transferId ? 'transaction.deleteTransfer' : 'transaction.deleteOne'))) {
    void removeTransaction(transaction.id)
  }
}
</script>

<template>
  <div class="day-list">
    <section v-for="day in days" :key="day.date" class="day-group" :aria-label="day.date">
      <header class="day-heading">
        <h4><time :datetime="day.date">{{ dateLabel(day.date) }}</time><span>{{ dateLabel(day.date, true) }}</span></h4>
        <div class="day-totals">
          <span>{{ t('transaction.expense') }} <b>{{ money(day.expense) }}</b></span>
          <span v-if="day.income">{{ t('transaction.income') }} <b>{{ money(day.income) }}</b></span>
        </div>
      </header>
      <ul class="transaction-list">
        <li v-for="transaction in day.transactions" :key="transaction.id" class="transaction-row">
          <span class="category-icon" :class="transaction.transferId ? 'transfer-icon' : transaction.type" aria-hidden="true">
            {{ transaction.transferId ? '⇄' : Array.from(transaction.category)[0] }}
          </span>
          <div class="transaction-body">
            <strong class="transaction-category">{{ transaction.transferId ? t('transaction.transfer') : transaction.category }}</strong>
            <p v-if="transaction.note" class="transaction-note">{{ transaction.note }}</p>
            <p class="transaction-account">
              {{ accountName(transaction.accountId) }}
              <span v-if="transaction.transferId"> · {{ t(transaction.type === 'income' ? 'history.transferIn' : 'history.transferOut') }}</span>
            </p>
          </div>
          <div class="transaction-end">
            <strong class="transaction-amount" :class="transaction.transferId ? 'transfer-amount' : transaction.type">
              {{ transaction.type === 'income' ? '+' : '−' }}{{ money(transaction.amount, transaction.currency) }}
            </strong>
            <div class="row-actions">
              <button class="edit-action" @click="openTransactionEditor(transaction.id)">{{ t('common.edit') }}</button>
              <button class="delete-action" :disabled="busy" @click="askRemove(transaction)">{{ t('common.delete') }}</button>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.day-group + .day-group { margin-top: 24px; }
.day-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; padding: 12px 0; }
h4 { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; font-size: 14px; font-weight: 600; color: var(--muted); }
h4 span { font-weight: 400; }
.day-totals { display: flex; flex-wrap: wrap; gap: 10px; color: var(--muted); font-size: 11px; }
.day-totals b { font-weight: 500; }
.transaction-list { list-style: none; margin: 0; padding: 0; }
.transaction-row { display: grid; grid-template-columns: 38px minmax(0, 1fr) minmax(80px, auto); align-items: start; gap: 12px; padding: 17px 0; border-bottom: 1px solid var(--border); }
.transaction-row:last-child { border-bottom: 0; }
.category-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; font-size: 16px; font-weight: 650; background: var(--input); }
.category-icon.expense { background: var(--danger-soft); }
.category-icon.income { background: var(--success-soft); }
.transfer-icon { background: var(--accent-soft); color: var(--accent); font-size: 23px; }
.transaction-category { display: block; font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
p { margin: 4px 0 0; overflow-wrap: anywhere; }
.transaction-note { color: var(--muted); font-size: 12px; line-height: 1.6; }
.transaction-account { color: var(--muted); font-size: 11px; line-height: 1.6; }
.transaction-end { min-width: 0; max-width: 220px; text-align: right; }
.transaction-amount { display: block; overflow-wrap: anywhere; font-size: 16px; line-height: 1.5; font-variant-numeric: tabular-nums; }
.expense { color: var(--danger); }
.income { color: var(--success); }
.transfer-amount { color: var(--accent); }
.row-actions { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; margin-top: 5px; }
.row-actions button { min-height: 32px; padding: 3px 6px; border: 0; border-radius: 6px; background: transparent; cursor: pointer; font-size: 11px; }
.row-actions button:hover { background: var(--hover); }
.edit-action { color: var(--muted); }
.delete-action { color: var(--danger); }
@media (max-width: 640px) {
  .transaction-row { grid-template-columns: 32px minmax(0, 1fr) minmax(76px, auto); gap: 9px; padding: 15px 0; }
  .category-icon { width: 32px; height: 32px; border-radius: 10px; font-size: 14px; }
  .transaction-end { max-width: 130px; }
  .transaction-amount { font-size: 14px; }
  .transaction-category { font-size: 13px; }
  h4 { font-size: 13px; }
}
</style>
