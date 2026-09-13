import type { LedgerDatabase } from './database'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import Decimal from 'decimal.js'
import { createError } from 'h3'
import type {
  Account,
  AccountInput,
  BalanceCheck,
  BalanceIssue,
  Currency,
  LedgerBackup,
  LedgerSnapshot,
  Settings,
  Transaction,
  TransactionInput,
  TransactionMutationResult,
  TransferInput,
  TxType,
} from '../../shared/types/ledger'
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  LEDGER_SCHEMA_VERSION,
} from '../../shared/types/ledger'

interface AccountRow {
  id: number
  name: string
  type: Account['type']
  currency: Currency
  balance: string
  opening_balance: string
  sort_order: number
}

interface TransactionRow {
  id: number
  account_id: number
  date: string
  type: TxType
  amount: string
  currency: Currency
  category: string
  note: string | null
  transfer_id: string | null
}

interface SettingsRow {
  base_currency: Currency
  masked: number
  theme: Settings['theme']
  language: Settings['language']
}

function amountForStorage(value: number | string | Decimal): string {
  return new Decimal(value).toDecimalPlaces(8).toString()
}

const AUTOMATIC_BACKUP_LIMIT = 7

function automaticBackupDirectory(database: LedgerDatabase): string {
  return join(dirname(database.name), 'automatic-backups')
}

function saveAutomaticBackup(database: LedgerDatabase): void {
  if (database.name === ':memory:') return
  const directory = automaticBackupDirectory(database)
  mkdirSync(directory, { recursive: true })
  const now = new Date()
  const backup: LedgerBackup = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: LEDGER_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data: getSnapshot(database),
  }
  // Preserve write order even when multiple mutations share a millisecond or
  // the clock moves backwards. Read disk so reopening the database is safe too.
  const lastTimestamp = readdirSync(directory).reduce((latest, name) => {
    const match = /^automatic-(\d+)-[a-f0-9-]+\.json$/.exec(name)
    return match ? Math.max(latest, Number(match[1])) : latest
  }, 0)
  const timestamp = Math.max(now.getTime(), lastTimestamp + 1)
  const filename = `automatic-${timestamp}-${randomUUID()}.json`
  writeFileSync(join(directory, filename), `${JSON.stringify(backup, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
  const backups = readdirSync(directory)
    .filter(name => /^automatic-\d+-[a-f0-9-]+\.json$/.test(name))
    .sort((left, right) => right.localeCompare(left))
  for (const expired of backups.slice(AUTOMATIC_BACKUP_LIMIT)) {
    rmSync(join(directory, expired))
  }
}

export function readLatestAutomaticBackup(database: LedgerDatabase): LedgerBackup | null {
  if (database.name === ':memory:') return null
  const directory = automaticBackupDirectory(database)
  let files: string[]
  try {
    files = readdirSync(directory)
      .filter(name => /^automatic-\d+-[a-f0-9-]+\.json$/.test(name))
      .sort((left, right) => right.localeCompare(left))
  }
  catch {
    return null
  }
  const latest = files[0]
  if (!latest) return null
  return JSON.parse(readFileSync(join(directory, latest), 'utf8')) as LedgerBackup
}

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    balance: Number(row.balance),
    sortOrder: row.sort_order,
  }
}

function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    date: row.date,
    type: row.type,
    amount: Number(row.amount),
    currency: row.currency,
    category: row.category,
    note: row.note ?? undefined,
    transferId: row.transfer_id ?? undefined,
  }
}

export function listAccounts(database: LedgerDatabase): Account[] {
  const rows = database.prepare(`
    SELECT id, name, type, currency, balance, opening_balance, sort_order
    FROM accounts
    ORDER BY sort_order ASC, id ASC
  `).all() as AccountRow[]
  return rows.map(mapAccount)
}

export function listTransactions(database: LedgerDatabase): Transaction[] {
  const rows = database.prepare(`
    SELECT id, account_id, date, type, amount, currency, category, note, transfer_id
    FROM transactions
    ORDER BY date DESC, id DESC
  `).all() as TransactionRow[]
  return rows.map(mapTransaction)
}

export function getSettings(database: LedgerDatabase): Settings {
  const row = database.prepare(`
    SELECT base_currency, masked, theme, language FROM settings WHERE id = 1
  `).get() as SettingsRow
  return {
    baseCurrency: row.base_currency,
    masked: Boolean(row.masked),
    theme: row.theme,
    language: row.language,
  }
}

export function getSnapshot(database: LedgerDatabase): LedgerSnapshot {
  return {
    accounts: listAccounts(database),
    transactions: listTransactions(database),
    settings: getSettings(database),
  }
}

function transactionNet(database: LedgerDatabase, accountId: number): Decimal {
  const rows = database.prepare(`
    SELECT type, amount FROM transactions WHERE account_id = ?
  `).all(accountId) as Array<{ type: TxType, amount: string }>
  return rows.reduce(
    (sum, row) => row.type === 'income' ? sum.plus(row.amount) : sum.minus(row.amount),
    new Decimal(0),
  )
}

function expectedBalance(database: LedgerDatabase, accountId: number): Decimal {
  const row = database.prepare('SELECT opening_balance FROM accounts WHERE id = ?')
    .get(accountId) as { opening_balance: string } | undefined
  if (!row) throw createError({ statusCode: 404, message: '账户不存在' })
  return new Decimal(row.opening_balance).plus(transactionNet(database, accountId))
}

function recalculateAccount(database: LedgerDatabase, accountId: number): Account {
  database.prepare(`
    UPDATE accounts SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(amountForStorage(expectedBalance(database, accountId)), accountId)
  return getAccount(database, accountId)
}

