import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { AccountInput, LedgerBackup, TransactionInput, TransferInput } from '../shared/types/ledger'
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, LEDGER_SCHEMA_VERSION } from '../shared/types/ledger'
import { openLedgerDatabase } from '../server/utils/database'
import {
  checkBalances, clearLedger, createAccount, createTransaction, createTransfer, deleteAccount,
  deleteTransaction, getSnapshot, restoreLedger, updateTransaction,
} from '../server/utils/ledgerRepository'

interface Fixture {
  accounts: AccountInput[]
  transactions: TransactionInput[]
  edit: { id: number, input: TransactionInput }
  transfer: TransferInput
  invalidTransfer: TransferInput
  afterEdit: number[]
  afterTransfer: number[]
  afterDelete: number[]
}

const fixture: Fixture = JSON.parse(readFileSync(new URL('./fixtures/backend-mutations.json', import.meta.url), 'utf8'))

it('matches the shared mutation contract: edits, transfers, rejection and restore', () => {
  const db = openLedgerDatabase(':memory:')
  const balances = () => getSnapshot(db).accounts.map(account => account.balance)
  try {
    fixture.accounts.forEach(input => createAccount(db, input))
    fixture.transactions.forEach(input => createTransaction(db, input))
    updateTransaction(db, fixture.edit.id, fixture.edit.input)
    expect(balances()).toEqual(fixture.afterEdit)
    const transfer = createTransfer(db, fixture.transfer)
    expect(balances()).toEqual(fixture.afterTransfer)
    expect(transfer.transactions).toHaveLength(2)
    expect(transfer.transactions[0]!.transferId).toBeTruthy()
    expect(transfer.transactions[0]!.transferId).toBe(transfer.transactions[1]!.transferId)
    const beforeReject = getSnapshot(db)
    expect(() => createTransfer(db, fixture.invalidTransfer)).toThrow()
    expect(() => deleteAccount(db, 1)).toThrow()
    expect(getSnapshot(db)).toEqual(beforeReject)
    deleteTransaction(db, transfer.transactions[0]!.id)
    expect(balances()).toEqual(fixture.afterDelete)
    expect(getSnapshot(db).transactions).toHaveLength(3)
    expect(checkBalances(db).ok).toBe(true)

    const backup: LedgerBackup = {
      format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: LEDGER_SCHEMA_VERSION, exportedAt: '2026-09-12T00:00:00Z', data: getSnapshot(db),
    }
    createTransaction(db, fixture.transactions[0]!)
    restoreLedger(db, backup)
    expect(getSnapshot(db)).toEqual(backup.data)
    const invalid = structuredClone(backup)
    invalid.data.transactions[0]!.accountId = 999
    expect(() => restoreLedger(db, invalid)).toThrow()
    expect(getSnapshot(db)).toEqual(backup.data)
    expect(clearLedger(db)).toEqual({
      accounts: [], transactions: [], settings: { baseCurrency: 'CNY', masked: false, theme: 'light' },
    })
  }
  finally {
    db.close()
  }
})
