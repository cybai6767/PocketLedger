use rusqlite::{params, Connection, OptionalExtension};
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::Mutex;
use tauri::{Manager, State};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

const CURRENT_SCHEMA_VERSION: i64 = 2;
const BACKUP_FORMAT_VERSION: i64 = 1;
const BACKUP_FORMAT: &str = "accounting-tool-backup";

const SCHEMA: &str = r#"
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

const ACCOUNT_TYPES: &[&str] = &[
    "cash", "bank", "credit", "invest", "debt", "wallet", "other",
];
const CURRENCIES: &[&str] = &["CNY", "HKD", "USD", "EUR", "USDT", "BTC"];
const TX_TYPES: &[&str] = &["income", "expense"];

struct AppState {
    database: Mutex<Connection>,
    backup_dir: PathBuf,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AccountInput {
    name: String,
    r#type: String,
    currency: String,
    balance: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Account {
    id: i64,
    name: String,
    r#type: String,
    currency: String,
    balance: f64,
    sort_order: i64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TransactionInput {
    date: String,
    r#type: String,
    account_id: i64,
    amount: f64,
    category: String,
    note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferInput {
    date: String,
    from_account_id: i64,
    to_account_id: i64,
    amount: f64,
    note: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LedgerTransaction {
    id: i64,
    date: String,
    r#type: String,
    account_id: i64,
    amount: f64,
    currency: String,
    category: String,
    note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    transfer_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    base_currency: String,
    masked: bool,
    theme: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LedgerSnapshot {
    accounts: Vec<Account>,
    transactions: Vec<LedgerTransaction>,
    settings: Settings,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LedgerBackup {
    format: String,
    format_version: i64,
    schema_version: i64,
    exported_at: String,
    data: LedgerSnapshot,
}

#[derive(Serialize)]
struct OkResponse {
    ok: bool,
}

#[derive(Serialize)]
struct TransactionResult {
    transaction: LedgerTransaction,
    account: Account,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TransactionMutationResult {
    transactions: Vec<LedgerTransaction>,
    accounts: Vec<Account>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BalanceIssue {
    account_id: i64,
    account_name: String,
    stored_balance: f64,
    expected_balance: f64,
}

#[derive(Serialize)]
struct BalanceCheck {
    ok: bool,
    repaired: bool,
    issues: Vec<BalanceIssue>,
}

type RawAccount = (i64, String, String, String, String, i64);
type RawTransaction = (
    i64,
    i64,
    String,
    String,
    String,
    String,
    String,
    Option<String>,
    Option<String>,
);

fn database_error(error: rusqlite::Error) -> String {
    format!("数据库操作失败：{error}")
}

fn schema_version(database: &Connection) -> Result<i64, String> {
    database
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(database_error)
}

fn migrate_to_v2(transaction: &rusqlite::Transaction<'_>) -> Result<(), String> {
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

fn migrate_database(database: &mut Connection) -> Result<(), String> {
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
            _ => return Err(format!("缺少数据库版本 {next_version} 的迁移脚本")),
        }
        transaction
            .pragma_update(None, "user_version", next_version)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }

    Ok(())
}

fn decimal_from_number(value: f64, field: &str) -> Result<Decimal, String> {
    if !value.is_finite() {
        return Err(format!("{field}必须是有效数字"));
    }
    Decimal::from_str(&value.to_string())
        .map(|value| value.round_dp(8))
        .map_err(|_| format!("{field}必须是有效数字"))
}

fn decimal_from_storage(value: &str) -> Result<Decimal, String> {
    Decimal::from_str(value).map_err(|_| "数据库中的金额格式无效".to_string())
}

fn decimal_to_number(value: Decimal) -> Result<f64, String> {
    value
        .to_f64()
        .ok_or_else(|| "金额超出可显示范围".to_string())
}

fn decimal_to_storage(value: Decimal) -> String {
    value.round_dp(8).normalize().to_string()
}

fn validate_account(input: &AccountInput) -> Result<(), String> {
    if input.name.trim().is_empty() {
        return Err("账户名不能为空".to_string());
    }
    if input.name.chars().count() > 80 {
        return Err("账户名不能超过 80 个字符".to_string());
    }
    if !ACCOUNT_TYPES.contains(&input.r#type.as_str()) {
        return Err("账户类型无效".to_string());
    }
    if !CURRENCIES.contains(&input.currency.as_str()) {
        return Err("币种无效".to_string());
    }
    let balance = decimal_from_number(input.balance, "余额")?;
    let limit = Decimal::from(1_000_000_000_000_i64);
    if balance.abs() > limit {
        return Err("余额超出允许范围".to_string());
    }
    Ok(())
}

fn validate_transaction(input: &TransactionInput) -> Result<(), String> {
    if input.account_id <= 0 {
        return Err("必须指定有效账户".to_string());
    }
    if !TX_TYPES.contains(&input.r#type.as_str()) {
        return Err("交易类型无效".to_string());
    }
    if !is_date(&input.date) {
        return Err("日期格式必须为 YYYY-MM-DD".to_string());
    }
    let amount = decimal_from_number(input.amount, "金额")?;
    if amount <= Decimal::ZERO {
        return Err("金额必须大于 0".to_string());
    }
    if amount > Decimal::from(1_000_000_000_000_i64) {
        return Err("金额超出允许范围".to_string());
    }
    if input.category.trim().is_empty() {
        return Err("分类不能为空".to_string());
    }
    if input.category.chars().count() > 40 {
        return Err("分类不能超过 40 个字符".to_string());
    }
    if input.note.as_deref().unwrap_or_default().chars().count() > 200 {
        return Err("备注不能超过 200 个字符".to_string());
    }
    Ok(())
}

fn validate_transfer(input: &TransferInput) -> Result<(), String> {
    if input.from_account_id <= 0 || input.to_account_id <= 0 {
        return Err("必须指定转出和转入账户".to_string());
    }
    if input.from_account_id == input.to_account_id {
        return Err("转出账户和转入账户不能相同".to_string());
    }
    if !is_date(&input.date) {
        return Err("日期格式必须为 YYYY-MM-DD".to_string());
    }
    let amount = decimal_from_number(input.amount, "金额")?;
    if amount <= Decimal::ZERO {
        return Err("金额必须大于 0".to_string());
    }
    if amount > Decimal::from(1_000_000_000_000_i64) {
        return Err("金额超出允许范围".to_string());
    }
    if input.note.as_deref().unwrap_or_default().chars().count() > 200 {
        return Err("备注不能超过 200 个字符".to_string());
    }
    Ok(())
}

fn validate_settings(settings: &Settings) -> Result<(), String> {
    if !CURRENCIES.contains(&settings.base_currency.as_str()) {
        return Err("基准货币无效".to_string());
    }
    if settings.theme != "light" && settings.theme != "dark" {
        return Err("主题无效".to_string());
    }
    Ok(())
}

fn validate_backup(backup: &LedgerBackup) -> Result<(), String> {
    if backup.format != BACKUP_FORMAT {
        return Err("不是我的记账本完整备份".to_string());
    }
    if backup.format_version != BACKUP_FORMAT_VERSION {
        return Err(format!("备份格式版本 {} 不受支持", backup.format_version));
    }
    if backup.schema_version > CURRENT_SCHEMA_VERSION {
        return Err("备份数据库版本高于当前程序支持的版本，请升级应用后再恢复".to_string());
    }
    if backup.schema_version < 1 || !backup.exported_at.contains('T') {
        return Err("备份元数据无效".to_string());
    }
    if backup.data.accounts.len() > 10_000 || backup.data.transactions.len() > 1_000_000 {
        return Err("备份包含的数据量超过允许范围".to_string());
    }
    validate_settings(&backup.data.settings)?;

    let mut account_ids = HashSet::new();
    for account in &backup.data.accounts {
        if account.id <= 0 || account.sort_order < 0 || account.sort_order > 100_000 {
            return Err("备份包含无效账户 ID 或排序".to_string());
        }
        if !account_ids.insert(account.id) {
            return Err(format!("账户 ID {} 重复", account.id));
        }
        validate_account(&AccountInput {
            name: account.name.clone(),
            r#type: account.r#type.clone(),
            currency: account.currency.clone(),
            balance: account.balance,
        })?;
    }

    let mut transaction_ids = HashSet::new();
    let mut transfers: HashMap<&str, Vec<&LedgerTransaction>> = HashMap::new();
    for record in &backup.data.transactions {
        if record.id <= 0 || !transaction_ids.insert(record.id) {
            return Err(format!("流水 ID {} 无效或重复", record.id));
        }
        let account = backup
            .data
            .accounts
            .iter()
            .find(|account| account.id == record.account_id)
            .ok_or_else(|| format!("流水 {} 引用了不存在的账户", record.id))?;
        if account.currency != record.currency {
            return Err(format!("流水 {} 的币种与账户不一致", record.id));
        }
        validate_transaction(&TransactionInput {
            date: record.date.clone(),
            r#type: record.r#type.clone(),
            account_id: record.account_id,
            amount: record.amount,
            category: record.category.clone(),
            note: record.note.clone(),
        })?;
        if let Some(transfer_id) = record.transfer_id.as_deref() {
            if transfer_id.len() != 32
                || !transfer_id.chars().all(|value| value.is_ascii_hexdigit())
            {
                return Err("备份包含无效转账编号".to_string());
            }
            transfers.entry(transfer_id).or_default().push(record);
        }
    }
    for (transfer_id, records) in transfers {
        let valid = records.len() == 2
            && records[0].r#type != records[1].r#type
            && records[0].account_id != records[1].account_id
            && records[0].amount == records[1].amount
            && records[0].currency == records[1].currency;
        if !valid {
            return Err(format!("转账 {transfer_id} 的两条流水不完整或不一致"));
        }
    }
    Ok(())
}

fn is_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(index, byte)| index != 4 && index != 7 && !byte.is_ascii_digit())
    {
        return false;
    }
    let Ok(year) = value[0..4].parse::<u16>() else {
        return false;
    };
    let Ok(month @ 1..=12) = value[5..7].parse::<u8>() else {
        return false;
    };
    let Ok(day) = value[8..10].parse::<u8>() else {
        return false;
    };
    let leap_year = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days_in_month = match month {
        2 if leap_year => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    (1..=days_in_month).contains(&day)
}

fn map_account(raw: RawAccount) -> Result<Account, String> {
    Ok(Account {
        id: raw.0,
        name: raw.1,
        r#type: raw.2,
        currency: raw.3,
        balance: decimal_to_number(decimal_from_storage(&raw.4)?)?,
        sort_order: raw.5,
    })
}

fn map_transaction(raw: RawTransaction) -> Result<LedgerTransaction, String> {
    Ok(LedgerTransaction {
        id: raw.0,
        account_id: raw.1,
        date: raw.2,
        r#type: raw.3,
        amount: decimal_to_number(decimal_from_storage(&raw.4)?)?,
        currency: raw.5,
        category: raw.6,
        note: raw.7,
        transfer_id: raw.8,
    })
}

fn list_accounts(database: &Connection) -> Result<Vec<Account>, String> {
    let mut statement = database
        .prepare(
            "SELECT id, name, type, currency, balance, sort_order
             FROM accounts ORDER BY sort_order ASC, id ASC",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })
        .map_err(database_error)?;

    rows.map(|row| row.map_err(database_error).and_then(map_account))
        .collect()
}

fn get_account(database: &Connection, id: i64) -> Result<Account, String> {
    let raw = database
        .query_row(
            "SELECT id, name, type, currency, balance, sort_order FROM accounts WHERE id = ?1",
            [id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| "账户不存在".to_string())?;
    map_account(raw)
}

fn list_transactions(database: &Connection) -> Result<Vec<LedgerTransaction>, String> {
    let mut statement = database
        .prepare(
            "SELECT id, account_id, date, type, amount, currency, category, note, transfer_id
             FROM transactions ORDER BY date DESC, id DESC",
        )
        .map_err(database_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
            ))
        })
        .map_err(database_error)?;

    rows.map(|row| row.map_err(database_error).and_then(map_transaction))
        .collect()
}

fn get_transaction(database: &Connection, id: i64) -> Result<LedgerTransaction, String> {
    let raw = database
        .query_row(
            "SELECT id, account_id, date, type, amount, currency, category, note, transfer_id
             FROM transactions WHERE id = ?1",
            [id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                ))
            },
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| "交易不存在".to_string())?;
    map_transaction(raw)
}

fn get_settings(database: &Connection) -> Result<Settings, String> {
    database
        .query_row(
            "SELECT base_currency, masked, theme FROM settings WHERE id = 1",
            [],
            |row| {
                Ok(Settings {
                    base_currency: row.get(0)?,
                    masked: row.get::<_, i64>(1)? != 0,
                    theme: row.get(2)?,
                })
            },
        )
        .map_err(database_error)
}

fn snapshot(database: &Connection) -> Result<LedgerSnapshot, String> {
    Ok(LedgerSnapshot {
        accounts: list_accounts(database)?,
        transactions: list_transactions(database)?,
        settings: get_settings(database)?,
    })
}

fn save_automatic_backup(database: &Connection, directory: &Path) -> Result<(), String> {
    std::fs::create_dir_all(directory).map_err(|error| format!("无法创建自动备份目录：{error}"))?;
    let now = OffsetDateTime::now_utc();
    let exported_at = now
        .format(&Rfc3339)
        .map_err(|error| format!("无法生成备份时间：{error}"))?;
    let backup = LedgerBackup {
        format: BACKUP_FORMAT.to_string(),
        format_version: BACKUP_FORMAT_VERSION,
        schema_version: CURRENT_SCHEMA_VERSION,
        exported_at,
        data: snapshot(database)?,
    };
    let filename = format!("automatic-{}.json", now.unix_timestamp_nanos());
    let contents = serde_json::to_string_pretty(&backup)
        .map_err(|error| format!("无法生成自动备份：{error}"))?;
    std::fs::write(directory.join(filename), format!("{contents}\n"))
        .map_err(|error| format!("无法写入自动备份：{error}"))?;
    let mut files = std::fs::read_dir(directory)
        .map_err(|error| format!("无法读取自动备份目录：{error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("automatic-") && name.ends_with(".json"))
        })
        .collect::<Vec<_>>();
    files.sort_by(|left, right| right.file_name().cmp(&left.file_name()));
    for expired in files.into_iter().skip(7) {
        std::fs::remove_file(expired).map_err(|error| format!("无法清理旧自动备份：{error}"))?;
    }
    Ok(())
}

fn read_latest_automatic_backup(directory: &Path) -> Result<Option<LedgerBackup>, String> {
    if !directory.exists() {
        return Ok(None);
    }
    let mut files = std::fs::read_dir(directory)
        .map_err(|error| format!("无法读取自动备份目录：{error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("automatic-") && name.ends_with(".json"))
        })
        .collect::<Vec<_>>();
    files.sort_by(|left, right| right.file_name().cmp(&left.file_name()));
    let Some(latest) = files.first() else {
        return Ok(None);
    };
    let contents = std::fs::read_to_string(latest)
        .map_err(|error| format!("无法读取最近自动备份：{error}"))?;
    let backup: LedgerBackup = serde_json::from_str(&contents)
        .map_err(|error| format!("最近自动备份内容无效：{error}"))?;
    validate_backup(&backup)?;
    Ok(Some(backup))
}

fn lock_database<'a>(
    state: &'a State<'_, AppState>,
) -> Result<std::sync::MutexGuard<'a, Connection>, String> {
    state
        .database
        .lock()
        .map_err(|_| "无法访问本机数据库".to_string())
}

fn transaction_net(database: &Connection, account_id: i64) -> Result<Decimal, String> {
    let mut statement = database
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
    Ok(net)
}

fn expected_balance(database: &Connection, account_id: i64) -> Result<Decimal, String> {
    let opening: String = database
        .query_row(
            "SELECT opening_balance FROM accounts WHERE id = ?1",
            [account_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)?
        .ok_or_else(|| "账户不存在".to_string())?;
    Ok(decimal_from_storage(&opening)? + transaction_net(database, account_id)?)
}

fn recalculate_account(database: &Connection, account_id: i64) -> Result<Account, String> {
    let balance = expected_balance(database, account_id)?;
    database
        .execute(
            "UPDATE accounts SET balance = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![decimal_to_storage(balance), account_id],
        )
        .map_err(database_error)?;
    get_account(database, account_id)
}

fn create_account_record(database: &Connection, input: &AccountInput) -> Result<Account, String> {
    validate_account(input)?;
    let next_order: i64 = database
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM accounts",
            [],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    database
        .execute(
            "INSERT INTO accounts (name, type, currency, balance, opening_balance, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?4, ?5)",
            params![
                input.name.trim(),
                input.r#type,
                input.currency,
                decimal_to_storage(decimal_from_number(input.balance, "余额")?),
                next_order
            ],
        )
        .map_err(database_error)?;
    get_account(database, database.last_insert_rowid())
}

fn update_account_record(
    database: &Connection,
    id: i64,
    input: &AccountInput,
) -> Result<Account, String> {
    if id <= 0 {
        return Err("ID 无效".to_string());
    }
    validate_account(input)?;
    let transaction = database.unchecked_transaction().map_err(database_error)?;
    let current = get_account(&transaction, id)?;
    let transaction_count: i64 = transaction
        .query_row(
            "SELECT COUNT(*) FROM transactions WHERE account_id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if transaction_count > 0 && current.currency != input.currency {
        return Err("该账户已有流水，不能修改币种".to_string());
    }
    let opening = decimal_from_number(input.balance, "余额")? - transaction_net(&transaction, id)?;
    let changes = transaction
        .execute(
            "UPDATE accounts
             SET name = ?1, type = ?2, currency = ?3, opening_balance = ?4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?5",
            params![
                input.name.trim(),
                input.r#type,
                input.currency,
                decimal_to_storage(opening),
                id
            ],
        )
        .map_err(database_error)?;
    if changes == 0 {
        return Err("账户不存在".to_string());
    }
    recalculate_account(&transaction, id)?;
    transaction.commit().map_err(database_error)?;
    get_account(database, id)
}

fn delete_account_record(database: &Connection, id: i64) -> Result<(), String> {
    if id <= 0 {
        return Err("ID 无效".to_string());
    }
    let transaction_count: i64 = database
        .query_row(
            "SELECT COUNT(*) FROM transactions WHERE account_id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if transaction_count > 0 {
        return Err(format!(
            "该账户还有 {transaction_count} 条流水，请先处理这些流水再删除账户"
        ));
    }
    let changes = database
        .execute("DELETE FROM accounts WHERE id = ?1", [id])
        .map_err(database_error)?;
    if changes == 0 {
        return Err("账户不存在".to_string());
    }
    Ok(())
}

fn reorder_account_records(database: &mut Connection, ids: &[i64]) -> Result<Vec<Account>, String> {
    let mut current_ids: Vec<i64> = list_accounts(database)?
        .into_iter()
        .map(|account| account.id)
        .collect();
    let mut requested_ids = ids.to_vec();
    current_ids.sort_unstable();
    requested_ids.sort_unstable();
    requested_ids.dedup();
    if current_ids != requested_ids || current_ids.len() != ids.len() {
        return Err("账户排序数据不完整".to_string());
    }

    let transaction = database.transaction().map_err(database_error)?;
    for (index, id) in ids.iter().enumerate() {
        transaction
            .execute(
                "UPDATE accounts SET sort_order = ?1 WHERE id = ?2",
                params![index as i64, id],
            )
            .map_err(database_error)?;
    }
    transaction.commit().map_err(database_error)?;
    list_accounts(database)
}

fn create_transaction_record(
    database: &mut Connection,
    input: &TransactionInput,
) -> Result<TransactionResult, String> {
    validate_transaction(input)?;
    let transaction = database.transaction().map_err(database_error)?;
    let account = get_account(&transaction, input.account_id)?;
    let amount = decimal_from_number(input.amount, "金额")?;

    transaction
        .execute(
            "INSERT INTO transactions
             (account_id, date, type, amount, currency, category, note)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                input.account_id,
                input.date,
                input.r#type,
                decimal_to_storage(amount),
                account.currency,
                input.category.trim(),
                input
                    .note
                    .as_deref()
                    .map(str::trim)
                    .filter(|note| !note.is_empty())
            ],
        )
        .map_err(database_error)?;
    let transaction_id = transaction.last_insert_rowid();
    let created = get_transaction(&transaction, transaction_id)?;
    recalculate_account(&transaction, account.id)?;
    transaction.commit().map_err(database_error)?;

    Ok(TransactionResult {
        transaction: created,
        account: get_account(database, account.id)?,
    })
}

fn update_transaction_record(
    database: &mut Connection,
    id: i64,
    input: &TransactionInput,
) -> Result<TransactionMutationResult, String> {
    if id <= 0 {
        return Err("ID 无效".to_string());
    }
    validate_transaction(input)?;
    let transaction = database.transaction().map_err(database_error)?;
    let previous = get_transaction(&transaction, id)?;
    if previous.transfer_id.is_some() {
        return Err("转账由两条关联流水组成，请删除后重新转账".to_string());
    }
    let next_account = get_account(&transaction, input.account_id)?;
    transaction
        .execute(
            "UPDATE transactions
             SET account_id = ?1, date = ?2, type = ?3, amount = ?4,
                 currency = ?5, category = ?6, note = ?7
             WHERE id = ?8",
            params![
                input.account_id,
                input.date,
                input.r#type,
                decimal_to_storage(decimal_from_number(input.amount, "金额")?),
                next_account.currency,
                input.category.trim(),
                input
                    .note
                    .as_deref()
                    .map(str::trim)
                    .filter(|note| !note.is_empty()),
                id
            ],
        )
        .map_err(database_error)?;
    let mut account_ids = vec![previous.account_id];
    if input.account_id != previous.account_id {
        account_ids.push(input.account_id);
    }
    let mut accounts = Vec::new();
    for account_id in account_ids {
        accounts.push(recalculate_account(&transaction, account_id)?);
    }
    let updated = get_transaction(&transaction, id)?;
    transaction.commit().map_err(database_error)?;
    Ok(TransactionMutationResult {
        transactions: vec![updated],
        accounts,
    })
}

fn create_transfer_record(
    database: &mut Connection,
    input: &TransferInput,
) -> Result<TransactionMutationResult, String> {
    validate_transfer(input)?;
    let transaction = database.transaction().map_err(database_error)?;
    let from = get_account(&transaction, input.from_account_id)?;
    let to = get_account(&transaction, input.to_account_id)?;
    if from.currency != to.currency {
        return Err("第一版转账只支持币种相同的两个账户".to_string());
    }
    let transfer_id: String = transaction
        .query_row("SELECT lower(hex(randomblob(16)))", [], |row| row.get(0))
        .map_err(database_error)?;
    let amount = decimal_to_storage(decimal_from_number(input.amount, "金额")?);
    let note = input
        .note
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    transaction
        .execute(
            "INSERT INTO transactions
             (account_id, date, type, amount, currency, category, note, transfer_id)
             VALUES (?1, ?2, 'expense', ?3, ?4, '转账', ?5, ?6)",
            params![
                from.id,
                input.date,
                amount,
                from.currency,
                note,
                transfer_id
            ],
        )
        .map_err(database_error)?;
    let expense_id = transaction.last_insert_rowid();
    transaction
        .execute(
            "INSERT INTO transactions
             (account_id, date, type, amount, currency, category, note, transfer_id)
             VALUES (?1, ?2, 'income', ?3, ?4, '转账', ?5, ?6)",
            params![to.id, input.date, amount, to.currency, note, transfer_id],
        )
        .map_err(database_error)?;
    let income_id = transaction.last_insert_rowid();
    let records = vec![
        get_transaction(&transaction, expense_id)?,
        get_transaction(&transaction, income_id)?,
    ];
    let accounts = vec![
        recalculate_account(&transaction, from.id)?,
        recalculate_account(&transaction, to.id)?,
    ];
    transaction.commit().map_err(database_error)?;
    Ok(TransactionMutationResult {
        transactions: records,
        accounts,
    })
}

fn delete_transaction_record(
    database: &mut Connection,
    id: i64,
) -> Result<TransactionMutationResult, String> {
    if id <= 0 {
        return Err("ID 无效".to_string());
    }
    let transaction = database.transaction().map_err(database_error)?;
    let record = get_transaction(&transaction, id)?;
    let records = if let Some(transfer_id) = record.transfer_id.as_deref() {
        let mut statement = transaction
            .prepare(
                "SELECT id, account_id, date, type, amount, currency, category, note, transfer_id
                 FROM transactions WHERE transfer_id = ?1",
            )
            .map_err(database_error)?;
        let rows = statement
            .query_map([transfer_id], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                ))
            })
            .map_err(database_error)?;
        rows.map(|row| row.map_err(database_error).and_then(map_transaction))
            .collect::<Result<Vec<_>, _>>()?
    } else {
        vec![record]
    };
    if let Some(transfer_id) = records[0].transfer_id.as_deref() {
        transaction
            .execute(
                "DELETE FROM transactions WHERE transfer_id = ?1",
                [transfer_id],
            )
            .map_err(database_error)?;
    } else {
        transaction
            .execute("DELETE FROM transactions WHERE id = ?1", [id])
            .map_err(database_error)?;
    }
    let mut account_ids = HashSet::new();
    let mut accounts = Vec::new();
    for record in &records {
        if account_ids.insert(record.account_id) {
            accounts.push(recalculate_account(&transaction, record.account_id)?);
        }
    }
    transaction.commit().map_err(database_error)?;
    Ok(TransactionMutationResult {
        transactions: records,
        accounts,
    })
}

