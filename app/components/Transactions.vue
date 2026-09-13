<script setup lang="ts">
import { ref, reactive, computed, watch, watchEffect } from 'vue'
import { CURRENCY_SYMBOLS, type Transaction, type TxType } from '~~/shared/types/ledger'

const { state, busy, addTransaction, editTransaction, addTransfer, editTransfer, removeTransaction } = useLedger()
const { locale, t } = useLocale()

function today() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// 表单状态
const form = reactive({
  date: today(),
  type: 'expense' as TxType,
  accountId: 0 as number,
  amount: 0,
  category: '餐饮',
  note: '',
})
const mode = ref<'transaction' | 'transfer'>('transaction')
const editingId = ref<number | null>(null)
const editingTransferId = ref<number | null>(null)
const transferForm = reactive({
  date: today(),
  fromAccountId: 0,
  toAccountId: 0,
  amount: 0,
  note: '',
})

const txPanel = ref<HTMLElement | null>(null)
const filterAcc = ref('all')
const searchQuery = ref('')
const transferTargets = computed(() => {
  const source = state.accounts.find(account => account.id === transferForm.fromAccountId)
  return state.accounts.filter(account => account.id !== source?.id && account.currency === source?.currency)
})

// 焦点跳转
function moveFocus(index: number) {
  const inputs = txPanel.value?.querySelectorAll('.nav-input') as NodeListOf<HTMLElement>
  inputs[index]?.focus()
}

watchEffect(() => {
  if (!state.accounts.some(account => account.id === form.accountId)) {
    form.accountId = state.accounts[0]?.id ?? 0
  }
  if (!state.accounts.some(account => account.id === transferForm.fromAccountId)) {
    transferForm.fromAccountId = state.accounts[0]?.id ?? 0
  }
  if (
    !state.accounts.some(account => account.id === transferForm.toAccountId)
    || transferForm.toAccountId === transferForm.fromAccountId
  ) {
    transferForm.toAccountId = state.accounts.find(
      account => account.id !== transferForm.fromAccountId
        && account.currency === state.accounts.find(item => item.id === transferForm.fromAccountId)?.currency,
    )?.id ?? 0
  }
})

watch(locale, () => {
  if (form.category === '餐饮' || form.category === 'Food') form.category = t('transaction.defaultCategory')
})

async function save() {
  const acc = state.accounts.find(a => a.id === form.accountId)
  if (!acc || form.amount <= 0) return
  
  // 确保交易币种与账户币种一致
  const saved = editingId.value
    ? await editTransaction(editingId.value, { ...form, date: form.date })
    : await addTransaction({ ...form, date: form.date })
  if (saved) {
    editingId.value = null
    form.amount = 0
    form.note = ''
    moveFocus(3)
  }
}

