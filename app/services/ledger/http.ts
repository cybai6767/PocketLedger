import type { LedgerBackend } from './types'
import type {
  Account,
  BalanceCheck,
  LedgerBackup,
  LedgerSnapshot,
  Settings,
  Transaction,
  TransactionMutationResult,
} from '../../../shared/types/ledger'

export type HttpRequest = <T>(url: string, options?: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: object
}) => Promise<T>

export function createHttpLedgerBackend(request: HttpRequest): LedgerBackend {
  return {
    loadSnapshot: () => request<LedgerSnapshot>('/api/ledger'),
    loadLatestAutomaticBackup: () => request<LedgerBackup | null>('/api/ledger/automatic-backup'),
    addAccount: (input) => request<Account>('/api/accounts', { method: 'POST', body: input }),
    updateAccount: (id, input) => request<Account>(`/api/accounts/${id}`, { method: 'PUT', body: input }),
    removeAccount: (id) => request<{ ok: boolean }>(`/api/accounts/${id}`, { method: 'DELETE' }),
    reorderAccounts: (ids) => request<Account[]>('/api/accounts/reorder', { method: 'PUT', body: { ids } }),
    addTransaction: (input) => request<{ transaction: Transaction, account: Account }>(
      '/api/transactions',
      { method: 'POST', body: input },
    ),
    removeTransaction: (id) => request<TransactionMutationResult>(`/api/transactions/${id}`, { method: 'DELETE' }),
    editTransaction: (id, input) => request<TransactionMutationResult>(`/api/transactions/${id}`, { method: 'PUT', body: input }),
    addTransfer: (input) => request<TransactionMutationResult>('/api/transfers', { method: 'POST', body: input }),
    checkBalanceIntegrity: (repair) => request<BalanceCheck>('/api/ledger/integrity', { method: repair ? 'POST' : 'GET' }),
    updateSettings: (next) => request<Settings>('/api/settings', { method: 'PUT', body: next }),
    clearAll: () => request<LedgerSnapshot>('/api/ledger', { method: 'DELETE' }),
    restoreBackup: (backup) => request<LedgerSnapshot>('/api/ledger/restore', { method: 'POST', body: backup }),
  }
}