fn check_balances_record(database: &Connection, repair: bool) -> Result<BalanceCheck, String> {
    let mut issues = Vec::new();
    for account in list_accounts(database)? {
        let expected = expected_balance(database, account.id)?;
        let stored = decimal_from_number(account.balance, "余额")?;
        if stored != expected {
            issues.push(BalanceIssue {
                account_id: account.id,
                account_name: account.name,
                stored_balance: account.balance,
                expected_balance: decimal_to_number(expected)?,
            });
        }
    }
    if repair {
        let transaction = database.unchecked_transaction().map_err(database_error)?;
        for issue in &issues {
            recalculate_account(&transaction, issue.account_id)?;
        }
        transaction.commit().map_err(database_error)?;
    }
    Ok(BalanceCheck {
        ok: issues.is_empty(),
        repaired: repair && !issues.is_empty(),
        issues,
    })
}

fn update_settings_record(database: &Connection, settings: &Settings) -> Result<Settings, String> {
    validate_settings(settings)?;
    database
        .execute(
            "UPDATE settings SET base_currency = ?1, masked = ?2, theme = ?3 WHERE id = 1",
            params![
                settings.base_currency,
                settings.masked as i64,
                settings.theme
            ],
        )
        .map_err(database_error)?;
    get_settings(database)
}

