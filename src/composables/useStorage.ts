import { reactive, watch, computed,ref } from 'vue'
import type {
  AppData, Account, Transaction, Currency,
} from '../types'

// 跳转
export type TabKey =  | 'dashboard' | 'accounts' | 'transactions' | 'budget' | 'reports' | 'settings'
const activeTab = ref<TabKey>('dashboard')
export function setTab(key: TabKey) {  activeTab.value = key}


function addTransaction(t: Omit<Transaction, 'id'>) {
  const newTx = { ...t, id: uid() }
  state.transactions.unshift(newTx)
  
  // 自动更新账户余额
  const acc = state.accounts.find(a => a.id === t.accountId)
  if (acc) {
    // 支出减余额，收入加余额
    const change = t.type === 'income' ? t.amount : -t.amount
    acc.balance += change
  }
}

function removeTransaction(id: string) {
  const idx = state.transactions.findIndex(t => t.id === id)
  if (idx !== -1) {
    const t = state.transactions[idx]!
    // 冲销余额逻辑
    const acc = state.accounts.find(a => a.id === t.accountId)
    if (acc) {
      acc.balance += (t.type === 'income' ? -t.amount : t.amount)
    }
    state.transactions.splice(idx, 1)
  }
}

const STORAGE_KEY = 'my-ledger-data-v1'

const RATES_TO_CNY: Record<Currency, number> = {
  CNY: 1,
  HKD: 0.92,
  USD: 7.18,
  EUR: 7.8,
  USDT: 7.18,
  BTC: 480000,
}

function defaultData(): AppData {
  return {
    accounts: [
      { id: uid(), name: '现金', type: 'cash', currency: 'CNY', balance: 0 },
      { id: uid(), name: '银行卡', type: 'bank', currency: 'CNY', balance: 0 },
    ],
    transactions: [],
    settings: { baseCurrency: 'CNY', masked: false, theme: 'light' },
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultData(), ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return defaultData()
}

// 单例响应式状态
const state = reactive<AppData>(load())

// 自动持久化
watch(state, (val) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
}, { deep: true })

/** 把任意金额从某货币折算到当前基准货币 */
export function toBase(amount: number, from: Currency): number {
  const cny = amount * RATES_TO_CNY[from]
  return cny / RATES_TO_CNY[state.settings.baseCurrency]
}

export function useStore() {
  const base = computed(() => state.settings.baseCurrency)

  const netWorth = computed(() =>
    state.accounts.reduce((s, a) => s + toBase(a.balance, a.currency), 0))

  const thisMonth = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  const monthIncome = computed(() =>
    state.transactions
      .filter(t => t.type === 'income' && t.date.startsWith(thisMonth()))
      .reduce((s, t) => s + toBase(t.amount, t.currency), 0))

  const monthExpense = computed(() =>
    state.transactions
      .filter(t => t.type === 'expense' && t.date.startsWith(thisMonth()))
      .reduce((s, t) => s + toBase(t.amount, t.currency), 0))

  // ---- mutations ----
  function addAccount(a: Omit<Account, 'id'>) {
    state.accounts.push({ ...a, id: uid() })
  }
  function updateAccount(id: string, patch: Partial<Account>) {
    const a = state.accounts.find(x => x.id === id)
    if (a) Object.assign(a, patch)
  }
  function removeAccount(id: string) {
    state.accounts = state.accounts.filter(a => a.id !== id)
  }

  function addTransaction(t: Omit<Transaction, 'id'>) {
    state.transactions.push({ ...t, id: uid() })
    const acc = state.accounts.find(a => a.id === t.accountId)
    if (acc) {
      acc.balance += t.type === 'income' ? t.amount
        : t.type === 'expense' ? -t.amount : 0
    }
  }
  function removeTransaction(id: string) {
    state.transactions = state.transactions.filter(t => t.id !== id)
  }

  function clearAll() {
    Object.assign(state, defaultData())
  }

  function toggleTheme() {
    state.settings.theme = state.settings.theme === 'light' ? 'dark' : 'light'
  }

  return {
    state,
    activeTab,
    setTab,
    base,
    netWorth,
    monthIncome,
    monthExpense,
    toBase,
    addAccount, updateAccount, removeAccount,
    addTransaction, removeTransaction,
    clearAll, toggleTheme,
  }
}
