<div align="center">

<img src="src-tauri/icons/128x128.png" width="80" height="80" alt="PocketLedger app icon">

# PocketLedger

**Your finances, clearly organized.**

A personal finance tracker for Web, Windows, and Android.
Track accounts, record expenses, and explore your finances—with offline storage on desktop and Android.

[![Quality checks](https://github.com/bcielai321/PocketLedger/actions/workflows/quality.yml/badge.svg)](https://github.com/bcielai321/PocketLedger/actions/workflows/quality.yml)
[![Latest release](https://img.shields.io/github/v/release/bcielai321/PocketLedger)](https://github.com/bcielai321/PocketLedger/releases/latest)

[Download](https://github.com/bcielai321/PocketLedger/releases/latest) · [Quick start](#quick-start) · [Architecture](docs/architecture.md) · [简体中文](README.zh-CN.md)

</div>

## A clearer view of your money

| Keep your ledger close | See the bigger picture | Take your data with you |
| --- | --- | --- |
| Record transactions offline on Windows and Android with on-device SQLite. | Review net worth, monthly income and expenses, and a 12-month trend. | Export JSON, CSV, or Excel; restore a complete ledger from JSON. |

## Features

- **Accounts:** cash, bank, credit, investment, debt, wallet, and other accounts; editing and ordering.
- **Transactions:** add, edit, delete, search, and filter income and expenses by account.
- **Transfers:** create, edit, and delete transfers between same-currency accounts without counting them as income or expenses.
- **Reports:** net worth, monthly totals, spending categories, and trends. Supports CNY, HKD, USD, EUR, USDT, and BTC.
- **Data protection:** automatic pre-change snapshots, balance checks and repairs, versioned migrations, and transactional JSON restore.
- **Preferences:** switch the complete interface and exports between English and Simplified Chinese, plus light/dark themes, amount masking, and a preferred base currency.

## Get PocketLedger

| Platform | Start here | Data location |
| --- | --- | --- |
| Windows x64 | Download the `.exe` installer from [Releases](https://github.com/bcielai321/PocketLedger/releases/latest). | Your computer's application data directory |
| Android ARM64 | Download the release `.apk` from [Releases](https://github.com/bcielai321/PocketLedger/releases/latest). | Your device's application data directory |
| Web / self-hosted | Use Node.js or Docker below. | SQLite on your server |

The installed application and release files use the Chinese product name **口袋账本**. The project and repository continue to use the international name **PocketLedger**.

## Quick start

Use Node.js **22.19+ within 22.x, 24.11+ within 24.x, or 26+**.

```bash
git clone https://github.com/bcielai321/PocketLedger.git
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
- **Independent ledgers:** Web, desktop, and Android do not automatically sync. JSON restore replaces the target ledger rather than merging records.
- **Demo exchange rates:** conversions use fixed built-in values, not live or historical rates.
- **Import format:** JSON is supported for restore; CSV and Excel are export-only.
- **Backup privacy:** exports contain actual amounts even when masked in the UI. Automatic snapshots retain seven files on the same storage as the database; they are not a separate cloud backup.

## For developers

The shared Vue UI has two data paths: **Nuxt / Nitro → SQLite** for Web, and **Tauri IPC → Rust → SQLite** for desktop and Android.

| Guide | Contents |
| --- | --- |
| [Architecture](docs/architecture.md) | Data paths, source layout, storage, API, compatibility |
| [Development](docs/development.md) | Setup, tests, builds, releases, contribution checklist |
| [Mobile regression](docs/mobile-regression.md) | Repeatable narrow-screen scenario and Android device checklist |
| [简体中文](README.zh-CN.md) | Chinese overview and quick start |

Built with Nuxt 4, Vue 3, TypeScript, Tauri 2, Rust, and SQLite. Bug reports and focused contributions are welcome via [Issues](https://github.com/bcielai321/PocketLedger/issues) and [Pull requests](https://github.com/bcielai321/PocketLedger/pulls).
