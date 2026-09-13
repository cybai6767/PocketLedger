import { describe, expect, it, vi } from 'vitest'
import { createHttpLedgerBackend } from '../app/services/ledger/http'
import { createTauriLedgerBackend } from '../app/services/ledger/tauri'
import type { LedgerBackend } from '../app/services/ledger/types'
import type { LedgerBackup } from '../shared/types/ledger'
import { BACKUP_FORMAT, DEFAULT_SETTINGS } from '../shared/types/ledger'

const account = { name: '现金', type: 'cash', currency: 'CNY', balance: 100 } as const
const transaction = { date: '2026-09-12', type: 'expense', accountId: 1, amount: 20, category: '餐饮' } as const
const transfer = { date: '2026-09-12', fromAccountId: 1, toAccountId: 2, amount: 25 }
const backup: LedgerBackup = {
  format: BACKUP_FORMAT, formatVersion: 1, schemaVersion: 2, exportedAt: '2026-09-12T00:00:00Z',
  data: { accounts: [], transactions: [], settings: DEFAULT_SETTINGS },
}
const cases: { name: string, call: (backend: LedgerBackend) => Promise<unknown>, http: unknown[], ipc: unknown[] }[] = [
  { name: 'snapshot', call: b => b.loadSnapshot(), http: ['/api/ledger'], ipc: ['get_snapshot'] },
  { name: 'automatic backup', call: b => b.loadLatestAutomaticBackup(), http: ['/api/ledger/automatic-backup'], ipc: ['get_latest_automatic_backup'] },
  { name: 'create account', call: b => b.addAccount(account), http: ['/api/accounts', { method: 'POST', body: account }], ipc: ['create_account', { input: account }] },
  { name: 'edit account', call: b => b.updateAccount(1, account), http: ['/api/accounts/1', { method: 'PUT', body: account }], ipc: ['update_account', { id: 1, input: account }] },
  { name: 'delete account', call: b => b.removeAccount(1), http: ['/api/accounts/1', { method: 'DELETE' }], ipc: ['delete_account', { id: 1 }] },
  { name: 'reorder', call: b => b.reorderAccounts([2, 1]), http: ['/api/accounts/reorder', { method: 'PUT', body: { ids: [2, 1] } }], ipc: ['reorder_accounts', { ids: [2, 1] }] },
  { name: 'create transaction', call: b => b.addTransaction(transaction), http: ['/api/transactions', { method: 'POST', body: transaction }], ipc: ['create_transaction', { input: transaction }] },
  { name: 'edit transaction', call: b => b.editTransaction(1, transaction), http: ['/api/transactions/1', { method: 'PUT', body: transaction }], ipc: ['update_transaction', { id: 1, input: transaction }] },
  { name: 'delete transaction', call: b => b.removeTransaction(1), http: ['/api/transactions/1', { method: 'DELETE' }], ipc: ['delete_transaction', { id: 1 }] },
  { name: 'transfer', call: b => b.addTransfer(transfer), http: ['/api/transfers', { method: 'POST', body: transfer }], ipc: ['create_transfer', { input: transfer }] },
  { name: 'edit transfer', call: b => b.editTransfer(1, transfer), http: ['/api/transfers/1', { method: 'PUT', body: transfer }], ipc: ['update_transfer', { id: 1, input: transfer }] },
  { name: 'check', call: b => b.checkBalanceIntegrity(false), http: ['/api/ledger/integrity', { method: 'GET' }], ipc: ['check_balances'] },
  { name: 'repair', call: b => b.checkBalanceIntegrity(true), http: ['/api/ledger/integrity', { method: 'POST' }], ipc: ['repair_balances'] },
  { name: 'settings', call: b => b.updateSettings(DEFAULT_SETTINGS), http: ['/api/settings', { method: 'PUT', body: DEFAULT_SETTINGS }], ipc: ['update_settings', { settings: DEFAULT_SETTINGS }] },
  { name: 'clear', call: b => b.clearAll(), http: ['/api/ledger', { method: 'DELETE' }], ipc: ['clear_ledger'] },
  { name: 'restore', call: b => b.restoreBackup(backup), http: ['/api/ledger/restore', { method: 'POST', body: backup }], ipc: ['restore_ledger', { backup }] },
]

describe.each(['http', 'ipc'] as const)('%s transport contract', platform => {
  it.each(cases)('$name preserves wire protocol and response', async ({ call, http, ipc }) => {
    const response = { marker: 'backend response' }
    const transport = vi.fn().mockResolvedValue(response)
    const backend = platform === 'http' ? createHttpLedgerBackend(transport) : createTauriLedgerBackend(transport)
    expect(await call(backend)).toBe(response)
    expect(transport).toHaveBeenCalledExactlyOnceWith(...(platform === 'http' ? http : ipc))
  })
  it('propagates errors to the state layer without retrying a mutation', async () => {
    const error = new Error('save failed')
    const transport = vi.fn().mockRejectedValue(error)
    const backend = platform === 'http' ? createHttpLedgerBackend(transport) : createTauriLedgerBackend(transport)
    await expect(backend.addTransaction(transaction)).rejects.toBe(error)
    expect(transport).toHaveBeenCalledTimes(1)
  })
})
