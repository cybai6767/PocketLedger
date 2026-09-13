use crate::{database::database_error, models::*, validation::*};
use rusqlite::{params, Connection, OptionalExtension};
use rust_decimal::Decimal;
use std::collections::HashSet;

pub(crate) fn clear_ledger_record(database: &mut Connection) -> Result<LedgerSnapshot, String> {
    let transaction = database.transaction().map_err(database_error)?;
    transaction
        .execute("DELETE FROM transactions", [])
        .map_err(database_error)?;
    transaction
        .execute("DELETE FROM accounts", [])
        .map_err(database_error)?;
    transaction
        .execute(
            "UPDATE settings SET base_currency = 'CNY', masked = 0, theme = 'light', language = 'zh-CN' WHERE id = 1",
            [],
        )
        .map_err(database_error)?;
    transaction.commit().map_err(database_error)?;
    snapshot(database)
}

pub(crate) fn map_account(raw: RawAccount) -> Result<Account, String> {
    Ok(Account {
        id: raw.0,
        name: raw.1,
        r#type: raw.2,
        currency: raw.3,
        balance: decimal_to_number(decimal_from_storage(&raw.4)?)?,
        sort_order: raw.5,
    })
}

pub(crate) fn map_transaction(raw: RawTransaction) -> Result<LedgerTransaction, String> {
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

pub(crate) fn list_accounts(database: &Connection) -> Result<Vec<Account>, String> {
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

pub(crate) fn get_account(database: &Connection, id: i64) -> Result<Account, String> {
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

pub(crate) fn list_transactions(database: &Connection) -> Result<Vec<LedgerTransaction>, String> {
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

pub(crate) fn get_transaction(database: &Connection, id: i64) -> Result<LedgerTransaction, String> {
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

pub(crate) fn get_settings(database: &Connection) -> Result<Settings, String> {
    database
        .query_row(
            "SELECT base_currency, masked, theme, language FROM settings WHERE id = 1",
            [],
            |row| {
                Ok(Settings {
                    base_currency: row.get(0)?,
                    masked: row.get::<_, i64>(1)? != 0,
                    theme: row.get(2)?,
                    language: row.get(3)?,
                })
            },
        )
        .map_err(database_error)
}

pub(crate) fn snapshot(database: &Connection) -> Result<LedgerSnapshot, String> {
    Ok(LedgerSnapshot {
        accounts: list_accounts(database)?,
        transactions: list_transactions(database)?,
        settings: get_settings(database)?,
    })
}

pub(crate) fn transaction_net(database: &Connection, account_id: i64) -> Result<Decimal, String> {
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

pub(crate) fn expected_balance(database: &Connection, account_id: i64) -> Result<Decimal, String> {
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

pub(crate) fn recalculate_account(
    database: &Connection,
    account_id: i64,
) -> Result<Account, String> {
    let balance = expected_balance(database, account_id)?;
    database
        .execute(
            "UPDATE accounts SET balance = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![decimal_to_storage(balance), account_id],
        )
        .map_err(database_error)?;
    get_account(database, account_id)
}

pub(crate) fn create_account_record(
    database: &Connection,
    input: &AccountInput,
) -> Result<Account, String> {
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

pub(crate) fn update_account_record(
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

pub(crate) fn delete_account_record(database: &Connection, id: i64) -> Result<(), String> {
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

pub(crate) fn reorder_account_records(
    database: &mut Connection,
    ids: &[i64],
) -> Result<Vec<Account>, String> {
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

pub(crate) fn create_transaction_record(
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

pub(crate) fn update_transaction_record(
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

pub(crate) fn create_transfer_record(
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

pub(crate) fn update_transfer_record(
    database: &mut Connection,
    id: i64,
    input: &TransferInput,
) -> Result<TransactionMutationResult, String> {
    if id <= 0 {
        return Err("ID 无效".to_string());
    }
    validate_transfer(input)?;
    let transaction = database.transaction().map_err(database_error)?;
    let selected = get_transaction(&transaction, id)?;
    let transfer_id = selected
        .transfer_id
        .clone()
        .ok_or_else(|| "这条流水不是账户转账".to_string())?;
    let previous: Vec<_> = list_transactions(&transaction)?
        .into_iter()
        .filter(|record| record.transfer_id.as_deref() == Some(transfer_id.as_str()))
        .collect();
    let expense = previous
        .iter()
        .find(|record| record.r#type == "expense")
        .ok_or_else(|| "转账的两条关联流水不完整".to_string())?;
    let income = previous
        .iter()
        .find(|record| record.r#type == "income")
        .ok_or_else(|| "转账的两条关联流水不完整".to_string())?;
    if previous.len() != 2 {
        return Err("转账的两条关联流水不完整".to_string());
    }
    let expense_id = expense.id;
    let income_id = income.id;
    let from = get_account(&transaction, input.from_account_id)?;
    let to = get_account(&transaction, input.to_account_id)?;
    if from.currency != to.currency {
        return Err("转账只支持币种相同的两个账户".to_string());
    }
    let amount = decimal_to_storage(decimal_from_number(input.amount, "金额")?);
    let note = input
        .note
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    transaction
        .execute(
            "UPDATE transactions
             SET account_id = ?1, date = ?2, amount = ?3, currency = ?4,
                 category = '转账', note = ?5
             WHERE id = ?6",
            params![from.id, input.date, amount, from.currency, note, expense_id],
        )
        .map_err(database_error)?;
    transaction
        .execute(
            "UPDATE transactions
             SET account_id = ?1, date = ?2, amount = ?3, currency = ?4,
                 category = '转账', note = ?5
             WHERE id = ?6",
            params![to.id, input.date, amount, to.currency, note, income_id],
        )
        .map_err(database_error)?;

    let mut account_ids: HashSet<i64> = previous.iter().map(|record| record.account_id).collect();
    account_ids.insert(from.id);
    account_ids.insert(to.id);
    let mut accounts = Vec::new();
    for account_id in account_ids {
        accounts.push(recalculate_account(&transaction, account_id)?);
    }
    let records = vec![
        get_transaction(&transaction, expense_id)?,
        get_transaction(&transaction, income_id)?,
    ];
    transaction.commit().map_err(database_error)?;
    Ok(TransactionMutationResult {
        transactions: records,
        accounts,
    })
}

pub(crate) fn delete_transaction_record(
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

pub(crate) fn check_balances_record(
    database: &Connection,
    repair: bool,
) -> Result<BalanceCheck, String> {
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

pub(crate) fn update_settings_record(
    database: &Connection,
    settings: &Settings,
) -> Result<Settings, String> {
    validate_settings(settings)?;
    database
        .execute(
            "UPDATE settings SET base_currency = ?1, masked = ?2, theme = ?3, language = ?4 WHERE id = 1",
            params![
                settings.base_currency,
                settings.masked as i64,
                settings.theme,
                settings.language
            ],
        )
        .map_err(database_error)?;
    get_settings(database)
}

pub(crate) fn restore_ledger_record(
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
            "UPDATE settings SET base_currency = ?1, masked = ?2, theme = ?3, language = ?4 WHERE id = 1",
            params![
                backup.data.settings.base_currency,
                backup.data.settings.masked as i64,
                backup.data.settings.theme,
                backup.data.settings.language
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
