use crate::{
    models::CURRENT_SCHEMA_VERSION,
    validation::{decimal_from_storage, decimal_to_storage},
};
use rusqlite::{params, Connection};
use rust_decimal::Decimal;

pub(crate) const SCHEMA: &str = r#"
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
"#;

pub(crate) fn database_error(error: rusqlite::Error) -> String {
    format!("数据库操作失败：{error}")
}

pub(crate) fn schema_version(database: &Connection) -> Result<i64, String> {
    database
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(database_error)
}

pub(crate) fn migrate_to_v2(transaction: &rusqlite::Transaction<'_>) -> Result<(), String> {
    transaction
        .execute_batch(
            "ALTER TABLE accounts ADD COLUMN opening_balance TEXT NOT NULL DEFAULT '0';
             ALTER TABLE transactions ADD COLUMN transfer_id TEXT;
             CREATE INDEX idx_transactions_transfer_id ON transactions(transfer_id);",
        )
        .map_err(database_error)?;
    let accounts = {
        let mut statement = transaction
            .prepare("SELECT id, balance FROM accounts")
            .map_err(database_error)?;
        let collected = statement
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(database_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(database_error)?;
        collected
    };
    for (account_id, balance) in accounts {
        let net = {
            let mut statement = transaction
                .prepare("SELECT type, amount FROM transactions WHERE account_id = ?1")
                .map_err(database_error)?;
            let rows = statement
                .query_map([account_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(database_error)?;
            let mut net = Decimal::ZERO;
            for row in rows {
                let (record_type, amount) = row.map_err(database_error)?;
                let amount = decimal_from_storage(&amount)?;
                net = if record_type == "income" {
                    net + amount
                } else {
                    net - amount
                };
            }
            net
        };
        let opening = decimal_from_storage(&balance)? - net;
        transaction
            .execute(
                "UPDATE accounts SET opening_balance = ?1 WHERE id = ?2",
                params![decimal_to_storage(opening), account_id],
            )
            .map_err(database_error)?;
    }
    Ok(())
}

pub(crate) fn migrate_database(database: &mut Connection) -> Result<(), String> {
    let current_version = schema_version(database)?;
    if current_version > CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "数据库版本 {current_version} 高于当前程序支持的版本 {CURRENT_SCHEMA_VERSION}，请升级应用后再试"
        ));
    }

    for next_version in (current_version + 1)..=CURRENT_SCHEMA_VERSION {
        let transaction = database.transaction().map_err(database_error)?;
        match next_version {
            1 => transaction.execute_batch(SCHEMA).map_err(database_error)?,
            2 => migrate_to_v2(&transaction)?,
            3 => transaction
                .execute_batch(
                    "ALTER TABLE settings ADD COLUMN language TEXT NOT NULL DEFAULT 'zh-CN'
                     CHECK (language IN ('zh-CN', 'en'));",
                )
                .map_err(database_error)?,
            _ => return Err(format!("缺少数据库版本 {next_version} 的迁移脚本")),
        }
        transaction
            .pragma_update(None, "user_version", next_version)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }

    Ok(())
}
