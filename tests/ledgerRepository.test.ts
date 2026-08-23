import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LedgerDatabase } from '../server/utils/database'
import { openLedgerDatabase } from '../server/utils/database'
import {
  clearLedger,
  createAccount,
  createTransaction,
  deleteTransaction,
  getSnapshot,
  reorderAccounts,
  updateAccount,
  updateSettings,
} from '../server/utils/ledgerRepository'

describe('ledger repository', () => {
  let database: LedgerDatabase

  beforeEach(() => {
    database = openLedgerDatabase(':memory:')
  })

  afterEach(() => {
    database.close()
  })

  it('persists accounts and their order', () => {
    const cash = createAccount(database, {
      name: '现金', type: 'cash', currency: 'CNY', balance: 100,
    })
    const card = createAccount(database, {
      name: '银行卡', type: 'bank', currency: 'CNY', balance: 500,
    })

    const reordered = reorderAccounts(database, [card.id, cash.id])
    expect(reordered.map(account => account.id)).toEqual([card.id, cash.id])

    const updated = updateAccount(database, card.id, {
      name: '工资卡', type: 'bank', currency: 'CNY', balance: 800,
    })
    expect(updated).toMatchObject({ name: '工资卡', balance: 800 })
  })

  it('updates and restores the account balance with a transaction', () => {
    const account = createAccount(database, {
      name: '现金', type: 'cash', currency: 'CNY', balance: 100,
    })
    const created = createTransaction(database, {
      accountId: account.id,
      date: '2026-08-23',
      type: 'expense',
      amount: 12.34,
      category: '餐饮',
      note: '午餐',
    })

    expect(created.account.balance).toBe(87.66)
    expect(created.transaction.currency).toBe('CNY')
    expect(deleteTransaction(database, created.transaction.id).account.balance).toBe(100)
    expect(getSnapshot(database).transactions).toHaveLength(0)
  })

  it('persists settings and clears all server-side data', () => {
    createAccount(database, {
      name: '钱包', type: 'wallet', currency: 'USD', balance: 20,
    })
    updateSettings(database, { baseCurrency: 'USD', masked: true, theme: 'dark' })

    const cleared = clearLedger(database)
    expect(cleared.accounts).toEqual([])
    expect(cleared.transactions).toEqual([])
    expect(cleared.settings).toEqual({ baseCurrency: 'CNY', masked: false, theme: 'light' })
  })
})
