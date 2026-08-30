use rusqlite::{params, Connection, OptionalExtension};
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::sync::Mutex;
use tauri::{Manager, State};

const CURRENT_SCHEMA_VERSION: i64 = 1;

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
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountInput {
    name: String,
    r#type: String,
    currency: String,
    balance: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Account {
    id: i64,
    name: String,
    r#type: String,
    currency: String,
    balance: f64,
    sort_order: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransactionInput {
    date: String,
    r#type: String,
    account_id: i64,
    amount: f64,
    category: String,
    note: Option<String>,
}

#[derive(Debug, Serialize)]
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
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    base_currency: String,
    masked: bool,
    theme: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LedgerSnapshot {
    accounts: Vec<Account>,
    transactions: Vec<LedgerTransaction>,
    settings: Settings,
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
struct AccountResult {
    account: Account,
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
);

fn database_error(error: rusqlite::Error) -> String {
    format!("数据库操作失败：{error}")
}

fn schema_version(database: &Connection) -> Result<i64, String> {
    database
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(database_error)
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

fn validate_settings(settings: &Settings) -> Result<(), String> {
    if !CURRENCIES.contains(&settings.base_currency.as_str()) {
        return Err("基准货币无效".to_string());
    }
    if settings.theme != "light" && settings.theme != "dark" {
        return Err("主题无效".to_string());
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
            "SELECT id, account_id, date, type, amount, currency, category, note
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
            ))
        })
        .map_err(database_error)?;

    rows.map(|row| row.map_err(database_error).and_then(map_transaction))
        .collect()
}

fn get_transaction(database: &Connection, id: i64) -> Result<LedgerTransaction, String> {
    let raw = database
        .query_row(
            "SELECT id, account_id, date, type, amount, currency, category, note
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

fn lock_database<'a>(
    state: &'a State<'_, AppState>,
) -> Result<std::sync::MutexGuard<'a, Connection>, String> {
    state
        .database
        .lock()
        .map_err(|_| "无法访问本机数据库".to_string())
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
            "INSERT INTO accounts (name, type, currency, balance, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5)",
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
    let changes = database
        .execute(
            "UPDATE accounts
             SET name = ?1, type = ?2, currency = ?3, balance = ?4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?5",
            params![
                input.name.trim(),
                input.r#type,
                input.currency,
                decimal_to_storage(decimal_from_number(input.balance, "余额")?),
                id
            ],
        )
        .map_err(database_error)?;
    if changes == 0 {
        return Err("账户不存在".to_string());
    }
    get_account(database, id)
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
    let balance = decimal_from_number(account.balance, "余额")?;
    let next_balance = if input.r#type == "income" {
        balance + amount
    } else {
        balance - amount
    };

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
    transaction
        .execute(
            "UPDATE accounts SET balance = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![decimal_to_storage(next_balance), account.id],
        )
        .map_err(database_error)?;
    let created = get_transaction(&transaction, transaction_id)?;
    transaction.commit().map_err(database_error)?;

    Ok(TransactionResult {
        transaction: created,
        account: get_account(database, account.id)?,
    })
}

fn delete_transaction_record(database: &mut Connection, id: i64) -> Result<AccountResult, String> {
    if id <= 0 {
        return Err("ID 无效".to_string());
    }
    let transaction = database.transaction().map_err(database_error)?;
    let record = get_transaction(&transaction, id)?;
    let account = get_account(&transaction, record.account_id)?;
    let balance = decimal_from_number(account.balance, "余额")?;
    let amount = decimal_from_number(record.amount, "金额")?;
    let next_balance = if record.r#type == "income" {
        balance - amount
    } else {
        balance + amount
    };

    transaction
        .execute(
            "UPDATE accounts SET balance = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![decimal_to_storage(next_balance), account.id],
        )
        .map_err(database_error)?;
    transaction
        .execute("DELETE FROM transactions WHERE id = ?1", [id])
        .map_err(database_error)?;
    transaction.commit().map_err(database_error)?;
    Ok(AccountResult {
        account: get_account(database, account.id)?,
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

#[tauri::command]
fn get_snapshot(state: State<'_, AppState>) -> Result<LedgerSnapshot, String> {
    let database = lock_database(&state)?;
    snapshot(&database)
}

#[tauri::command]
fn create_account(input: AccountInput, state: State<'_, AppState>) -> Result<Account, String> {
    let database = lock_database(&state)?;
    create_account_record(&database, &input)
}

#[tauri::command]
fn update_account(
    id: i64,
    input: AccountInput,
    state: State<'_, AppState>,
) -> Result<Account, String> {
    let database = lock_database(&state)?;
    update_account_record(&database, id, &input)
}

#[tauri::command]
fn delete_account(id: i64, state: State<'_, AppState>) -> Result<OkResponse, String> {
    if id <= 0 {
        return Err("ID 无效".to_string());
    }
    let database = lock_database(&state)?;
    let changes = database
        .execute("DELETE FROM accounts WHERE id = ?1", [id])
        .map_err(database_error)?;
    if changes == 0 {
        return Err("账户不存在".to_string());
    }
    Ok(OkResponse { ok: true })
}

#[tauri::command]
fn reorder_accounts(ids: Vec<i64>, state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    let mut database = lock_database(&state)?;
    reorder_account_records(&mut database, &ids)
}

#[tauri::command]
fn create_transaction(
    input: TransactionInput,
    state: State<'_, AppState>,
) -> Result<TransactionResult, String> {
    let mut database = lock_database(&state)?;
    create_transaction_record(&mut database, &input)
}

#[tauri::command]
fn delete_transaction(id: i64, state: State<'_, AppState>) -> Result<AccountResult, String> {
    let mut database = lock_database(&state)?;
    delete_transaction_record(&mut database, id)
}

#[tauri::command]
fn update_settings(settings: Settings, state: State<'_, AppState>) -> Result<Settings, String> {
    let database = lock_database(&state)?;
    update_settings_record(&database, &settings)
}

#[tauri::command]
fn clear_ledger(state: State<'_, AppState>) -> Result<LedgerSnapshot, String> {
    let mut database = lock_database(&state)?;
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
            create_account,
            update_account,
            delete_account,
            reorder_accounts,
            create_transaction,
            delete_transaction,
            update_settings,
            clear_ledger,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        create_account_record, create_transaction_record, delete_transaction_record, is_date,
        migrate_database, reorder_account_records, schema_version, snapshot, update_account_record,
        update_settings_record, AccountInput, Connection, Settings, TransactionInput,
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
}
