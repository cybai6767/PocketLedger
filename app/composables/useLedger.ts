import { computed } from 'vue'
import { createHttpLedgerBackend } from '../services/ledger/http'
import { createTauriLedgerBackend } from '../services/ledger/tauri'
import type {
  Account,
  AccountInput,
  BalanceCheck,
  Currency,
  LedgerBackup,
  LedgerSnapshot,
  Settings,
  TransactionInput,
  TransferInput,
} from '../../shared/types/ledger'
import { DEFAULT_SETTINGS } from '../../shared/types/ledger'

export type TabKey = 'dashboard' | 'accounts' | 'transactions' | 'reports' | 'settings'

const RATES_TO_CNY: Record<Currency, number> = {
  CNY: 1,
  HKD: 0.92,
  USD: 7.18,
  EUR: 7.8,
  USDT: 7.18,
  BTC: 480000,
}

function emptySnapshot(): LedgerSnapshot {
  return {
    accounts: [],
    transactions: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error
  if (!error || typeof error !== 'object') return fallback
  const candidate = error as {
    data?: { message?: string, data?: { message?: string } }
    statusMessage?: string
    message?: string
  }
  return candidate.data?.data?.message
    ?? candidate.data?.message
    ?? candidate.statusMessage
    ?? candidate.message
    ?? fallback
}

export function useLedger() {
  const config = useRuntimeConfig()
  const backend = config.public.tauri
    ? createTauriLedgerBackend()
    : createHttpLedgerBackend($fetch)
  const state = useState<LedgerSnapshot>('ledger', emptySnapshot)
  const activeTab = useState<TabKey>('active-tab', () => 'dashboard')
  const lastError = useState<string | null>('ledger-error', () => null)
  const pendingCount = useState<number>('ledger-pending', () => 0)

  const busy = computed(() => pendingCount.value > 0)
  const base = computed(() => state.value.settings.baseCurrency)

  function hydrate(snapshot: LedgerSnapshot) {
    state.value.accounts = snapshot.accounts
    state.value.transactions = snapshot.transactions
    state.value.settings = snapshot.settings
  }

  function setError(message: string | null) {
    lastError.value = message
  }

  async function mutate<T>(request: () => Promise<T>): Promise<T | undefined> {
    pendingCount.value += 1
    lastError.value = null
    try {
      return await request()
    }
    catch (error) {
      lastError.value = errorMessage(
        error,
        state.value.settings.language === 'en'
          ? 'Something went wrong. Please try again.'
          : '操作失败，请稍后再试',
      )
      return undefined
    }
    finally {
      pendingCount.value -= 1
    }
  }

  const loadSnapshot = backend.loadSnapshot
  const loadLatestAutomaticBackup = backend.loadLatestAutomaticBackup

  function setTab(key: TabKey) {
    activeTab.value = key
  }

  function toBase(amount: number, from: Currency): number {
    const cny = amount * RATES_TO_CNY[from]
    return cny / RATES_TO_CNY[state.value.settings.baseCurrency]
  }

  const netWorth = computed(() => state.value.accounts.reduce(
    (sum, account) => sum + toBase(account.balance, account.currency),
    0,
  ))

  function thisMonth() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  const monthIncome = computed(() => state.value.transactions
    .filter(transaction => !transaction.transferId && transaction.type === 'income' && transaction.date.startsWith(thisMonth()))
    .reduce((sum, transaction) => sum + toBase(transaction.amount, transaction.currency), 0))

  const monthExpense = computed(() => state.value.transactions
    .filter(transaction => !transaction.transferId && transaction.type === 'expense' && transaction.date.startsWith(thisMonth()))
    .reduce((sum, transaction) => sum + toBase(transaction.amount, transaction.currency), 0))

  async function addAccount(input: AccountInput): Promise<boolean> {
    const account = await mutate(() => backend.addAccount(input))
    if (!account) return false
    state.value.accounts.push(account)
    return true
  }

  async function updateAccount(id: number, input: AccountInput): Promise<boolean> {
    const account = await mutate(() => backend.updateAccount(id, input))
    if (!account) return false
    const index = state.value.accounts.findIndex(item => item.id === id)
    if (index >= 0) state.value.accounts[index] = account
    return true
  }

  async function removeAccount(id: number): Promise<boolean> {
    const result = await mutate(() => backend.removeAccount(id))
    if (!result) return false
    state.value.accounts = state.value.accounts.filter(account => account.id !== id)
    state.value.transactions = state.value.transactions.filter(transaction => transaction.accountId !== id)
    return true
  }

  async function reorderAccounts(ids: number[]): Promise<boolean> {
    const accounts = await mutate(() => backend.reorderAccounts(ids))
    if (!accounts) return false
    state.value.accounts = accounts
    return true
  }

  async function addTransaction(input: TransactionInput): Promise<boolean> {
    const result = await mutate(() => backend.addTransaction(input))
    if (!result) return false
    state.value.transactions.unshift(result.transaction)
    replaceAccount(result.account)
    return true
  }

  async function removeTransaction(id: number): Promise<boolean> {
    const result = await mutate(() => backend.removeTransaction(id))
    if (!result) return false
    const removedIds = new Set(result.transactions.map(transaction => transaction.id))
    state.value.transactions = state.value.transactions.filter(transaction => !removedIds.has(transaction.id))
    result.accounts.forEach(replaceAccount)
    return true
  }

  async function editTransaction(id: number, input: TransactionInput): Promise<boolean> {
    const result = await mutate(() => backend.editTransaction(id, input))
    if (!result) return false
    const updated = result.transactions[0]!
    const index = state.value.transactions.findIndex(transaction => transaction.id === updated.id)
    if (index >= 0) state.value.transactions[index] = updated
    result.accounts.forEach(replaceAccount)
    state.value.transactions.sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id)
    return true
  }

  async function addTransfer(input: TransferInput): Promise<boolean> {
    const result = await mutate(() => backend.addTransfer(input))
    if (!result) return false
    state.value.transactions.unshift(...result.transactions.reverse())
    result.accounts.forEach(replaceAccount)
    return true
  }

  async function checkBalanceIntegrity(repair = false): Promise<BalanceCheck | undefined> {
    const result = await mutate(() => backend.checkBalanceIntegrity(repair))
    if (result?.repaired) hydrate(await loadSnapshot())
    return result
  }

  function replaceAccount(account: Account) {
    const index = state.value.accounts.findIndex(item => item.id === account.id)
    if (index >= 0) state.value.accounts[index] = account
  }

  async function updateSettings(patch: Partial<Settings>): Promise<boolean> {
    const previous = { ...state.value.settings }
    const next = { ...previous, ...patch }
    state.value.settings = next
    const settings = await mutate(() => backend.updateSettings(next))
    if (!settings) {
      state.value.settings = previous
      return false
    }
    state.value.settings = settings
    return true
  }

  async function clearAll(): Promise<boolean> {
    const snapshot = await mutate(() => backend.clearAll())
    if (!snapshot) return false
    hydrate(snapshot)
    return true
  }

  async function restoreBackup(backup: LedgerBackup): Promise<boolean> {
    const snapshot = await mutate(() => backend.restoreBackup(backup))
    if (!snapshot) return false
    hydrate(snapshot)
    return true
  }

  function toggleTheme() {
    const theme = state.value.settings.theme === 'light' ? 'dark' : 'light'
    void updateSettings({ theme })
  }

  return {
    state: state.value,
    activeTab,
    lastError,
    busy,
    base,
    netWorth,
    monthIncome,
    monthExpense,
    hydrate,
    loadSnapshot,
    loadLatestAutomaticBackup,
    setError,
    setTab,
    toBase,
    addAccount,
    updateAccount,
    removeAccount,
    reorderAccounts,
    addTransaction,
    editTransaction,
    addTransfer,
    removeTransaction,
    checkBalanceIntegrity,
    updateSettings,
    clearAll,
    restoreBackup,
    toggleTheme,
  }
}