fn restore_ledger_record(
    database: &mut Connection,
    backup: &LedgerBackup,
) -> Result<LedgerSnapshot, String> {
    validate_backup(backup)?;
    let transaction = database.transaction().map_err(database_error)?;
    transaction
        .execute("DELETE FROM transactions", [])
        .map_err(database_error)?;
    transaction
        .execute("DELETE FROM accounts", [])
        .map_err(database_error)?;

    for account in &backup.data.accounts {
        let mut net = Decimal::ZERO;
        for record in backup
            .data
            .transactions
            .iter()
            .filter(|record| record.account_id == account.id)
        {
            let amount = decimal_from_number(record.amount, "金额")?;
            net = if record.r#type == "income" {
                net + amount
            } else {
                net - amount
            };
        }
        let balance = decimal_from_number(account.balance, "余额")?;
        transaction
            .execute(
                "INSERT INTO accounts
                 (id, name, type, currency, balance, opening_balance, sort_order)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    account.id,
                    account.name.trim(),
                    account.r#type,
                    account.currency,
                    decimal_to_storage(balance),
                    decimal_to_storage(balance - net),
                    account.sort_order,
                ],
            )
            .map_err(database_error)?;
    }
    for record in &backup.data.transactions {
        transaction
            .execute(
                "INSERT INTO transactions
                 (id, account_id, date, type, amount, currency, category, note, transfer_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    record.id,
                    record.account_id,
                    record.date,
                    record.r#type,
                    decimal_to_storage(decimal_from_number(record.amount, "金额")?),
                    record.currency,
                    record.category.trim(),
                    record
                        .note
                        .as_deref()
                        .map(str::trim)
                        .filter(|note| !note.is_empty()),
                    record.transfer_id,
                ],
            )
            .map_err(database_error)?;
    }
    transaction
        .execute(
            "UPDATE settings SET base_currency = ?1, masked = ?2, theme = ?3 WHERE id = 1",
            params![
                backup.data.settings.base_currency,
                backup.data.settings.masked as i64,
                backup.data.settings.theme
            ],
        )
        .map_err(database_error)?;
    transaction
        .execute(
            "DELETE FROM sqlite_sequence WHERE name IN ('accounts', 'transactions')",
            [],
        )
        .map_err(database_error)?;
    if let Some(max_id) = backup.data.accounts.iter().map(|item| item.id).max() {
        transaction
            .execute(
                "INSERT INTO sqlite_sequence(name, seq) VALUES ('accounts', ?1)",
                [max_id],
            )
            .map_err(database_error)?;
    }
    if let Some(max_id) = backup.data.transactions.iter().map(|item| item.id).max() {
        transaction
            .execute(
                "INSERT INTO sqlite_sequence(name, seq) VALUES ('transactions', ?1)",
                [max_id],
            )
            .map_err(database_error)?;
    }
    transaction.commit().map_err(database_error)?;
    snapshot(database)
}

