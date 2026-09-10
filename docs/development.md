# Development

[Home](../README.md) · [简体中文](../README.zh-CN.md) · [Architecture](architecture.md)

## Web setup

Use Node.js matching `^22.19.0 || ^24.11.0 || >=26.0.0`. CI uses Node 24.

```bash
npm ci
npm run dev
```

Production build and startup:

```bash
npm run build
npm run start
```

Set `NODE_ENV=production` in deployment. `HOST` and `PORT` control the listener; the container uses `0.0.0.0:3000`.

Custom database location in Bash:

```bash
NUXT_DATABASE_PATH=/absolute/path/accounting.sqlite npm run dev
```

In PowerShell:

```powershell
$env:NUXT_DATABASE_PATH = 'E:\ledger-data\accounting.sqlite'
npm run dev
```

Docker uses a two-stage build, runs as the `node` user, and persists `/app/data` in the `ledger-data` volume:

```bash
docker compose up --build -d
```

## Quality checks

```bash
npm run test:all
npm run typecheck
npm run lint
npm run build
```

`test:all` runs Vitest and Cargo tests; Rust and platform Tauri prerequisites are required. `npm test` runs the TypeScript suite alone.

Both backends use `tests/fixtures/backend-consistency.json` to check specified operations against the same snapshot. This covers those scenarios, not every possible behavior. Type checking is separate from Nuxt build.

The quality workflow runs tests, type checking, and lint on `main` pushes, pull requests, and manual dispatch. It does not currently run the Web production build.

## Desktop

Install Rust and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/):

```bash
npm run tauri -- dev
```

Build a Windows NSIS installer on Windows:

```bash
npm run tauri -- build --bundles nsis
```

Tauri runs `generate:tauri` and embeds `.output/public`. The release workflow targets Windows x64; macOS/Linux installers are not configured there.

## Android

Configuration: `minSdk=24`, `compileSdk=36`, `targetSdk=36`. CI uses Java 21, build-tools 36.0.0, NDK 27.0.12077973, and Rust target `aarch64-linux-android`.

After configuring Android SDK/NDK and the Rust target:

```bash
npm run tauri:android:init
npm run tauri:android:build:standard
```

This produces a debug ARM64 APK. For Arch/Manjaro system Rust without rustup, install matching Rust sources and use the helper:

```bash
sudo pacman -S rust-src
npm run tauri:android:init
npm run tauri:android:build
```

The helper builds the Android standard library under `src-tauri/target/`; its output is `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`.

Debug packages are for testing. Before release, test keyboard behavior, safe areas, navigation, file selection/export, restore, and offline relaunch on a real device.

## Releases

The release workflow accepts `v*` tags and manual dispatch. Prefer a version tag for versioned releases. It builds Windows NSIS and Android ARM64 APK artifacts, verifies the Android signature, and publishes both to GitHub Releases.

Configure repository secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

CI decodes the keystore and supplies `ANDROID_KEYSTORE_PATH` plus the signing values to Gradle. Keep keys outside Git. Windows code signing and app-store submission are not configured in this workflow.

Keep versions synchronized in `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the root package entry in `src-tauri/Cargo.lock`. Update `RELEASE_NOTES.md`. Existing installers retain old branding until a new release is built.

## Contributing

For UI-only work, check the affected component at narrow and wide widths. For a new field or accounting rule:

1. Update TypeScript contracts and Rust models/validation together.
2. Implement the rule in both backend paths.
3. Add a new migration for storage changes; do not rewrite shipped migrations.
4. Review JSON validation/restore, CSV/Excel exports, and old-backup compatibility.
5. Add meaningful rule tests and extend shared fixtures where appropriate.
6. Run quality checks and verify affected platform interactions.

Include platform, version, reproduction steps, and expected/actual behavior in bug reports. Use synthetic transactions instead of attaching personal ledgers. Keep pull requests focused and describe the checks performed.