function startEdit(transaction: Transaction) {
  if (transaction.transferId) {
    const pair = state.transactions.filter(item => item.transferId === transaction.transferId)
    const expense = pair.find(item => item.type === 'expense')
    const income = pair.find(item => item.type === 'income')
    if (!expense || !income) return
    mode.value = 'transfer'
    editingId.value = null
    editingTransferId.value = transaction.id
    Object.assign(transferForm, {
      date: expense.date,
      fromAccountId: expense.accountId,
      toAccountId: income.accountId,
      amount: expense.amount,
      note: expense.note ?? '',
    })
    txPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  mode.value = 'transaction'
  editingTransferId.value = null
  editingId.value = transaction.id
  Object.assign(form, {
    date: transaction.date,
    type: transaction.type,
    accountId: transaction.accountId,
    amount: transaction.amount,
    category: transaction.category,
    note: transaction.note ?? '',
  })
  txPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function cancelEdit() {
  editingId.value = null
  editingTransferId.value = null
  Object.assign(form, { date: today(), type: 'expense', amount: 0, category: t('transaction.defaultCategory'), note: '' })
  Object.assign(transferForm, { date: today(), amount: 0, note: '' })
}

function switchMode(next: 'transaction' | 'transfer') {
  cancelEdit()
  mode.value = next
}

async function saveTransfer() {
  if (!transferForm.fromAccountId || !transferForm.toAccountId || transferForm.amount <= 0) return
  const saved = editingTransferId.value
    ? await editTransfer(editingTransferId.value, { ...transferForm })
    : await addTransfer({ ...transferForm })
  if (saved) {
    editingTransferId.value = null
    transferForm.amount = 0
    transferForm.note = ''
  }
}

function askRemove(transaction: Transaction) {
  const message = transaction.transferId
    ? t('transaction.deleteTransfer')
    : t('transaction.deleteOne')
  if (confirm(message)) void removeTransaction(transaction.id)
}

// 过滤后的流水列表
const filteredList = computed(() => {
  return state.transactions.filter(t => {
    const matchAcc = filterAcc.value === 'all' || String(t.accountId) === filterAcc.value
    const matchKey = t.category.includes(searchQuery.value) || (t.note || '').includes(searchQuery.value)
    return matchAcc && matchKey
  })
})

const getAccName = (id: number) => state.accounts.find(a => a.id === id)?.name || t('transaction.unknownAccount')
const fmt = (v: number) => v.toLocaleString(locale.value, { minimumFractionDigits: 2 })
</script>

<template>
  <div ref="txPanel">
    <div class="mode-tabs">
      <button :class="{ active: mode === 'transaction' }" @click="switchMode('transaction')">{{ t('transaction.record') }}</button>
      <button :class="{ active: mode === 'transfer' }" @click="switchMode('transfer')">{{ t('transaction.transfer') }}</button>
    </div>

    <section class="panel">
      <h3>{{ mode === 'transfer' ? (editingTransferId ? t('transaction.editTransfer') : t('transaction.transfer')) : editingId ? t('transaction.edit') : t('transaction.record') }}</h3>
      <div v-if="mode === 'transaction'" class="form-grid">
        <label>{{ t('transaction.date') }}
          <input type="date" v-model="form.date" class="nav-input" @keydown.right="moveFocus(1)" />
        </label>
        <label>{{ t('transaction.type') }}
          <select v-model="form.type" class="nav-input" @keydown.left.prevent="moveFocus(0)" @keydown.right.prevent="moveFocus(2)">
            <option value="expense">{{ t('transaction.expense') }}</option>
            <option value="income">{{ t('transaction.income') }}</option>
          </select>
        </label>
        <label>{{ t('transaction.source') }}
          <select v-model.number="form.accountId" class="nav-input" @keydown.left.prevent="moveFocus(1)" @keydown.right.prevent="moveFocus(3)">
            <option v-for="a in state.accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <label>{{ t('transaction.amount') }}
          <input type="number" v-model.number="form.amount" class="nav-input" placeholder="0.00"
                 @keydown.left="moveFocus(2)" @keydown.right="moveFocus(4)" @keydown.enter="save" />
        </label>
        <label>{{ t('transaction.category') }}
          <input v-model="form.category" class="nav-input" :placeholder="t('transaction.categoryPlaceholder')"
                 @keydown.left="moveFocus(3)" @keydown.enter="save" />
        </label>
        <label>{{ t('transaction.note') }}
          <input v-model="form.note" class="nav-input" maxlength="200" :placeholder="t('transaction.notePlaceholder')" @keydown.enter="save">
        </label>
      </div>
      <div v-else class="form-grid transfer-grid">
        <label>{{ t('transaction.date') }}
          <input v-model="transferForm.date" type="date">
        </label>
        <label>{{ t('transaction.from') }}
          <select v-model.number="transferForm.fromAccountId">
            <option v-for="a in state.accounts" :key="a.id" :value="a.id">{{ a.name }}（{{ a.currency }}）</option>
          </select>
        </label>
        <label>{{ t('transaction.to') }}
          <select v-model.number="transferForm.toAccountId">
            <option
              v-for="a in transferTargets"
              :key="a.id"
              :value="a.id"
            >{{ a.name }}（{{ a.currency }}）</option>
          </select>
        </label>
        <label>{{ t('transaction.transferAmount') }}
          <input v-model.number="transferForm.amount" type="number" min="0" step="0.01" placeholder="0.00">
        </label>
        <label class="transfer-note">{{ t('transaction.note') }}
          <input v-model="transferForm.note" maxlength="200" :placeholder="t('transaction.transferNote')">
        </label>
      </div>
      <div class="form-actions">
        <button
          v-if="mode === 'transaction'"
          class="primary save-btn"
          :disabled="busy || !state.accounts.length"
          @click="save"
        >{{ editingId ? t('transaction.saveEdit') : t('transaction.save') }}</button>
        <button v-else class="primary save-btn" :disabled="busy || state.accounts.length < 2" @click="saveTransfer">{{ editingTransferId ? t('transaction.saveTransferEdit') : t('transaction.confirmTransfer') }}</button>
        <button v-if="editingId || editingTransferId" class="ghost" @click="cancelEdit">{{ t('transaction.cancelEdit') }}</button>
      </div>
      <p v-if="mode === 'transfer'" class="form-tip">{{ t('transaction.transferTip') }}</p>
    </section>

    <!-- 流水列表 -->
    <section class="panel">
      <div class="list-header">
        <h3>{{ t('transaction.list') }}</h3>
        <div class="filters">
          <select v-model="filterAcc">
            <option value="all">{{ t('transaction.allAccounts') }}</option>
            <option v-for="a in state.accounts" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
          <input v-model="searchQuery" :placeholder="t('transaction.search')" class="search-box" />
        </div>
      </div>

      <div class="table-wrap">
        <table v-if="filteredList.length">
          <thead>
            <tr><th>{{ t('transaction.date') }}</th><th>{{ t('transaction.category') }}</th><th>{{ t('transaction.note') }}</th><th>{{ t('transaction.account') }}</th><th>{{ t('transaction.amount') }}</th><th>{{ t('common.actions') }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="transaction in filteredList" :key="transaction.id">
              <td>{{ transaction.date }}</td>
              <td>{{ transaction.transferId ? t('transaction.transfer') : transaction.category }}</td>
              <td class="transaction-note" :title="transaction.note">{{ transaction.note || '—' }}</td>
              <td>{{ getAccName(transaction.accountId) }}</td>
              <td :class="transaction.type">
                {{ transaction.type === 'income' ? '+' : '-' }}{{ CURRENCY_SYMBOLS[transaction.currency || 'CNY'] }}{{ fmt(transaction.amount) }}
              </td>
              <td>
                <div class="row-actions">
                  <button class="link-edit" @click="startEdit(transaction)">{{ t('common.edit') }}</button>
                  <button class="link-danger" @click="askRemove(transaction)">{{ t('common.delete') }}</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">{{ t('transaction.empty') }}</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.panel { width: 100%; min-width: 0; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
.mode-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
.mode-tabs button { padding: 8px 14px; border: 1px solid var(--border); border-radius: 9px; background: var(--panel); color: var(--text); cursor: pointer; }
.mode-tabs button.active { border-color: var(--accent); background: var(--accent); color: #fff; }
.form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 14px; }
label { min-width: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted); }
input, select { width: 100%; min-width: 0; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); font-size: 14px; }
.save-btn { padding: 10px 24px; }
.form-actions, .row-actions { display: flex; gap: 8px; }
.ghost { padding: 10px 18px; border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--text); cursor: pointer; }
.form-tip { margin: 10px 0 0; color: var(--muted); font-size: 12px; }
.transfer-note { grid-column: span 2; }

