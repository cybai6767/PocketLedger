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

export type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>

const nativeInvoke: Invoke = async (command, args) => {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke(command, args)
}

export function createTauriLedgerBackend(invoke: Invoke = nativeInvoke): LedgerBackend {
  return {
    loadSnapshot: () => invoke<LedgerSnapshot>('get_snapshot'),
    loadLatestAutomaticBackup: () => invoke<LedgerBackup | null>('get_latest_automatic_backup'),
    addAccount: (input) => invoke<Account>('create_account', { input }),
    updateAccount: (id, input) => invoke<Account>('update_account', { id, input }),
    removeAccount: (id) => invoke<{ ok: boolean }>('delete_account', { id }),
    reorderAccounts: (ids) => invoke<Account[]>('reorder_accounts', { ids }),
    addTransaction: (input) => invoke<{ transaction: Transaction, account: Account }>('create_transaction', { input }),
    removeTransaction: (id) => invoke<TransactionMutationResult>('delete_transaction', { id }),
    editTransaction: (id, input) => invoke<TransactionMutationResult>('update_transaction', { id, input }),
    addTransfer: (input) => invoke<TransactionMutationResult>('create_transfer', { input }),
    editTransfer: (id, input) => invoke<TransactionMutationResult>('update_transfer', { id, input }),
    checkBalanceIntegrity: (repair) => invoke<BalanceCheck>(repair ? 'repair_balances' : 'check_balances'),
    updateSettings: (next) => invoke<Settings>('update_settings', { settings: next }),
    clearAll: () => invoke<LedgerSnapshot>('clear_ledger'),
    restoreBackup: (backup) => invoke<LedgerSnapshot>('restore_ledger', { backup }),
  }
}
