import type { LedgerDatabase } from './database'
import Decimal from 'decimal.js'
import { createError } from 'h3'
import type {
  Account,
  AccountInput,
  Currency,
  LedgerSnapshot,
  Settings,
  Transaction,
  TransactionInput,
  TxType,
} from '../../shared/types/ledger'

interface AccountRow {
  id: number
  name: string
  type: Account['type']
  currency: Currency
  balance: string
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
}

interface SettingsRow {
  base_currency: Currency
  masked: number
  theme: Settings['theme']
}

function amountForStorage(value: number | string | Decimal): string {
  return new Decimal(value).toDecimalPlaces(8).toString()
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
  }
}

export function listAccounts(database: LedgerDatabase): Account[] {
  const rows = database.prepare(`
    SELECT id, name, type, currency, balance, sort_order
    FROM accounts
    ORDER BY sort_order ASC, id ASC
  `).all() as AccountRow[]
  return rows.map(mapAccount)
}

export function listTransactions(database: LedgerDatabase): Transaction[] {
  const rows = database.prepare(`
    SELECT id, account_id, date, type, amount, currency, category, note
    FROM transactions
    ORDER BY date DESC, id DESC
  `).all() as TransactionRow[]
  return rows.map(mapTransaction)
}

export function getSettings(database: LedgerDatabase): Settings {
  const row = database.prepare(`
    SELECT base_currency, masked, theme FROM settings WHERE id = 1
  `).get() as SettingsRow
  return {
    baseCurrency: row.base_currency,
    masked: Boolean(row.masked),
    theme: row.theme,
  }
}

export function getSnapshot(database: LedgerDatabase): LedgerSnapshot {
  return {
    accounts: listAccounts(database),
    transactions: listTransactions(database),
    settings: getSettings(database),
  }
}

export function createAccount(database: LedgerDatabase, input: AccountInput): Account {
  const nextOrder = database.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM accounts
  `).pluck().get() as number
  const result = database.prepare(`
    INSERT INTO accounts (name, type, currency, balance, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(input.name, input.type, input.currency, amountForStorage(input.balance), nextOrder)
  return getAccount(database, Number(result.lastInsertRowid))
}

export function getAccount(database: LedgerDatabase, id: number): Account {
  const row = database.prepare(`
    SELECT id, name, type, currency, balance, sort_order FROM accounts WHERE id = ?
  `).get(id) as AccountRow | undefined
  if (!row) throw createError({ statusCode: 404, message: '账户不存在' })
  return mapAccount(row)
}

export function updateAccount(
  database: LedgerDatabase,
  id: number,
  input: AccountInput,
): Account {
  const result = database.prepare(`
    UPDATE accounts
    SET name = ?, type = ?, currency = ?, balance = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(input.name, input.type, input.currency, amountForStorage(input.balance), id)
  if (result.changes === 0) throw createError({ statusCode: 404, message: '账户不存在' })
  return getAccount(database, id)
}

export function deleteAccount(database: LedgerDatabase, id: number): void {
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

  const update = database.prepare('UPDATE accounts SET sort_order = ? WHERE id = ?')
  database.transaction(() => ids.forEach((id, index) => update.run(index, id)))()
  return listAccounts(database)
}

export function createTransaction(
  database: LedgerDatabase,
  input: TransactionInput,
): { transaction: Transaction, account: Account } {
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

    const balance = new Decimal(account.balance)
    const nextBalance = input.type === 'income'
      ? balance.plus(input.amount)
      : balance.minus(input.amount)
    database.prepare(`
      UPDATE accounts SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(amountForStorage(nextBalance), account.id)

    const row = database.prepare(`
      SELECT id, account_id, date, type, amount, currency, category, note
      FROM transactions WHERE id = ?
    `).get(Number(result.lastInsertRowid)) as TransactionRow

    return { transaction: mapTransaction(row), account: getAccount(database, account.id) }
  })()
}

export function deleteTransaction(
  database: LedgerDatabase,
  id: number,
): { account: Account } {
  return database.transaction(() => {
    const row = database.prepare(`
      SELECT id, account_id, date, type, amount, currency, category, note
      FROM transactions WHERE id = ?
    `).get(id) as TransactionRow | undefined
    if (!row) throw createError({ statusCode: 404, message: '交易不存在' })

    const account = getAccount(database, row.account_id)
    const balance = new Decimal(account.balance)
    const nextBalance = row.type === 'income'
      ? balance.minus(row.amount)
      : balance.plus(row.amount)

    database.prepare(`
      UPDATE accounts SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(amountForStorage(nextBalance), account.id)
    database.prepare('DELETE FROM transactions WHERE id = ?').run(id)
    return { account: getAccount(database, account.id) }
  })()
}

export function updateSettings(database: LedgerDatabase, settings: Settings): Settings {
  database.prepare(`
    UPDATE settings SET base_currency = ?, masked = ?, theme = ? WHERE id = 1
  `).run(settings.baseCurrency, Number(settings.masked), settings.theme)
  return getSettings(database)
}

export function clearLedger(database: LedgerDatabase): LedgerSnapshot {
  database.transaction(() => {
    database.prepare('DELETE FROM transactions').run()
    database.prepare('DELETE FROM accounts').run()
    database.prepare(`
      UPDATE settings SET base_currency = 'CNY', masked = 0, theme = 'light' WHERE id = 1
    `).run()
  })()
  return getSnapshot(database)
}
