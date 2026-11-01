<div align="center">

<img src="src-tauri/icons/128x128.png" width="80" height="80" alt="PocketLedger app icon">

# PocketLedger

**Your finances, clearly organized.**

A personal finance tracker for Web, Windows, Linux, and Android.
Track accounts, record expenses, and explore your finances—with offline storage on desktop and Android.

[![Quality checks](https://github.com/cybai6767/PocketLedger/actions/workflows/quality.yml/badge.svg)](https://github.com/cybai6767/PocketLedger/actions/workflows/quality.yml)
[![Latest release](https://img.shields.io/github/v/release/cybai6767/PocketLedger)](https://github.com/cybai6767/PocketLedger/releases/latest)

[Download](https://github.com/cybai6767/PocketLedger/releases/latest) · [Quick start](#quick-start) · [Updates](RELEASE_NOTES.md) · [Architecture](docs/architecture.md) · [简体中文](README.zh-CN.md)

</div>

## A clearer view of your money

| Keep your ledger close | See the bigger picture | Take your data with you |
| --- | --- | --- |
| Record transactions offline on Windows, Linux, and Android with on-device SQLite. | Review monthly income, expenses, and surplus alongside annual comparisons, daily spending, and category rankings. | Export and restore JSON, CSV, or Excel, including multiple selected backup files. |

## Features

- **Accounts:** cash, bank, credit, investment, debt, wallet, and other accounts; editing and ordering.
- **Transactions:** recent activity groups the latest eight recorded dates. View more opens monthly history, newest first, with expandable daily details, account filtering, search, editing, and deletion.
- **Transfers:** create, edit, and delete transfers between same-currency accounts without counting them as income or expenses.
- **Reports:** selectable monthly statements on Home with income, expenses, surplus, savings rate, and expense comparisons. Reports groups annual charts, monthly totals, daily spending, category rankings, and the transaction list, with its own year/month picker. Monthly surplus and current net worth are labeled separately. Supports CNY, HKD, USD, EUR, USDT, and BTC.
- **Data protection:** automatic pre-change snapshots, balance checks and repairs, versioned migrations, and transactional JSON restore.
- **Preferences:** switch the complete interface and exports between English and Simplified Chinese, plus light/dark themes, amount masking, and a preferred base currency.
- **Navigation:** Home, Reports, Add entry, Accounts, and Settings. Add entry contains income/expense entry and transfers; Reports separates the transaction list and statistics into two subpages. Android uses five bottom tabs with a central add icon; desktop and Web retain their existing navigation positions. Net worth and current-month summary cards appear only on Home.

## Get PocketLedger

| Platform | Start here | Data location |
| --- | --- | --- |
| Windows x64 | Download the `.exe` installer from [Releases](https://github.com/cybai6767/PocketLedger/releases/latest). | Your computer's application data directory |
| Linux AMD64 (Ubuntu 24.04+) | Download the `.deb` installer from [Releases](https://github.com/cybai6767/PocketLedger/releases/latest). | Your computer's application data directory |
| Android ARM64 | Download the release `.apk` from [Releases](https://github.com/cybai6767/PocketLedger/releases/latest). | Your device's application data directory |
| Web / self-hosted | Use Node.js or Docker below. | SQLite on your server |

Android uses the same release key from v1.0.5 onward, so v1.0.5 can be upgraded in place. For v1.0.4 or earlier, export a complete JSON backup before uninstalling, then install the new APK and restore it. See [release notes](RELEASE_NOTES.md).

The installed application uses the Chinese product name **口袋账本**. Release filenames use **PocketLedger** with platform and architecture labels.

## Quick start

Use Node.js **22.19+ within 22.x, 24.11+ within 24.x, or 26+**.

```bash
git clone https://github.com/cybai6767/PocketLedger.git
cd PocketLedger
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The app creates `data/accounting.sqlite` automatically; no separate database service is needed.

Prefer Docker? From the repository directory:

```bash
docker compose up --build -d
```

The app listens on port `3000`. The `ledger-data` volume persists the database and automatic backups.

## Before you start

- **Single-user:** no built-in login or multi-user permissions. Protect access when exposing the Web app beyond your machine.
- **Independent ledgers:** Web, desktop, and Android do not automatically sync. Import appends to the current ledger; full restore is separate. Both save automatic snapshots without forcing a JSON download.
- **Demo exchange rates:** conversions use fixed built-in values, not live or historical rates.
- **Import format:** Import supports JSON, PocketLedger CSV/Excel, and Suishouji income/expense sheets, with account mapping, explicit balance policies, duplicate/invalid-row review and original-field preservation. Undo is available before subsequent changes. Prefer JSON for full migrations; old spreadsheets without transfer IDs cannot reliably restore transfer relationships.
- **Backup privacy:** exports contain actual amounts even when masked in the UI. Automatic snapshots retain seven files on the same storage as the database; they are not a separate cloud backup.

## For developers

The shared Vue UI has two data paths: **Nuxt / Nitro → SQLite** for Web, and **Tauri IPC → Rust → SQLite** for desktop and Android.

| Guide | Contents |
| --- | --- |
| [Architecture](docs/architecture.md) | Data paths, source layout, storage, API, compatibility |
| [Development](docs/development.md) | Setup, tests, builds, releases, contribution checklist |
| [Mobile regression](docs/mobile-regression.md) | Repeatable narrow-screen scenario and Android device checklist |
| [简体中文](README.zh-CN.md) | Chinese overview and quick start |

Built with Nuxt 4, Vue 3, TypeScript, Tauri 2, Rust, and SQLite. Bug reports and focused contributions are welcome via [Issues](https://github.com/cybai6767/PocketLedger/issues) and [Pull requests](https://github.com/cybai6767/PocketLedger/pulls).
