import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccountInput, LedgerSnapshot, Settings, TransactionInput } from '../shared/types/ledger'
import { LEDGER_SCHEMA_VERSION } from '../shared/types/ledger'
import type { LedgerDatabase } from '../server/utils/database'
import { getLedgerSchemaVersion, openLedgerDatabase } from '../server/utils/database'
import {
  createAccount,
  createTransaction,
  deleteTransaction,
  getSnapshot,
  reorderAccounts,
  updateAccount,
  updateSettings,
} from '../server/utils/ledgerRepository'
import {
  accountInputSchema,
  reorderSchema,
  settingsSchema,
  transactionInputSchema,
} from '../server/utils/validation'

interface ConsistencyFixture {
  schemaVersion: number
  accounts: AccountInput[]
  reorder: number[]
  updateAccount: { id: number, input: AccountInput }
  transactions: TransactionInput[]
  deleteTransactionId: number
  settings: Settings
  expected: LedgerSnapshot
}

const fixture = JSON.parse(readFileSync(
  new URL('./fixtures/backend-consistency.json', import.meta.url),
  'utf8',
)) as ConsistencyFixture

describe('TypeScript/Rust shared backend contract (TypeScript implementation)', () => {
  let database: LedgerDatabase

  beforeEach(() => {
    database = openLedgerDatabase(':memory:')
  })

  afterEach(() => {
    database.close()
  })

  it('matches the shared schema version and final ledger snapshot', () => {
    expect(LEDGER_SCHEMA_VERSION).toBe(fixture.schemaVersion)
    expect(getLedgerSchemaVersion(database)).toBe(fixture.schemaVersion)

    fixture.accounts.forEach(input => createAccount(database, accountInputSchema.parse(input)))
    reorderAccounts(database, reorderSchema.parse({ ids: fixture.reorder }).ids)
    updateAccount(
      database,
      fixture.updateAccount.id,
      accountInputSchema.parse(fixture.updateAccount.input),
    )
    fixture.transactions.forEach(input => (
      createTransaction(database, transactionInputSchema.parse(input))
    ))
    deleteTransaction(database, fixture.deleteTransactionId)
    updateSettings(database, settingsSchema.parse(fixture.settings))

    expect(getSnapshot(database)).toEqual(fixture.expected)
  })
})
