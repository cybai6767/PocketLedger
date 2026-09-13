use crate::{models::*, repository::snapshot, validation::validate_backup};
use rusqlite::Connection;
use std::path::Path;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

fn backup_sequence(path: &Path) -> Option<i128> {
    path.file_name()?
        .to_str()?
        .strip_prefix("automatic-")?
        .strip_suffix(".json")?
        .parse()
        .ok()
}

fn backup_files(directory: &Path) -> Result<Vec<std::path::PathBuf>, String> {
    let mut files = std::fs::read_dir(directory)
        .map_err(|error| format!("无法读取自动备份目录：{error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| backup_sequence(path).is_some())
        .collect::<Vec<_>>();
    files.sort_by_key(|path| std::cmp::Reverse(backup_sequence(path).unwrap_or_default()));
    Ok(files)
}

pub(crate) fn save_automatic_backup(database: &Connection, directory: &Path) -> Result<(), String> {
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
    let last_sequence = backup_files(directory)?
        .first()
        .and_then(|path| backup_sequence(path))
        .unwrap_or_default();
    let sequence = now.unix_timestamp_nanos().max(last_sequence + 1);
    let filename = format!("automatic-{sequence}.json");
    let contents = serde_json::to_string_pretty(&backup)
        .map_err(|error| format!("无法生成自动备份：{error}"))?;
    std::fs::write(directory.join(filename), format!("{contents}\n"))
        .map_err(|error| format!("无法写入自动备份：{error}"))?;
    let files = backup_files(directory)?;
    for expired in files.into_iter().skip(7) {
        std::fs::remove_file(expired).map_err(|error| format!("无法清理旧自动备份：{error}"))?;
    }
    Ok(())
}

pub(crate) fn read_latest_automatic_backup(
    directory: &Path,
) -> Result<Option<LedgerBackup>, String> {
    if !directory.exists() {
        return Ok(None);
    }
    let files = backup_files(directory)?;
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
