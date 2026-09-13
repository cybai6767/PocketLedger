use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};

pub(crate) const CURRENT_SCHEMA_VERSION: i64 = 2;
pub(crate) const BACKUP_FORMAT_VERSION: i64 = 1;
pub(crate) const BACKUP_FORMAT: &str = "accounting-tool-backup";

pub(crate) struct AppState {
    pub(crate) database: Mutex<Connection>,
    pub(crate) backup_dir: PathBuf,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AccountInput {
    pub(crate) name: String,
    pub(crate) r#type: String,
    pub(crate) currency: String,
    pub(crate) balance: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Account {
    pub(crate) id: i64,
    pub(crate) name: String,
    pub(crate) r#type: String,
    pub(crate) currency: String,
    pub(crate) balance: f64,
    pub(crate) sort_order: i64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TransactionInput {
    pub(crate) date: String,
    pub(crate) r#type: String,
    pub(crate) account_id: i64,
    pub(crate) amount: f64,
    pub(crate) category: String,
    pub(crate) note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TransferInput {
    pub(crate) date: String,
    pub(crate) from_account_id: i64,
    pub(crate) to_account_id: i64,
    pub(crate) amount: f64,
    pub(crate) note: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LedgerTransaction {
    pub(crate) id: i64,
    pub(crate) date: String,
    pub(crate) r#type: String,
    pub(crate) account_id: i64,
    pub(crate) amount: f64,
    pub(crate) currency: String,
    pub(crate) category: String,
    pub(crate) note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) transfer_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Settings {
    pub(crate) base_currency: String,
    pub(crate) masked: bool,
    pub(crate) theme: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LedgerSnapshot {
    pub(crate) accounts: Vec<Account>,
    pub(crate) transactions: Vec<LedgerTransaction>,
    pub(crate) settings: Settings,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LedgerBackup {
    pub(crate) format: String,
    pub(crate) format_version: i64,
    pub(crate) schema_version: i64,
    pub(crate) exported_at: String,
    pub(crate) data: LedgerSnapshot,
}

#[derive(Serialize)]
pub(crate) struct OkResponse {
    pub(crate) ok: bool,
}

#[derive(Serialize)]
pub(crate) struct TransactionResult {
    pub(crate) transaction: LedgerTransaction,
    pub(crate) account: Account,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TransactionMutationResult {
    pub(crate) transactions: Vec<LedgerTransaction>,
    pub(crate) accounts: Vec<Account>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BalanceIssue {
    pub(crate) account_id: i64,
    pub(crate) account_name: String,
    pub(crate) stored_balance: f64,
    pub(crate) expected_balance: f64,
}

#[derive(Serialize)]
pub(crate) struct BalanceCheck {
    pub(crate) ok: bool,
    pub(crate) repaired: bool,
    pub(crate) issues: Vec<BalanceIssue>,
}

pub(crate) type RawAccount = (i64, String, String, String, String, i64);
pub(crate) type RawTransaction = (
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