.list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.filters { display: flex; gap: 10px; }
.search-box { width: 180px; }

.table-wrap { max-width: 100%; max-height: 400px; overflow: auto; -webkit-overflow-scrolling: touch; }
table { width: 100%; min-width: 760px; border-collapse: collapse; }
th, td { text-align: left; padding: 12px 8px; border-bottom: 1px solid var(--border); }
.income { color: #16a34a; font-weight: 600; }
.expense { color: #dc2626; font-weight: 600; }
.transaction-note { max-width: 220px; white-space: normal; overflow-wrap: anywhere; color: var(--muted); }
.empty { text-align: center; padding: 40px 16px; color: var(--muted); }
.link-danger { background: none; border: 1px solid #dc2626; color: #dc2626; padding: 4px 8px; border-radius: 4px; cursor: pointer; }
.link-edit { background: none; border: 1px solid var(--accent); color: var(--accent); padding: 4px 8px; border-radius: 4px; cursor: pointer; }
.primary { background: var(--accent); color: #fff; border: none; border-radius: 8px; cursor: pointer; }

@media (max-width: 860px) {
  .form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .panel { padding: 16px; }
  .form-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .transfer-note { grid-column: auto; }
  .list-header { align-items: stretch; flex-direction: column; gap: 12px; }
  .filters { width: 100%; flex-wrap: wrap; }
  .filters select { width: auto; flex: 1 1 110px; }
  .search-box { width: auto; flex: 2 1 150px; }
}
</style>
