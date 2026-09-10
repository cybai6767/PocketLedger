# PocketLedger

一个基于 **Nuxt 4 + Vue 3 + Nitro + SQLite** 的个人财务记账全栈应用，同时提供 **Tauri 2** 桌面/Android 外壳。Web 版通过 Nitro API 读写服务端 SQLite，Tauri 版通过 Rust 命令读写设备本机 SQLite，可以完全离线使用。

## 已实现功能

- 账户的新增、编辑、删除和拖拽排序
- 现金、银行卡、信用卡、投资、负债、钱包等账户类型
- CNY、HKD、USD、EUR、USDT、BTC 多币种展示和基准币种折算
- 收入、支出流水记录，支持账户筛选和关键词搜索
- 支持新增、修改、删除流水和同币种账户转账
- 使用“期初余额 + 收入 - 支出”精确重算余额，可检查并修复不一致
- 删除账户前检查关联流水，避免误删账目
- 每次修改前自动保存完整 JSON 快照，仅保留最近 7 份
- 净资产、本月收支、12 个月趋势和本月支出分类报表
- 金额遮罩、明暗主题和基准货币服务端持久化
- JSON 完整备份、导入预览与事务性覆盖恢复；恢复前强制保存当前账本安全副本
- CSV/Excel 数据导出，包含账户、流水、设置和备份版本信息
- SQLite schema 版本管理与启动时自动迁移
- SQLite 自动建表、参数校验、错误反馈和响应式界面
- Tauri 桌面端与 Android ARM64 正式签名发布包，本机离线保存账本
- Tauri 桌面端与 Android 使用 CSP 限制外部脚本、网络连接、嵌入页面和插件对象

> 当前是单用户个人账本，不包含注册登录、文件上传、账单提醒或多人权限。旧 README 曾描述这些功能，但原代码并未实现，本次重构没有把未实现功能标为已完成。

## 架构

```text
浏览器（Vue 3）
      │ 同源 /api 请求
      ▼
Nuxt / Nitro Server
      │ 参数校验 + 事务
      ▼
SQLite（data/accounting.sqlite）
```

```text
Tauri WebView（Vue 3 静态页面）
      │ invoke 调用
      ▼
Rust 命令层
      │ 校验 + 事务
      ▼
设备本机 SQLite（accounting.sqlite）
```

```text
app/                    Vue 页面、组件和客户端状态
server/api/             Nitro HTTP API
server/utils/           SQLite 初始化、数据仓库和校验
shared/types/           前后端共享 TypeScript 契约
tests/                  数据层单元测试
src-tauri/              Tauri 配置、Rust 命令、本机 SQLite 与 Android 工程
scripts/                Manjaro/Arch 的无 rustup Android 构建辅助脚本
nuxt.config.ts          Nuxt 与 Node Server 配置
```

## 本地运行

要求 Node.js `22.19+`、`24.11+` 或 `26+`。

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>。首次访问时会自动创建 `data/accounting.sqlite`，无需安装 MySQL，也不再需要单独启动 Spring Boot。

如需把数据库放在其他位置：

```bash
NUXT_DATABASE_PATH=/absolute/path/accounting.sqlite npm run dev
```

## 质量检查

```bash
npm run test:all
npm run typecheck
npm run lint
npm run build
```

`test:all` 会同时运行 TypeScript 与 Rust 测试。两套后端共用
`tests/fixtures/backend-consistency.json`，对同一组账户、流水、设置和数据库版本场景执行操作，并核对完全相同的最终账本快照。

推送到 `main` 时，GitHub Actions 会自动执行上述测试、类型检查和代码检查。推送 `v*` 标签时，发布工作流会分别构建 Windows NSIS 安装包和使用项目 release keystore 签名的 Android ARM64 APK，验证签名后再创建 GitHub Release。

生产构建完成后：

```bash
NODE_ENV=production node .output/server/index.mjs
```

默认监听 `0.0.0.0:3000`，可以通过 `HOST` 和 `PORT` 修改。

## Tauri 桌面端

先安装当前平台的 [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)，然后运行：

```bash
npm run tauri -- dev
```

