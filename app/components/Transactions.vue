<script setup lang="ts">
import { ref, reactive, computed, nextTick, watch, watchEffect } from 'vue'
import type { Transaction, TxType } from '~~/shared/types/ledger'

const { state, busy, addTransaction, editTransaction, addTransfer, editTransfer, transactionEditorId, snapshotVersion } = useLedger()
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
}

function cancelEdit() {
  editingId.value = null
  editingTransferId.value = null
  Object.assign(form, { date: today(), type: 'expense', amount: 0, category: t('transaction.defaultCategory'), note: '' })
  Object.assign(transferForm, { date: today(), amount: 0, note: '' })
}

// A restored/reloaded ledger must not reuse an editor from the previous snapshot.
watch(snapshotVersion, () => {
  cancelEdit()
  mode.value = 'transaction'
})
watch(() => {
  const id = editingId.value ?? editingTransferId.value
  return id !== null && !state.transactions.some(transaction => transaction.id === id)
}, missing => {
  if (missing) cancelEdit()
})

function switchMode(next: 'transaction' | 'transfer') {
  if (mode.value !== next) cancelEdit()
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

watch(transactionEditorId, async id => {
  if (id === null) return
  const transaction = state.transactions.find(item => item.id === id)
  transactionEditorId.value = null
  if (!transaction) return
  startEdit(transaction)
  await nextTick()
  txPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}, { immediate: true, flush: 'post' })
</script>

<template>
  <div ref="txPanel">
    <div class="mode-tabs" role="group" :aria-label="t('tab.transactions')">
      <button :class="{ active: mode === 'transaction' }" :aria-pressed="mode === 'transaction'" @click="switchMode('transaction')">{{ t('transaction.record') }}</button>
      <button :class="{ active: mode === 'transfer' }" :aria-pressed="mode === 'transfer'" @click="switchMode('transfer')">{{ t('transaction.transfer') }}</button>
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

  </div>
</template>

<style scoped>
.panel { width: 100%; min-width: 0; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
.mode-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.mode-tabs button { min-height: 44px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 9px; background: var(--panel); color: var(--text); cursor: pointer; }
.mode-tabs button.active { border-color: var(--accent); background: var(--accent); color: #fff; }
.mode-tabs button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 14px; }
label { min-width: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted); }
input, select { width: 100%; min-width: 0; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); font-size: 14px; }
.save-btn { padding: 10px 24px; }
.form-actions { display: flex; gap: 8px; }
.ghost { padding: 10px 18px; border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--text); cursor: pointer; }
.form-tip { margin: 10px 0 0; color: var(--muted); font-size: 12px; }
.transfer-note { grid-column: span 2; }

.primary { background: var(--accent); color: #fff; border: none; border-radius: 8px; cursor: pointer; }

@media (max-width: 860px) {
  .form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .panel { padding: 16px; }
  .form-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .transfer-note { grid-column: auto; }
}
</style>
