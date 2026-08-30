import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { LEDGER_SCHEMA_VERSION } from '../../shared/types/ledger'

export type LedgerDatabase = Database.Database

const schema = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'credit', 'invest', 'debt', 'wallet', 'other')),
    currency TEXT NOT NULL CHECK (currency IN ('CNY', 'HKD', 'USD', 'EUR', 'USDT', 'BTC')),
    balance TEXT NOT NULL DEFAULT '0',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount TEXT NOT NULL,
    currency TEXT NOT NULL CHECK (currency IN ('CNY', 'HKD', 'USD', 'EUR', 'USDT', 'BTC')),
    category TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    base_currency TEXT NOT NULL DEFAULT 'CNY',
    masked INTEGER NOT NULL DEFAULT 0,
    theme TEXT NOT NULL DEFAULT 'light'
  );

  INSERT OR IGNORE INTO settings (id, base_currency, masked, theme)
  VALUES (1, 'CNY', 0, 'light');
`

interface Migration {
  version: number
  sql: string
}

const migrations: Migration[] = [
  { version: 1, sql: schema },
]

export function getLedgerSchemaVersion(database: LedgerDatabase): number {
  return database.pragma('user_version', { simple: true }) as number
}

export function migrateLedgerDatabase(database: LedgerDatabase): void {
  const currentVersion = getLedgerSchemaVersion(database)
  if (currentVersion > LEDGER_SCHEMA_VERSION) {
    throw new Error(
      `数据库版本 ${currentVersion} 高于当前程序支持的版本 ${LEDGER_SCHEMA_VERSION}，请升级应用后再试`,
    )
  }

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue

    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(migration.sql)
      database.pragma(`user_version = ${migration.version}`)
      database.exec('COMMIT')
    }
    catch (error) {
      if (database.inTransaction) database.exec('ROLLBACK')
      throw error
    }
  }
}

export function openLedgerDatabase(filename: string): LedgerDatabase {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true })

  const database = new Database(filename)
  try {
    database.pragma('journal_mode = WAL')
    database.pragma('foreign_keys = ON')
    migrateLedgerDatabase(database)
    return database
  }
  catch (error) {
    database.close()
    throw error
  }
}

const globalDatabase = globalThis as typeof globalThis & {
  __accountingToolDatabase?: LedgerDatabase
}

export function useLedgerDatabase(): LedgerDatabase {
  if (!globalDatabase.__accountingToolDatabase) {
    const filename = process.env.NUXT_DATABASE_PATH
      ? resolve(process.env.NUXT_DATABASE_PATH)
      : resolve(process.cwd(), 'data', 'accounting.sqlite')
    globalDatabase.__accountingToolDatabase = openLedgerDatabase(filename)
  }

  return globalDatabase.__accountingToolDatabase
}