Tauri 构建使用 `NUXT_TAURI=true` 生成无 SSR 的静态页面，不会把 Nitro 服务端或 Web 数据库打进客户端。桌面端/Android 端的账本与服务器 Web 版相互独立。

## Android 调试包（Manjaro/Arch，无 rustup）

本仓库保留系统 `/usr/bin/rustc`，无需安装 rustup。准备 Android Studio/SDK/NDK、JDK 17 或 21，并安装与系统 Rust 同版本的标准库源码：

```bash
sudo pacman -S rust-src
npm run tauri:android:init
npm run tauri:android:build
```

辅助脚本会用系统 Rust 在 `src-tauri/target/` 内临时编译 `aarch64-linux-android` 标准库，并产出已用 Android debug key 签名的 ARM64 APK：

```text
src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

这是供真机试装的调试包，不是应用商店发布包。正式发布仍需配置自己的 Android keystore、构建 release APK/AAB，并完成真机回归测试。

## Docker 部署

```bash
docker compose up --build -d
```

应用会监听 <http://localhost:3000>。Compose 使用名为 `ledger-data` 的数据卷保存 SQLite 文件，重建容器不会丢失账本。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/ledger` | 获取账户、流水和设置快照 |
| `DELETE` | `/api/ledger` | 清空全部数据并恢复默认设置 |
| `POST` | `/api/ledger/restore` | 校验并覆盖恢复完整 JSON 备份 |
| `GET/POST` | `/api/accounts` | 查询或新建账户 |
| `PUT/DELETE` | `/api/accounts/:id` | 编辑或删除账户 |
| `PUT` | `/api/accounts/reorder` | 保存账户排序 |
| `GET/POST` | `/api/transactions` | 查询或新建流水 |
| `PUT/DELETE` | `/api/transactions/:id` | 修改或删除流水并重算相关账户余额 |
| `POST` | `/api/transfers` | 在同币种账户间执行原子转账 |
| `GET/POST` | `/api/ledger/integrity` | 检查或修复账户余额一致性 |
| `PUT` | `/api/settings` | 保存偏好设置 |

## 数据与迁移说明

- 在“设置 → 数据备份与恢复”中可以导出 `.json`、`.xlsx` 或 `.csv` 文件。JSON 是应用的完整无损恢复格式；Excel 文件按“说明、账户、流水、设置”分表保存；CSV 使用“记录类型”列保存账本数据。
- 选择 JSON 后，应用会先检查格式版本、数据库版本、账户与流水 ID、币种和关联关系并显示预览。确认覆盖恢复前必须先保存当前账本的 JSON 安全副本；数据库写入使用事务，任一步失败都会回滚，原账本不会被部分覆盖。
- 备份包含未遮罩的真实金额，应保存到可信位置。当前仅支持 JSON 覆盖恢复；CSV/Excel 导入与合并恢复尚未实现。
- Web 与 Tauri SQLite 都使用 `PRAGMA user_version` 记录 schema 版本。应用启动时按顺序执行缺失迁移，每一步使用事务，失败会回滚；如果数据库版本高于程序支持版本，程序会拒绝打开，避免旧程序破坏新数据。
- 当前 schema 版本为 `2`，备份格式版本为 `1`。v2 增加账户期初余额和转账关联编号；从 v1 升级时会根据原余额与已有流水反推出期初余额，不改变用户看到的余额。后续修改表结构时必须新增迁移步骤，不能直接改写已有迁移。
- Web 自动备份保存在数据库旁的 `automatic-backups` 目录；Windows/Android 自动备份保存在各自应用数据目录的 `automatic-backups` 中。自动备份同样包含真实金额，只保留最近 7 份。
- 原 Spring Boot/MyBatis-Plus 后端已移除，Git 历史仍可查看旧实现。
- 仓库中没有旧 MySQL 的表结构或数据文件，因此不会自动迁移现有 MySQL 数据。如果已有实际数据，应先保留数据库，再单独编写一次性导入脚本。
- 当前汇率是前端内置的固定演示值，不是实时牌价。涉及真实财务决策前，应接入可信汇率源并记录汇率日期。
- 有关联流水的账户会拒绝删除，必须先处理对应流水，避免级联误删账目。
