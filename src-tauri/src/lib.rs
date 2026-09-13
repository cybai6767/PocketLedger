mod backup;
mod commands;
mod database;
mod models;
mod repository;
mod validation;

#[cfg(test)]
mod tests;

use crate::{database::migrate_database, models::AppState};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

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
            commands::get_snapshot,
            commands::get_latest_automatic_backup,
            commands::create_account,
            commands::update_account,
            commands::delete_account,
            commands::reorder_accounts,
            commands::create_transaction,
            commands::update_transaction,
            commands::create_transfer,
            commands::update_transfer,
            commands::delete_transaction,
            commands::check_balances,
            commands::repair_balances,
            commands::update_settings,
            commands::clear_ledger,
            commands::restore_ledger,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
