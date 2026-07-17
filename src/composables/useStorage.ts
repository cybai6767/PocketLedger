import { reactive, computed, ref } from 'vue'
import type { AppData, Account, Transaction, Currency,} from '../types'
import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8080/api' })

// 跳转
export type TabKey =  | 'dashboard' | 'accounts' | 'transactions' | 'budget' | 'reports' | 'settings'
const activeTab = ref<TabKey>('dashboard')
export function setTab(key: TabKey) {  activeTab.value = key}

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
    accounts: [],
    transactions: [],
    settings: { baseCurrency: 'CNY', masked: false, theme: 'light' },
  }
}

const saved = localStorage.getItem('accounting-data')

const state = reactive<AppData>({
  accounts: [],
  transactions: [],
  settings: { baseCurrency: 'CNY', masked: false, theme: 'light' as 'light' | 'dark' },
})

async function loadData() {
  const [acc, tx] = await Promise.all([
    api.get('/accounts'),
    api.get('/transactions'),
  ])
  state.accounts = acc.data
  state.transactions = tx.data
}

/** 把任意金额从某货币折算到当前基准货币 */
export function toBase(amount: number, from: Currency): number {
  const cny = amount * RATES_TO_CNY[from]
  return cny / RATES_TO_CNY[state.settings.baseCurrency]
}

export function useStore() {
  const base = computed(() => state.settings.baseCurrency)

  const netWorth = computed(() =>
  state.accounts.reduce((sum, acc) => sum + toBase(acc.balance, acc.currency), 0)
  )

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

async function addAccount(a: Omit<Account, 'id'>) {
  const res = await api.post('/accounts', a)
  state.accounts.push(res.data)   // 用后端返回的（带 id 的）数据
}
  function updateAccount(id: number, patch: Partial<Account>) {
    const a = state.accounts.find(x => x.id === id)
    if (a) Object.assign(a, patch)
  }
  async function removeAccount(id: number) {
  await api.delete(`/accounts/${id}`)
  state.accounts = state.accounts.filter(a => a.id !== id)
}

  async function addTransaction(t: Omit<Transaction, 'id'>) {
  const res = await api.post('/transactions', t)
  state.transactions.unshift(res.data)
}
  async function removeTransaction(id: number) {
  await api.delete(`/transactions/${id}`)
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
    loadData,
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