#[tauri::command]
fn get_snapshot(state: State<'_, AppState>) -> Result<LedgerSnapshot, String> {
    let database = lock_database(&state)?;
    snapshot(&database)
}

#[tauri::command]
fn get_latest_automatic_backup(state: State<'_, AppState>) -> Result<Option<LedgerBackup>, String> {
    read_latest_automatic_backup(&state.backup_dir)
}

#[tauri::command]
fn create_account(input: AccountInput, state: State<'_, AppState>) -> Result<Account, String> {
    let database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    create_account_record(&database, &input)
}

#[tauri::command]
fn update_account(
    id: i64,
    input: AccountInput,
    state: State<'_, AppState>,
) -> Result<Account, String> {
    let database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    update_account_record(&database, id, &input)
}

#[tauri::command]
fn delete_account(id: i64, state: State<'_, AppState>) -> Result<OkResponse, String> {
    let database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    delete_account_record(&database, id)?;
    Ok(OkResponse { ok: true })
}

#[tauri::command]
fn reorder_accounts(ids: Vec<i64>, state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    let mut database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    reorder_account_records(&mut database, &ids)
}

#[tauri::command]
fn create_transaction(
    input: TransactionInput,
    state: State<'_, AppState>,
) -> Result<TransactionResult, String> {
    let mut database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    create_transaction_record(&mut database, &input)
}

