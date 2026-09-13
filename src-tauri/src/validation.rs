use crate::models::*;
use rust_decimal::{prelude::ToPrimitive, Decimal};
use std::{
    collections::{HashMap, HashSet},
    str::FromStr,
};

const ACCOUNT_TYPES: &[&str] = &[
    "cash", "bank", "credit", "invest", "debt", "wallet", "other",
];
const CURRENCIES: &[&str] = &["CNY", "HKD", "USD", "EUR", "USDT", "BTC"];
const TX_TYPES: &[&str] = &["income", "expense"];

pub(crate) fn decimal_from_number(value: f64, field: &str) -> Result<Decimal, String> {
    if !value.is_finite() {
        return Err(format!("{field}必须是有效数字"));
    }
    Decimal::from_str(&value.to_string())
        .map(|value| value.round_dp(8))
        .map_err(|_| format!("{field}必须是有效数字"))
}

pub(crate) fn decimal_from_storage(value: &str) -> Result<Decimal, String> {
    Decimal::from_str(value).map_err(|_| "数据库中的金额格式无效".to_string())
}

pub(crate) fn decimal_to_number(value: Decimal) -> Result<f64, String> {
    value
        .to_f64()
        .ok_or_else(|| "金额超出可显示范围".to_string())
}

pub(crate) fn decimal_to_storage(value: Decimal) -> String {
    value.round_dp(8).normalize().to_string()
}

pub(crate) fn validate_account(input: &AccountInput) -> Result<(), String> {
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

pub(crate) fn validate_transaction(input: &TransactionInput) -> Result<(), String> {
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

pub(crate) fn validate_transfer(input: &TransferInput) -> Result<(), String> {
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

pub(crate) fn validate_settings(settings: &Settings) -> Result<(), String> {
    if !CURRENCIES.contains(&settings.base_currency.as_str()) {
        return Err("基准货币无效".to_string());
    }
    if settings.theme != "light" && settings.theme != "dark" {
        return Err("主题无效".to_string());
    }
    Ok(())
}

pub(crate) fn validate_backup(backup: &LedgerBackup) -> Result<(), String> {
    if backup.format != BACKUP_FORMAT {
        return Err("不是PocketLedger完整备份".to_string());
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

pub(crate) fn is_date(value: &str) -> bool {
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