export function createAccount(database: LedgerDatabase, input: AccountInput): Account {
  saveAutomaticBackup(database)
  const nextOrder = database.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM accounts
  `).pluck().get() as number
  const result = database.prepare(`
    INSERT INTO accounts (name, type, currency, balance, opening_balance, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.name,
    input.type,
    input.currency,
    amountForStorage(input.balance),
    amountForStorage(input.balance),
    nextOrder,
  )
  return getAccount(database, Number(result.lastInsertRowid))
}

export function getAccount(database: LedgerDatabase, id: number): Account {
  const row = database.prepare(`
    SELECT id, name, type, currency, balance, opening_balance, sort_order FROM accounts WHERE id = ?
  `).get(id) as AccountRow | undefined
  if (!row) throw createError({ statusCode: 404, message: '账户不存在' })
  return mapAccount(row)
}

export function updateAccount(
  database: LedgerDatabase,
  id: number,
  input: AccountInput,
): Account {
  saveAutomaticBackup(database)
  return database.transaction(() => {
    const current = getAccount(database, id)
    const transactionCount = database.prepare(
      'SELECT COUNT(*) FROM transactions WHERE account_id = ?',
    ).pluck().get(id) as number
    if (transactionCount > 0 && current.currency !== input.currency) {
      throw createError({ statusCode: 409, message: '该账户已有流水，不能修改币种' })
    }
    const opening = new Decimal(input.balance).minus(transactionNet(database, id))
    database.prepare(`
      UPDATE accounts
      SET name = ?, type = ?, currency = ?, opening_balance = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(input.name, input.type, input.currency, amountForStorage(opening), id)
    return recalculateAccount(database, id)
  })()
}

export function deleteAccount(database: LedgerDatabase, id: number): void {
  const transactionCount = database.prepare(
    'SELECT COUNT(*) FROM transactions WHERE account_id = ?',
  ).pluck().get(id) as number
  if (transactionCount > 0) {
    throw createError({
      statusCode: 409,
      message: `该账户还有 ${transactionCount} 条流水，请先处理这些流水再删除账户`,
    })
  }
  saveAutomaticBackup(database)
  const result = database.prepare('DELETE FROM accounts WHERE id = ?').run(id)
  if (result.changes === 0) throw createError({ statusCode: 404, message: '账户不存在' })
}

export function reorderAccounts(database: LedgerDatabase, ids: number[]): Account[] {
  const currentIds = listAccounts(database).map(account => account.id)
  if (
    ids.length !== currentIds.length
    || new Set(ids).size !== ids.length
    || currentIds.some(id => !ids.includes(id))
  ) {
    throw createError({ statusCode: 400, message: '账户排序数据不完整' })
  }

  saveAutomaticBackup(database)

  const update = database.prepare('UPDATE accounts SET sort_order = ? WHERE id = ?')
  database.transaction(() => ids.forEach((id, index) => update.run(index, id)))()
  return listAccounts(database)
}

export function createTransaction(
  database: LedgerDatabase,
  input: TransactionInput,
): { transaction: Transaction, account: Account } {
  saveAutomaticBackup(database)
  return database.transaction(() => {
    const account = getAccount(database, input.accountId)
    const result = database.prepare(`
      INSERT INTO transactions (account_id, date, type, amount, currency, category, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.accountId,
      input.date,
      input.type,
      amountForStorage(input.amount),
      account.currency,
      input.category,
      input.note || null,
    )

    const row = database.prepare(`
      SELECT id, account_id, date, type, amount, currency, category, note, transfer_id
      FROM transactions WHERE id = ?
    `).get(Number(result.lastInsertRowid)) as TransactionRow

    return { transaction: mapTransaction(row), account: recalculateAccount(database, account.id) }
  })()
}

export function updateTransaction(
  database: LedgerDatabase,
  id: number,
  input: TransactionInput,
): TransactionMutationResult {
  saveAutomaticBackup(database)
  return database.transaction(() => {
    const previous = database.prepare(`
      SELECT id, account_id, date, type, amount, currency, category, note, transfer_id
      FROM transactions WHERE id = ?
    `).get(id) as TransactionRow | undefined
    if (!previous) throw createError({ statusCode: 404, message: '交易不存在' })
    if (previous.transfer_id) {
      throw createError({ statusCode: 409, message: '转账由两条关联流水组成，请删除后重新转账' })
    }
    const nextAccount = getAccount(database, input.accountId)
    database.prepare(`
      UPDATE transactions
      SET account_id = ?, date = ?, type = ?, amount = ?, currency = ?, category = ?, note = ?
      WHERE id = ?
    `).run(
      input.accountId,
      input.date,
      input.type,
      amountForStorage(input.amount),
      nextAccount.currency,
      input.category,
      input.note || null,
      id,
    )
    const accountIds = [...new Set([previous.account_id, input.accountId])]
    const accounts = accountIds.map(accountId => recalculateAccount(database, accountId))
    const row = database.prepare(`
      SELECT id, account_id, date, type, amount, currency, category, note, transfer_id
      FROM transactions WHERE id = ?
    `).get(id) as TransactionRow
    return { transactions: [mapTransaction(row)], accounts }
  })()
}

export function createTransfer(
  database: LedgerDatabase,
  input: TransferInput,
): TransactionMutationResult {
  saveAutomaticBackup(database)
  return database.transaction(() => {
    if (input.fromAccountId === input.toAccountId) {
      throw createError({ statusCode: 400, message: '转出账户和转入账户不能相同' })
    }
    const from = getAccount(database, input.fromAccountId)
    const to = getAccount(database, input.toAccountId)
    if (from.currency !== to.currency) {
      throw createError({ statusCode: 409, message: '第一版转账只支持币种相同的两个账户' })
    }
    const transferId = database.prepare('SELECT lower(hex(randomblob(16)))').pluck().get() as string
    const insert = database.prepare(`
      INSERT INTO transactions
      (account_id, date, type, amount, currency, category, note, transfer_id)
      VALUES (?, ?, ?, ?, ?, '转账', ?, ?)
    `)
    const amount = amountForStorage(input.amount)
    const note = input.note || null
    const expense = insert.run(from.id, input.date, 'expense', amount, from.currency, note, transferId)
    const income = insert.run(to.id, input.date, 'income', amount, to.currency, note, transferId)
    const rows = database.prepare(`
      SELECT id, account_id, date, type, amount, currency, category, note, transfer_id
      FROM transactions WHERE id IN (?, ?) ORDER BY id
    `).all(Number(expense.lastInsertRowid), Number(income.lastInsertRowid)) as TransactionRow[]
    return {
      transactions: rows.map(mapTransaction),
      accounts: [recalculateAccount(database, from.id), recalculateAccount(database, to.id)],
    }
  })()
}

export function deleteTransaction(
  database: LedgerDatabase,
  id: number,
): TransactionMutationResult {
  saveAutomaticBackup(database)
  return database.transaction(() => {
    const row = database.prepare(`
      SELECT id, account_id, date, type, amount, currency, category, note, transfer_id
      FROM transactions WHERE id = ?
    `).get(id) as TransactionRow | undefined
    if (!row) throw createError({ statusCode: 404, message: '交易不存在' })
    const rows = row.transfer_id
      ? database.prepare(`
          SELECT id, account_id, date, type, amount, currency, category, note, transfer_id
          FROM transactions WHERE transfer_id = ?
        `).all(row.transfer_id) as TransactionRow[]
      : [row]
    if (row.transfer_id) database.prepare('DELETE FROM transactions WHERE transfer_id = ?').run(row.transfer_id)
    else database.prepare('DELETE FROM transactions WHERE id = ?').run(id)
    const accountIds = [...new Set(rows.map(item => item.account_id))]
    return {
      transactions: rows.map(mapTransaction),
      accounts: accountIds.map(accountId => recalculateAccount(database, accountId)),
    }
  })()
}

export function checkBalances(database: LedgerDatabase, repair = false): BalanceCheck {
  const issues: BalanceIssue[] = []
  for (const account of listAccounts(database)) {
    const expected = expectedBalance(database, account.id)
    const stored = new Decimal(account.balance)
    if (!stored.equals(expected)) {
      issues.push({
        accountId: account.id,
        accountName: account.name,
        storedBalance: account.balance,
        expectedBalance: Number(amountForStorage(expected)),
      })
    }
  }
  if (repair && issues.length) {
    saveAutomaticBackup(database)
    database.transaction(() => {
      for (const issue of issues) recalculateAccount(database, issue.accountId)
    })()
  }
  return { ok: issues.length === 0, repaired: repair && issues.length > 0, issues }
}

export function updateSettings(database: LedgerDatabase, settings: Settings): Settings {
  saveAutomaticBackup(database)
  database.prepare(`
    UPDATE settings SET base_currency = ?, masked = ?, theme = ?, language = ? WHERE id = 1
  `).run(settings.baseCurrency, Number(settings.masked), settings.theme, settings.language)
  return getSettings(database)
}

export function clearLedger(database: LedgerDatabase): LedgerSnapshot {
  saveAutomaticBackup(database)
  database.transaction(() => {
    database.prepare('DELETE FROM transactions').run()
    database.prepare('DELETE FROM accounts').run()
    database.prepare(`
      UPDATE settings SET base_currency = 'CNY', masked = 0, theme = 'light', language = 'zh-CN' WHERE id = 1
    `).run()
  })()
  return getSnapshot(database)
}

export function restoreLedger(database: LedgerDatabase, backup: LedgerBackup): LedgerSnapshot {
  saveAutomaticBackup(database)
  database.transaction(() => {
    database.prepare('DELETE FROM transactions').run()
    database.prepare('DELETE FROM accounts').run()

    const insertAccount = database.prepare(`
      INSERT INTO accounts (id, name, type, currency, balance, opening_balance, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    for (const account of backup.data.accounts) {
      const net = backup.data.transactions
        .filter(record => record.accountId === account.id)
        .reduce(
          (sum, record) => record.type === 'income'
            ? sum.plus(record.amount)
            : sum.minus(record.amount),
          new Decimal(0),
        )
      insertAccount.run(
        account.id,
        account.name,
        account.type,
        account.currency,
        amountForStorage(account.balance),
        amountForStorage(new Decimal(account.balance).minus(net)),
        account.sortOrder,
      )
    }

    const insertTransaction = database.prepare(`
      INSERT INTO transactions (id, account_id, date, type, amount, currency, category, note, transfer_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const transaction of backup.data.transactions) {
      insertTransaction.run(
        transaction.id,
        transaction.accountId,
        transaction.date,
        transaction.type,
        amountForStorage(transaction.amount),
        transaction.currency,
        transaction.category,
        transaction.note || null,
        transaction.transferId || null,
      )
    }

    database.prepare(`
      UPDATE settings SET base_currency = ?, masked = ?, theme = ?, language = ? WHERE id = 1
    `).run(
      backup.data.settings.baseCurrency,
      Number(backup.data.settings.masked),
      backup.data.settings.theme,
      backup.data.settings.language,
    )

    database.prepare('DELETE FROM sqlite_sequence WHERE name IN (?, ?)')
      .run('accounts', 'transactions')
    const maxAccountId = backup.data.accounts.reduce((max, item) => Math.max(max, item.id), 0)
    const maxTransactionId = backup.data.transactions.reduce((max, item) => Math.max(max, item.id), 0)
    if (maxAccountId > 0) {
      database.prepare('INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)')
        .run('accounts', maxAccountId)
    }
    if (maxTransactionId > 0) {
      database.prepare('INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)')
        .run('transactions', maxTransactionId)
    }
  })()
  return getSnapshot(database)
}
