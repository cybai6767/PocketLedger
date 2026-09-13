use crate::{backup::*, database::*, models::*, repository::*, validation::is_date};
use rusqlite::Connection;
use serde::Deserialize;

#[derive(Deserialize)]
struct EditFixture {
    id: i64,
    input: TransactionInput,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MutationFixture {
    accounts: Vec<AccountInput>,
    transactions: Vec<TransactionInput>,
    edit: EditFixture,
    transfer: TransferInput,
    invalid_transfer: TransferInput,
    after_edit: Vec<f64>,
    after_transfer: Vec<f64>,
    after_delete: Vec<f64>,
}

#[test]
fn matches_shared_mutation_contract() {
    let fixture: MutationFixture =
        serde_json::from_str(include_str!("../../tests/fixtures/backend-mutations.json")).unwrap();
    let mut db = Connection::open_in_memory().unwrap();
    migrate_database(&mut db).unwrap();
    for account in &fixture.accounts {
        create_account_record(&db, account).unwrap();
    }
    for input in &fixture.transactions {
        create_transaction_record(&mut db, input).unwrap();
    }
    update_transaction_record(&mut db, fixture.edit.id, &fixture.edit.input).unwrap();
    let balances = |db: &Connection| {
        snapshot(db)
            .unwrap()
            .accounts
            .iter()
            .map(|a| a.balance)
            .collect::<Vec<_>>()
    };
    assert_eq!(balances(&db), fixture.after_edit);
    let transfer = create_transfer_record(&mut db, &fixture.transfer).unwrap();
    assert_eq!(balances(&db), fixture.after_transfer);
    assert_eq!(transfer.transactions.len(), 2);
    assert!(transfer.transactions[0].transfer_id.is_some());
    assert_eq!(
        transfer.transactions[0].transfer_id,
        transfer.transactions[1].transfer_id
    );
    let before_reject = serde_json::to_value(snapshot(&db).unwrap()).unwrap();
    assert!(create_transfer_record(&mut db, &fixture.invalid_transfer).is_err());
    assert!(delete_account_record(&db, 1).is_err());
    assert_eq!(
        serde_json::to_value(snapshot(&db).unwrap()).unwrap(),
        before_reject
    );
    delete_transaction_record(&mut db, transfer.transactions[0].id).unwrap();
    assert_eq!(balances(&db), fixture.after_delete);
    assert_eq!(snapshot(&db).unwrap().transactions.len(), 3);
    assert!(check_balances_record(&db, false).unwrap().ok);

    let mut backup = LedgerBackup {
        format: BACKUP_FORMAT.to_string(),
        format_version: BACKUP_FORMAT_VERSION,
        schema_version: CURRENT_SCHEMA_VERSION,
        exported_at: "2026-09-12T00:00:00Z".to_string(),
        data: snapshot(&db).unwrap(),
    };
    let expected = serde_json::to_value(&backup.data).unwrap();
    create_transaction_record(&mut db, &fixture.transactions[0]).unwrap();
    restore_ledger_record(&mut db, &backup).unwrap();
    assert_eq!(
        serde_json::to_value(snapshot(&db).unwrap()).unwrap(),
        expected
    );
    backup.data.transactions[0].account_id = 999;
    assert!(restore_ledger_record(&mut db, &backup).is_err());
    assert_eq!(
        serde_json::to_value(snapshot(&db).unwrap()).unwrap(),
        expected
    );
    let cleared = clear_ledger_record(&mut db).unwrap();
    assert!(cleared.accounts.is_empty());
    assert!(cleared.transactions.is_empty());
    assert_eq!(cleared.settings.base_currency, "CNY");
    assert!(!cleared.settings.masked);
    assert_eq!(cleared.settings.theme, "light");
    assert_eq!(cleared.settings.language, "zh-CN");
}

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
    assert_eq!(
        snapshot(&database)
            .expect("read migrated settings")
            .settings
            .language,
        "zh-CN"
    );
}

#[test]
fn reads_legacy_backup_without_language_as_simplified_chinese() {
    let source = r#"{
        "format":"accounting-tool-backup",
        "formatVersion":1,
        "schemaVersion":2,
        "exportedAt":"2026-08-30T02:03:04.000Z",
        "data":{"accounts":[],"transactions":[],"settings":{"baseCurrency":"CNY","masked":false,"theme":"light"}}
    }"#;
    let backup: LedgerBackup = serde_json::from_str(source).expect("parse legacy backup");
    assert_eq!(backup.data.settings.language, "zh-CN");
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
    let updated = update_transfer_record(
        &mut database,
        transfer.transactions[0].id,
        &TransferInput {
            date: "2026-09-01".to_string(),
            from_account_id: from.id,
            to_account_id: to.id,
            amount: 45.0,
            note: Some("补充储蓄".to_string()),
        },
    )
    .expect("update transfer");
    assert_eq!(updated.transactions.len(), 2);
    assert!(updated
        .transactions
        .iter()
        .all(|record| record.date == "2026-09-01"
            && record.amount == 45.0
            && record.note.as_deref() == Some("补充储蓄")));
    let balances: Vec<f64> = snapshot(&database)
        .expect("snapshot after transfer update")
        .accounts
        .iter()
        .map(|account| account.balance)
        .collect();
    assert_eq!(balances, vec![55.0, 65.0]);
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
    std::fs::create_dir_all(&directory).expect("create backup directory");
    let future_name = "automatic-1000000000000000000000000000000.json";
    std::fs::write(directory.join(future_name), "ignored placeholder")
        .expect("write future-dated placeholder");
    for _ in 0..8 {
        save_automatic_backup(&database, &directory).expect("save automatic backup");
    }
    let count = std::fs::read_dir(&directory).expect("read backups").count();
    assert_eq!(count, 7);
    let latest = read_latest_automatic_backup(&directory)
        .expect("read latest automatic backup")
        .expect("latest backup");
    assert_eq!(latest.format, BACKUP_FORMAT);
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
                language: "en".to_string(),
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

    let error =
        restore_ledger_record(&mut database, &restore_fixture()).expect_err("restore must fail");
    assert!(error.contains("forced restore failure"));
    let preserved = snapshot(&database).expect("read preserved snapshot");
    assert_eq!(preserved.accounts.len(), 1);
    assert_eq!(preserved.accounts[0].name, "原账本");
    assert_eq!(preserved.accounts[0].balance, 100.0);
}
