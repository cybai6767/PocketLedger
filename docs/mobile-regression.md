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
- Import a Suishouji Excel workbook through the native picker; verify binary read permission, original date/time and member fields. No JSON save dialog should appear.
- Re-import the same file and verify no new entries; review possible duplicates of older entries and explicitly acknowledge invalid rows. Verify existing balances are kept by default and new balances are entered explicitly.
- Undo an import before another edit; verify a later edit prevents stale undo. Relaunch and check that the automatic snapshot remains readable.
- Preview a complete backup in Restore; verify replacement requires the inline checkbox and does not open a safety-copy save dialog. Confirm the automatic snapshot contains the previous ledger.
- Relaunch offline and verify accounts, transactions, and preferences persist.
- Check safe areas, portrait/landscape layouts, scrolling, account ordering, and system-back behavior.
- Verify the five native mobile tabs stay at the bottom, the last controls remain above the bar, and summary cards appear only on Home. Check the order Home, Reports, Add entry, Accounts, Settings and the central add icon. Web and desktop navigation should keep their existing positions.
- Import an older compatible JSON backup; reject invalid/newer schemas without losing the current ledger.

## Verification record (2026-09-13)

TypeScript transport/state tests, Rust shared-fixture tests, both frontend builds, and a real isolated HTTP/SSR smoke test were executed. The smoke test covered account creation, transaction creation/editing, transfer, paired transfer deletion, final balances, and SSR loading through the new adapter. The Tabbit launcher was unavailable in this environment (compatibility invocation exited 69 without a receipt), so the narrow-screen browser scenario is supplied but **not executed**. No Android device was connected for a native regression run. Treat those two checks as pending before publishing an installer.

## Import workflow verification (2026-11-01, v1.0.7)

- 103 TypeScript tests, 14 Rust tests, typecheck and ESLint passed. The same fixture checks source-field persistence, balance preservation, guarded application and guarded undo on both backends.
- Production Web build, Android ARM64 debug APK build/signature verification, and Linux debug desktop build passed. Native Android and Windows were not run on physical devices.
- An isolated browser ledger exercised append import, explicit invalid-row acknowledgement, current-balance entry, repeated-file skipping, undo, and automatic-snapshot restore. Import and restore completed without a JSON download prompt.
- Local workbook verification covered multi-file append import, same-file re-import skipping, retained original fields, and lossless JSON / CSV / Excel round trips. Personal workbooks and generated exports were kept outside the repository.
- The shared data-management view was checked at 320px and 390px widths without page-level horizontal overflow.
- Build artifacts, snapshots, database files and signing material remain ignored. Formal installers are built from clean checkouts by the release workflow.
