# Mobile regression

[Development](development.md) · [Architecture](architecture.md)

## Automated browser scenario

`scripts/mobile-regression.tabbit.txt` is a Playwright scenario for the Tabbit task runtime (`page` and `expect`). It covers synthetic account creation, expense editing, transfers and paired deletion, settings, JSON export, automatic-backup restore with a safety download, reload persistence, and 360/390/768 px navigation.

Start a dedicated Web server with a fresh temporary database. In PowerShell:

```powershell
$env:NUXT_DATABASE_PATH = Join-Path $env:TEMP ("PocketLedger-regression-" + [guid]::NewGuid() + "\accounting.sqlite")
npm run dev -- --host 127.0.0.1 --port 3107
```

In CMD, from the repository root, with Tabbit running:

```bat
"%LOCALAPPDATA%\Tabbit\LocalAgent\bin\tabbit-cli.exe" nodejs --task PocketLedger-regression < scripts\mobile-regression.tabbit.txt
```

If the receipt is queued/running, inspect the same task/request until complete; do not resubmit the mutation script. Finish the task once complete:

```bat
"%LOCALAPPDATA%\Tabbit\LocalAgent\bin\tabbit-cli.exe" finish --task PocketLedger-regression
```

The scenario requires an empty ledger and stops before writing if it finds existing accounts or transactions. Use a fresh database for each run. Never point it at a personal or production ledger.

## Android device checklist

Browser viewport checks do not exercise native IPC, Android dialogs, the software keyboard, or the system back button. On an isolated Android test installation:

- Create an account, enter decimals with the software keyboard, and verify Save remains reachable.
- Edit a transaction and move it between accounts; verify both balances.
- Transfer funds, then delete either transfer entry; verify both entries disappear.
- Cancel a file save and confirm the ledger is unchanged; save JSON and reopen it through the native file picker.
- Preview a backup, cancel the safety-copy save, and verify restore does not run. Then save the safety copy and complete restore.
- Relaunch offline and verify accounts, transactions, and preferences persist.
- Check safe areas, portrait/landscape layouts, scrolling, account ordering, and system-back behavior.
- Import an older compatible JSON backup; reject invalid/newer schemas without losing the current ledger.

## Verification record (2026-09-13)

TypeScript transport/state tests, Rust shared-fixture tests, both frontend builds, and a real isolated HTTP/SSR smoke test were executed. The smoke test covered account creation, transaction creation/editing, transfer, paired transfer deletion, final balances, and SSR loading through the new adapter. The Tabbit launcher was unavailable in this environment (compatibility invocation exited 69 without a receipt), so the narrow-screen browser scenario is supplied but **not executed**. No Android device was connected for a native regression run. Treat those two checks as pending before publishing an installer.
