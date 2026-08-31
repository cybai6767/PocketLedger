import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LedgerDatabase } from '../server/utils/database'
import {
  getLedgerSchemaVersion,
  migrateLedgerDatabase,
  openLedgerDatabase,
} from '../server/utils/database'
import type { LedgerBackup } from '../shared/types/ledger'
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  LEDGER_SCHEMA_VERSION,
} from '../shared/types/ledger'
import {
  clearLedger,
  checkBalances,
  createAccount,
  createTransfer,
  createTransaction,
  deleteAccount,
  deleteTransaction,
  getSnapshot,
  reorderAccounts,
  readLatestAutomaticBackup,
  restoreLedger,
  updateTransaction,
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
    expect(deleteTransaction(database, created.transaction.id).accounts[0]?.balance).toBe(100)
    expect(getSnapshot(database).transactions).toHaveLength(0)
  })

  it('uses decimal arithmetic for amounts such as 0.1 plus 0.2', () => {
    const account = createAccount(database, {
      name: '零钱', type: 'wallet', currency: 'CNY', balance: 0,
    })
    createTransaction(database, {
      accountId: account.id, date: '2026-08-30', type: 'income', amount: 0.1, category: '测试',
    })
    createTransaction(database, {
      accountId: account.id, date: '2026-08-30', type: 'income', amount: 0.2, category: '测试',
    })

    expect(getSnapshot(database).accounts[0]?.balance).toBe(0.3)
  })

  it('edits a transaction and recalculates both the old and new accounts', () => {
    const first = createAccount(database, {
      name: '现金', type: 'cash', currency: 'CNY', balance: 100,
    })
    const second = createAccount(database, {
      name: '钱包', type: 'wallet', currency: 'CNY', balance: 50,
    })
    const created = createTransaction(database, {
      accountId: first.id, date: '2026-08-30', type: 'expense', amount: 10, category: '餐饮',
    })

    updateTransaction(database, created.transaction.id, {
      accountId: second.id, date: '2026-08-31', type: 'expense', amount: 20, category: '交通',
    })
    const snapshot = getSnapshot(database)
    expect(snapshot.accounts.find(account => account.id === first.id)?.balance).toBe(100)
    expect(snapshot.accounts.find(account => account.id === second.id)?.balance).toBe(30)
    expect(snapshot.transactions[0]).toMatchObject({ accountId: second.id, amount: 20, category: '交通' })
  })

  it('creates and deletes both sides of a transfer atomically', () => {
    const from = createAccount(database, {
      name: '支付宝', type: 'wallet', currency: 'CNY', balance: 100,
    })
    const to = createAccount(database, {
      name: '银行卡', type: 'bank', currency: 'CNY', balance: 20,
    })
    const transfer = createTransfer(database, {
      date: '2026-08-31', fromAccountId: from.id, toAccountId: to.id, amount: 30,
    })

    expect(transfer.transactions).toHaveLength(2)
    expect(new Set(transfer.transactions.map(item => item.transferId)).size).toBe(1)
    expect(transfer.accounts.map(account => account.balance)).toEqual([70, 50])
    expect(deleteTransaction(database, transfer.transactions[0]!.id).transactions).toHaveLength(2)
    expect(getSnapshot(database).transactions).toHaveLength(0)
    expect(getSnapshot(database).accounts.map(account => account.balance)).toEqual([100, 20])
  })

  it('blocks deleting an account that still owns transactions', () => {
    const account = createAccount(database, {
      name: '现金', type: 'cash', currency: 'CNY', balance: 100,
    })
    createTransaction(database, {
      accountId: account.id, date: '2026-08-31', type: 'expense', amount: 1, category: '测试',
    })

    expect(() => deleteAccount(database, account.id)).toThrow('还有 1 条流水')
  })

  it('detects and repairs a balance that was changed outside normal business logic', () => {
    const account = createAccount(database, {
      name: '现金', type: 'cash', currency: 'CNY', balance: 100,
    })
    database.prepare('UPDATE accounts SET balance = ? WHERE id = ?').run('999', account.id)

    expect(checkBalances(database)).toMatchObject({ ok: false, repaired: false })
    expect(checkBalances(database, true)).toMatchObject({ ok: false, repaired: true })
    expect(getSnapshot(database).accounts[0]?.balance).toBe(100)
    expect(checkBalances(database)).toMatchObject({ ok: true, repaired: false })
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

  it('migrates a legacy database without losing ledger data', () => {
    database.close()
    database = new BetterSqlite3(':memory:')
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
        currency TEXT NOT NULL, balance TEXT NOT NULL DEFAULT '0', sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, date TEXT NOT NULL,
        type TEXT NOT NULL, amount TEXT NOT NULL, currency TEXT NOT NULL, category TEXT NOT NULL,
        note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );
      CREATE TABLE settings (
        id INTEGER PRIMARY KEY CHECK (id = 1), base_currency TEXT NOT NULL DEFAULT 'CNY',
        masked INTEGER NOT NULL DEFAULT 0, theme TEXT NOT NULL DEFAULT 'light'
      );
      INSERT INTO settings (id) VALUES (1);
      INSERT INTO accounts (name, type, currency, balance, sort_order)
      VALUES ('迁移前账户', 'cash', 'CNY', '87.66', 0);
      INSERT INTO transactions (account_id, date, type, amount, currency, category)
      VALUES (1, '2026-08-30', 'expense', '12.34', 'CNY', '餐饮');
      PRAGMA user_version = 1;
    `)

    migrateLedgerDatabase(database)

    expect(getLedgerSchemaVersion(database)).toBe(LEDGER_SCHEMA_VERSION)
    expect(getSnapshot(database).accounts[0]?.balance).toBe(87.66)
    expect(database.prepare('SELECT opening_balance FROM accounts WHERE id = 1').pluck().get()).toBe('100')
  })

  it('rejects databases created by a newer app version', () => {
    database.pragma(`user_version = ${LEDGER_SCHEMA_VERSION + 1}`)
    expect(() => migrateLedgerDatabase(database)).toThrow('高于当前程序支持的版本')
  })

  it('restores a complete backup and continues IDs from the restored maximum', () => {
    const backup: LedgerBackup = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: LEDGER_SCHEMA_VERSION,
      exportedAt: '2026-08-30T02:03:04.000Z',
      data: {
        accounts: [
          { id: 7, name: '恢复账户', type: 'wallet', currency: 'CNY', balance: 88.5, sortOrder: 0 },
        ],
        transactions: [
          {
            id: 12,
            accountId: 7,
            date: '2026-08-30',
            type: 'income',
            amount: 8.5,
            currency: 'CNY',
            category: '其他',
            note: '恢复测试',
          },
        ],
        settings: { baseCurrency: 'USD', masked: true, theme: 'dark' },
      },
    }

    expect(restoreLedger(database, backup)).toEqual(backup.data)
    expect(createAccount(database, {
      name: '恢复后新账户', type: 'cash', currency: 'CNY', balance: 0,
    }).id).toBe(8)
  })

  it('rolls back the entire restore if any database write fails', () => {
    const original = createAccount(database, {
      name: '原账本', type: 'cash', currency: 'CNY', balance: 100,
    })
    const invalidBackup: LedgerBackup = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: LEDGER_SCHEMA_VERSION,
      exportedAt: '2026-08-30T02:03:04.000Z',
      data: {
        accounts: [
          { id: 2, name: '重复一', type: 'cash', currency: 'CNY', balance: 1, sortOrder: 0 },
          { id: 2, name: '重复二', type: 'cash', currency: 'CNY', balance: 2, sortOrder: 1 },
        ],
        transactions: [],
        settings: { baseCurrency: 'USD', masked: true, theme: 'dark' },
      },
    }

    expect(() => restoreLedger(database, invalidBackup)).toThrow()
    expect(getSnapshot(database).accounts).toEqual([original])
    expect(getSnapshot(database).settings).toEqual({ baseCurrency: 'CNY', masked: false, theme: 'light' })
  })

  it('keeps only the seven newest automatic JSON backups', () => {
    const directory = mkdtempSync(join(tmpdir(), 'accounting-tool-backup-'))
    const filename = join(directory, 'ledger.sqlite')
    const fileDatabase = openLedgerDatabase(filename)
    try {
      for (let index = 0; index < 8; index += 1) {
        createAccount(fileDatabase, {
          name: `账户${index}`, type: 'cash', currency: 'CNY', balance: index,
        })
      }
      const backupDirectory = join(directory, 'automatic-backups')
      const files = readdirSync(backupDirectory)
      expect(files).toHaveLength(7)
      const content = JSON.parse(readFileSync(join(backupDirectory, files[0]!), 'utf8'))
      expect(content).toMatchObject({ format: BACKUP_FORMAT, schemaVersion: LEDGER_SCHEMA_VERSION })
      expect(readLatestAutomaticBackup(fileDatabase)?.data.accounts).toHaveLength(7)
    }
    finally {
      fileDatabase.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
