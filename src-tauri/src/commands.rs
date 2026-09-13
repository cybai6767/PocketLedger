use crate::{backup::*, models::*, repository::*};
use rusqlite::Connection;
use tauri::State;

fn lock_database<'a>(
    state: &'a State<'_, AppState>,
) -> Result<std::sync::MutexGuard<'a, Connection>, String> {
    state
        .database
        .lock()
        .map_err(|_| "无法访问本机数据库".to_string())
}

#[tauri::command]
pub(crate) fn get_snapshot(state: State<'_, AppState>) -> Result<LedgerSnapshot, String> {
    let database = lock_database(&state)?;
    snapshot(&database)
}

#[tauri::command]
pub(crate) fn get_latest_automatic_backup(
    state: State<'_, AppState>,
) -> Result<Option<LedgerBackup>, String> {
    read_latest_automatic_backup(&state.backup_dir)
}

#[tauri::command]
pub(crate) fn create_account(
    input: AccountInput,
    state: State<'_, AppState>,
) -> Result<Account, String> {
    let database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    create_account_record(&database, &input)
}

#[tauri::command]
pub(crate) fn update_account(
    id: i64,
    input: AccountInput,
    state: State<'_, AppState>,
) -> Result<Account, String> {
    let database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    update_account_record(&database, id, &input)
}

#[tauri::command]
pub(crate) fn delete_account(id: i64, state: State<'_, AppState>) -> Result<OkResponse, String> {
    let database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    delete_account_record(&database, id)?;
    Ok(OkResponse { ok: true })
}

#[tauri::command]
pub(crate) fn reorder_accounts(
    ids: Vec<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<Account>, String> {
    let mut database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    reorder_account_records(&mut database, &ids)
}

#[tauri::command]
pub(crate) fn create_transaction(
    input: TransactionInput,
    state: State<'_, AppState>,
) -> Result<TransactionResult, String> {
    let mut database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    create_transaction_record(&mut database, &input)
}

#[tauri::command]
pub(crate) fn update_transaction(
    id: i64,
    input: TransactionInput,
    state: State<'_, AppState>,
) -> Result<TransactionMutationResult, String> {
    let mut database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    update_transaction_record(&mut database, id, &input)
}

#[tauri::command]
pub(crate) fn create_transfer(
    input: TransferInput,
    state: State<'_, AppState>,
) -> Result<TransactionMutationResult, String> {
    let mut database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    create_transfer_record(&mut database, &input)
}

#[tauri::command]
pub(crate) fn delete_transaction(
    id: i64,
    state: State<'_, AppState>,
) -> Result<TransactionMutationResult, String> {
    let mut database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    delete_transaction_record(&mut database, id)
}

#[tauri::command]
pub(crate) fn check_balances(state: State<'_, AppState>) -> Result<BalanceCheck, String> {
    let database = lock_database(&state)?;
    check_balances_record(&database, false)
}

#[tauri::command]
pub(crate) fn repair_balances(state: State<'_, AppState>) -> Result<BalanceCheck, String> {
    let database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    check_balances_record(&database, true)
}

#[tauri::command]
pub(crate) fn update_settings(
    settings: Settings,
    state: State<'_, AppState>,
) -> Result<Settings, String> {
    let database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    update_settings_record(&database, &settings)
}

#[tauri::command]
pub(crate) fn clear_ledger(state: State<'_, AppState>) -> Result<LedgerSnapshot, String> {
    let mut database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    clear_ledger_record(&mut database)
}

#[tauri::command]
pub(crate) fn restore_ledger(
    backup: LedgerBackup,
    state: State<'_, AppState>,
) -> Result<LedgerSnapshot, String> {
    let mut database = lock_database(&state)?;
    save_automatic_backup(&database, &state.backup_dir)?;
    restore_ledger_record(&mut database, &backup)
}