#[tauri::command]
fn update_transaction(
    id: i64,
    input: TransactionInput,
    state: State<'_, AppState>,
) -> Result<TransactionMutationResult, String> {
    let mut database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    update_transaction_record(&mut database, id, &input)
}

#[tauri::command]
fn create_transfer(
    input: TransferInput,
    state: State<'_, AppState>,
) -> Result<TransactionMutationResult, String> {
    let mut database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    create_transfer_record(&mut database, &input)
}

#[tauri::command]
fn delete_transaction(
    id: i64,
    state: State<'_, AppState>,
) -> Result<TransactionMutationResult, String> {
    let mut database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    delete_transaction_record(&mut database, id)
}

#[tauri::command]
fn check_balances(state: State<'_, AppState>) -> Result<BalanceCheck, String> {
    let database = lock_database(&state)?;
    check_balances_record(&database, false)
}

#[tauri::command]
fn repair_balances(state: State<'_, AppState>) -> Result<BalanceCheck, String> {
    let database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    check_balances_record(&database, true)
}

#[tauri::command]
fn update_settings(settings: Settings, state: State<'_, AppState>) -> Result<Settings, String> {
    let database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    update_settings_record(&database, &settings)
}

#[tauri::command]
fn clear_ledger(state: State<'_, AppState>) -> Result<LedgerSnapshot, String> {
    let mut database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    let transaction = database.transaction().map_err(database_error)?;
    transaction
        .execute("DELETE FROM transactions", [])
        .map_err(database_error)?;
    transaction
        .execute("DELETE FROM accounts", [])
        .map_err(database_error)?;
    transaction
        .execute(
            "UPDATE settings SET base_currency = 'CNY', masked = 0, theme = 'light' WHERE id = 1",
            [],
        )
        .map_err(database_error)?;
    transaction.commit().map_err(database_error)?;
    snapshot(&database)
}

