import type {
  Account,
  AccountInput,
  BalanceCheck,
  LedgerBackup,
  LedgerSnapshot,
  Settings,
  Transaction,
  TransactionInput,
  TransactionMutationResult,
  TransferInput,
} from '../../../shared/types/ledger'

export interface LedgerBackend {
  loadSnapshot(): Promise<LedgerSnapshot>
  loadLatestAutomaticBackup(): Promise<LedgerBackup | null>
  addAccount(input: AccountInput): Promise<Account>
  updateAccount(id: number, input: AccountInput): Promise<Account>
  removeAccount(id: number): Promise<{ ok: boolean }>
  reorderAccounts(ids: number[]): Promise<Account[]>
  addTransaction(input: TransactionInput): Promise<{ transaction: Transaction, account: Account }>
  removeTransaction(id: number): Promise<TransactionMutationResult>
  editTransaction(id: number, input: TransactionInput): Promise<TransactionMutationResult>
  addTransfer(input: TransferInput): Promise<TransactionMutationResult>
  editTransfer(id: number, input: TransferInput): Promise<TransactionMutationResult>
  checkBalanceIntegrity(repair: boolean): Promise<BalanceCheck>
  updateSettings(next: Settings): Promise<Settings>
  clearAll(): Promise<LedgerSnapshot>
  restoreBackup(backup: LedgerBackup): Promise<LedgerSnapshot>
}