#[tauri::command]
fn restore_ledger(
    backup: LedgerBackup,
    state: State<'_, AppState>,
) -> Result<LedgerSnapshot, String> {
    let mut database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    restore_ledger_record(&mut database, &backup)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let mut database = Connection::open(data_dir.join("accounting.sqlite"))?;
            database.pragma_update(None, "journal_mode", "WAL")?;
            database.pragma_update(None, "foreign_keys", "ON")?;
            migrate_database(&mut database).map_err(std::io::Error::other)?;
            app.manage(AppState {
                database: Mutex::new(database),
                backup_dir: data_dir.join("automatic-backups"),
            });

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            get_latest_automatic_backup,
            create_account,
            update_account,
            delete_account,
            reorder_accounts,
            create_transaction,
            update_transaction,
            create_transfer,
            delete_transaction,
            check_balances,
            repair_balances,
            update_settings,
            clear_ledger,
            restore_ledger,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        check_balances_record, create_account_record, create_transaction_record,
        create_transfer_record, delete_account_record, delete_transaction_record, is_date,
        migrate_database, read_latest_automatic_backup, reorder_account_records,
        restore_ledger_record, save_automatic_backup, schema_version, snapshot,
        update_account_record, update_settings_record, update_transaction_record, Account,
        AccountInput, Connection, LedgerBackup, LedgerSnapshot, LedgerTransaction, Settings,
        TransactionInput, TransferInput, BACKUP_FORMAT, BACKUP_FORMAT_VERSION,
        CURRENT_SCHEMA_VERSION, SCHEMA,
    };
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct UpdateAccountFixture {
        id: i64,
        input: AccountInput,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BackendConsistencyFixture {
        schema_version: i64,
        accounts: Vec<AccountInput>,
        reorder: Vec<i64>,
        update_account: UpdateAccountFixture,
        transactions: Vec<TransactionInput>,
        delete_transaction_id: i64,
        settings: Settings,
        expected: serde_json::Value,
    }

    #[test]
    fn validates_calendar_dates() {
        assert!(is_date("2024-02-29"));
        assert!(is_date("2026-08-23"));
        assert!(!is_date("2025-02-29"));
        assert!(!is_date("2026-04-31"));
        assert!(!is_date("2026-13-01"));
        assert!(!is_date("２０２６-08-23"));
    }

    #[test]
    fn migrates_legacy_database_without_losing_data() {
        let mut database = Connection::open_in_memory().expect("open database");
        database
            .execute_batch(SCHEMA)
            .expect("create legacy schema");
        database
            .execute(
                "INSERT INTO accounts (name, type, currency, balance, sort_order) VALUES (?1, 'cash', 'CNY', '100', 0)",
                ["迁移前账户"],
            )
            .expect("insert legacy account");

        assert_eq!(schema_version(&database).expect("read old version"), 0);
        migrate_database(&mut database).expect("migrate database");
        assert_eq!(
            schema_version(&database).expect("read migrated version"),
            CURRENT_SCHEMA_VERSION
        );
        let account_name: String = database
            .query_row("SELECT name FROM accounts WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("read preserved account");
        assert_eq!(account_name, "迁移前账户");
    }

    #[test]
    fn rejects_newer_database_versions() {
        let mut database = Connection::open_in_memory().expect("open database");
        database
            .pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION + 1)
            .expect("set future version");
        let error = migrate_database(&mut database).expect_err("future database must fail");
        assert!(error.contains("高于当前程序支持的版本"));
    }

    #[test]
    fn matches_typescript_shared_backend_contract() {
        let fixture: BackendConsistencyFixture = serde_json::from_str(include_str!(
            "../../tests/fixtures/backend-consistency.json"
        ))
        .expect("parse shared backend fixture");
        let mut database = Connection::open_in_memory().expect("open database");
        migrate_database(&mut database).expect("migrate database");

        assert_eq!(CURRENT_SCHEMA_VERSION, fixture.schema_version);
        assert_eq!(
            schema_version(&database).expect("read schema version"),
            fixture.schema_version
        );

        for input in &fixture.accounts {
            create_account_record(&database, input).expect("create fixture account");
        }
        reorder_account_records(&mut database, &fixture.reorder).expect("reorder fixture accounts");
        update_account_record(
            &database,
            fixture.update_account.id,
            &fixture.update_account.input,
        )
        .expect("update fixture account");
        for input in &fixture.transactions {
            create_transaction_record(&mut database, input).expect("create fixture transaction");
        }
        delete_transaction_record(&mut database, fixture.delete_transaction_id)
            .expect("delete fixture transaction");
        update_settings_record(&database, &fixture.settings).expect("update fixture settings");

        let actual = serde_json::to_value(snapshot(&database).expect("read final snapshot"))
            .expect("serialize final snapshot");
        assert_eq!(actual, fixture.expected);
    }

    #[test]
    fn keeps_decimal_balances_exact_and_recalculates_after_edit() {
        let mut database = Connection::open_in_memory().expect("open database");
        migrate_database(&mut database).expect("migrate database");
        let first = create_account_record(
            &database,
            &AccountInput {
                name: "现金".to_string(),
                r#type: "cash".to_string(),
                currency: "CNY".to_string(),
                balance: 0.0,
            },
        )
        .expect("create first account");
        let second = create_account_record(
            &database,
            &AccountInput {
                name: "钱包".to_string(),
                r#type: "wallet".to_string(),
                currency: "CNY".to_string(),
                balance: 10.0,
            },
        )
        .expect("create second account");
        let first_record = create_transaction_record(
            &mut database,
            &TransactionInput {
                date: "2026-08-31".to_string(),
                r#type: "income".to_string(),
                account_id: first.id,
                amount: 0.1,
                category: "测试".to_string(),
                note: None,
            },
        )
        .expect("create first decimal transaction");
        create_transaction_record(
            &mut database,
            &TransactionInput {
                date: "2026-08-31".to_string(),
                r#type: "income".to_string(),
                account_id: first.id,
                amount: 0.2,
                category: "测试".to_string(),
                note: None,
            },
        )
        .expect("create second decimal transaction");
        assert_eq!(
            snapshot(&database).expect("snapshot").accounts[0].balance,
            0.3
        );

        update_transaction_record(
            &mut database,
            first_record.transaction.id,
            &TransactionInput {
                date: "2026-08-31".to_string(),
                r#type: "expense".to_string(),
                account_id: second.id,
                amount: 2.0,
                category: "修改".to_string(),
                note: None,
            },
        )
        .expect("update transaction");
        let final_snapshot = snapshot(&database).expect("final snapshot");
        assert_eq!(final_snapshot.accounts[0].balance, 0.2);
        assert_eq!(final_snapshot.accounts[1].balance, 8.0);
    }

    #[test]
    fn transfers_and_deletes_both_sides_together() {
        let mut database = Connection::open_in_memory().expect("open database");
        migrate_database(&mut database).expect("migrate database");
        let from = create_account_record(
            &database,
            &AccountInput {
                name: "支付宝".to_string(),
                r#type: "wallet".to_string(),
                currency: "CNY".to_string(),
                balance: 100.0,
            },
        )
        .expect("create source");
        let to = create_account_record(
            &database,
            &AccountInput {
                name: "银行卡".to_string(),
                r#type: "bank".to_string(),
                currency: "CNY".to_string(),
                balance: 20.0,
            },
        )
        .expect("create target");
        let transfer = create_transfer_record(
            &mut database,
            &TransferInput {
                date: "2026-08-31".to_string(),
                from_account_id: from.id,
                to_account_id: to.id,
                amount: 30.0,
                note: None,
            },
        )
        .expect("create transfer");
        assert_eq!(transfer.transactions.len(), 2);
        assert_eq!(transfer.accounts[0].balance, 70.0);
        assert_eq!(transfer.accounts[1].balance, 50.0);
        assert!(delete_account_record(&database, from.id).is_err());

        let deleted = delete_transaction_record(&mut database, transfer.transactions[0].id)
            .expect("delete transfer");
        assert_eq!(deleted.transactions.len(), 2);
        assert!(snapshot(&database)
            .expect("snapshot")
            .transactions
            .is_empty());
    }

    #[test]
    fn detects_and_repairs_corrupted_balance() {
        let mut database = Connection::open_in_memory().expect("open database");
        migrate_database(&mut database).expect("migrate database");
        let account = create_account_record(
            &database,
            &AccountInput {
                name: "现金".to_string(),
                r#type: "cash".to_string(),
                currency: "CNY".to_string(),
                balance: 100.0,
            },
        )
        .expect("create account");
        database
            .execute(
                "UPDATE accounts SET balance = '999' WHERE id = ?1",
                [account.id],
            )
            .expect("corrupt balance");
        assert!(!check_balances_record(&database, false).expect("check").ok);
        assert!(
            check_balances_record(&database, true)
                .expect("repair")
                .repaired
        );
        assert_eq!(
            snapshot(&database).expect("snapshot").accounts[0].balance,
            100.0
        );
    }

    #[test]
    fn keeps_seven_automatic_backups_on_tauri_backend() {
        let mut database = Connection::open_in_memory().expect("open database");
        migrate_database(&mut database).expect("migrate database");
        let directory =
            std::env::temp_dir().join(format!("accounting-tool-backups-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        for _ in 0..8 {
            save_automatic_backup(&database, &directory).expect("save automatic backup");
        }
        let count = std::fs::read_dir(&directory).expect("read backups").count();
        assert_eq!(count, 7);
        assert!(read_latest_automatic_backup(&directory)
            .expect("read latest automatic backup")
            .is_some());
        std::fs::remove_dir_all(directory).expect("remove backups");
    }

    fn restore_fixture() -> LedgerBackup {
        LedgerBackup {
            format: BACKUP_FORMAT.to_string(),
            format_version: BACKUP_FORMAT_VERSION,
            schema_version: CURRENT_SCHEMA_VERSION,
            exported_at: "2026-08-30T02:03:04.000Z".to_string(),
            data: LedgerSnapshot {
                accounts: vec![Account {
                    id: 7,
                    name: "恢复账户".to_string(),
                    r#type: "wallet".to_string(),
                    currency: "CNY".to_string(),
                    balance: 88.5,
                    sort_order: 0,
                }],
                transactions: vec![LedgerTransaction {
                    id: 12,
                    date: "2026-08-30".to_string(),
                    r#type: "income".to_string(),
                    account_id: 7,
                    amount: 8.5,
                    currency: "CNY".to_string(),
                    category: "其他".to_string(),
                    note: Some("恢复测试".to_string()),
                    transfer_id: None,
                }],
                settings: Settings {
                    base_currency: "USD".to_string(),
                    masked: true,
                    theme: "dark".to_string(),
                },
            },
        }
    }

    #[test]
    fn restores_complete_backup_on_tauri_backend() {
        let mut database = Connection::open_in_memory().expect("open database");
        migrate_database(&mut database).expect("migrate database");
        let backup = restore_fixture();

        let restored = restore_ledger_record(&mut database, &backup).expect("restore backup");
        assert_eq!(
            serde_json::to_value(restored).expect("serialize restored snapshot"),
            serde_json::to_value(&backup.data).expect("serialize backup snapshot")
        );
        let next_id: i64 = database
            .query_row(
                "INSERT INTO accounts (name, type, currency, balance, sort_order) VALUES ('新账户', 'cash', 'CNY', '0', 1) RETURNING id",
                [],
                |row| row.get(0),
            )
            .expect("insert after restore");
        assert_eq!(next_id, 8);
    }

    #[test]
    fn rolls_back_tauri_restore_when_a_database_write_fails() {
        let mut database = Connection::open_in_memory().expect("open database");
        migrate_database(&mut database).expect("migrate database");
        create_account_record(
            &database,
            &AccountInput {
                name: "原账本".to_string(),
                r#type: "cash".to_string(),
                currency: "CNY".to_string(),
                balance: 100.0,
            },
        )
        .expect("create original account");
        database
            .execute_batch(
                "CREATE TRIGGER fail_restore BEFORE INSERT ON accounts
                 WHEN NEW.name = '恢复账户'
                 BEGIN SELECT RAISE(ABORT, 'forced restore failure'); END;",
            )
            .expect("create failure trigger");

        let error = restore_ledger_record(&mut database, &restore_fixture())
            .expect_err("restore must fail");
        assert!(error.contains("forced restore failure"));
        let preserved = snapshot(&database).expect("read preserved snapshot");
        assert_eq!(preserved.accounts.len(), 1);
        assert_eq!(preserved.accounts[0].name, "原账本");
        assert_eq!(preserved.accounts[0].balance, 100.0);
    }
}
