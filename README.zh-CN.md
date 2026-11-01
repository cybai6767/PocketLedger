<div align="center">

<img src="src-tauri/icons/128x128.png" width="80" height="80" alt="PocketLedger 应用图标">

# PocketLedger

**让每一笔收支，都清清楚楚。**

支持 Web、Windows、Linux 和 Android 的个人记账工具。
管理账户、记录收支、查看资产变化，桌面与 Android 端可离线使用。

[![质量检查](https://github.com/cybai6767/PocketLedger/actions/workflows/quality.yml/badge.svg)](https://github.com/cybai6767/PocketLedger/actions/workflows/quality.yml)
[![最新版本](https://img.shields.io/github/v/release/cybai6767/PocketLedger)](https://github.com/cybai6767/PocketLedger/releases/latest)

[下载安装](https://github.com/cybai6767/PocketLedger/releases/latest) · [快速开始](#快速开始) · [更新内容](RELEASE_NOTES.md) · [架构说明](docs/architecture.md) · [English](README.md)

</div>

## 看清自己的财务状况

| 离线也能记账 | 收支一目了然 | 数据可以带走 |
| --- | --- | --- |
| Windows、Linux 和 Android 使用设备本机 SQLite 保存账本。 | 按月查看收入、支出、结余，结合全年对比、每日花费和分类排行了解资金去向。 | 导出与恢复 JSON、CSV、Excel，并支持多选备份文件。 |

## 主要功能

- **账户管理：**现金、银行卡、信用卡、投资、负债、钱包等账户，支持编辑与排序。
- **收支记录：**最近流水按日期展示最近 8 个有记录的日期；“查看更多”进入按月倒序排列的全部流水，展开月份查看每日明细，支持账户筛选、关键词搜索及编辑删除。
- **账户转账：**新增、修改和删除同币种账户之间的原子转账，不计入普通收入或支出统计。
- **财务报表：**首页月度账单支持切换月份，直接查看收入、支出、结余、结余率和支出环比；在“报表”中集中查看全年收支对比、每月明细、每日花费、分类排行和流水，报表内可直接切换年月。结余与当前净资产分开显示，支持 CNY、HKD、USD、EUR、USDT、BTC。
- **数据保护：**修改前自动快照、余额检查与修复、数据库版本迁移、事务性 JSON 恢复。
- **个性设置：**完整界面与导出内容可切换简体中文或英文，并支持明暗主题、金额遮罩和基准币种。
- **清晰导航：**首页、报表、记一笔、账户、设置五个入口；记一笔包含收支录入和账户转账，报表内分为“流水”和“统计报表”两个子页。Android 使用底部五栏导航，居中的加号用于记一笔；桌面和 Web 保留原有导航位置。资产与本月收支汇总卡仅在首页显示。

## 下载与使用

| 平台 | 使用方式 | 数据位置 |
| --- | --- | --- |
| Windows x64 | 从 [Releases](https://github.com/cybai6767/PocketLedger/releases/latest) 下载 `.exe` 安装包。 | 电脑应用数据目录 |
| Linux AMD64（Ubuntu 24.04+） | 从 [Releases](https://github.com/cybai6767/PocketLedger/releases/latest) 下载 `.deb` 安装包。 | 电脑应用数据目录 |
| Android ARM64 | 从 [Releases](https://github.com/cybai6767/PocketLedger/releases/latest) 下载正式版 `.apk`。 | 手机应用数据目录 |
| Web / 自部署 | 使用下面的 Node.js 或 Docker 方式启动。 | 服务器 SQLite |

Android 自 v1.0.5 起使用新发布签名，v1.0.5 可直接覆盖升级；v1.0.4 及更早版本需先导出 JSON 备份，再卸载旧版、安装新版并恢复。详情见 [更新说明](RELEASE_NOTES.md)。

安装后的应用使用中文名称“口袋账本”；发布文件使用 PocketLedger 和平台/架构命名，便于识别下载。

## 快速开始

要求 Node.js **22.x 的 22.19 及以上、24.x 的 24.11 及以上，或 26 及以上**。

```bash
git clone https://github.com/cybai6767/PocketLedger.git
cd PocketLedger
npm ci
npm run dev
```

打开 [localhost:3000](http://localhost:3000)。应用自动创建 `data/accounting.sqlite`，无需安装独立数据库服务。

也可以在仓库目录使用 Docker：

```bash
docker compose up --build -d
```

应用监听 `3000` 端口，`ledger-data` 数据卷持久保存数据库和自动备份。

## 使用前了解

- **单用户账本：**没有内置登录或多人权限；对外部署 Web 版时需要限制访问。
- **各端数据独立：**Web、桌面和 Android 不会自动同步。“导入账单”默认追加到当前账本；“备份与恢复”才整本覆盖，操作前自动留快照，不强制下载 JSON。
- **汇率为演示值：**使用内置固定汇率，不提供实时或历史牌价。
- **导入格式：**支持 JSON、本应用 CSV/Excel 及随手记收支表格，可预览账户对应、余额策略、重复与异常行，并保留原始字段。导入完成后、继续修改账本前可撤销。完整迁移优先使用 JSON；旧表格若无转账 ID，无法可靠还原转账关联。
- **备份隐私：**即使界面遮罩金额，导出文件仍包含真实金额。自动快照保留最近七份，与数据库存于同一设备或服务器，并非独立云备份。

## 开发者入口

共享 Vue 界面，通过两条路径保存数据：Web 使用 **Nuxt / Nitro → SQLite**，桌面和 Android 使用 **Tauri IPC → Rust → SQLite**。

| 文档 | 内容 |
| --- | --- |
| [架构说明（英文）](docs/architecture.md) | 数据路径、目录、存储、API 和兼容性 |
| [开发指南（英文）](docs/development.md) | 环境准备、测试、构建、发布与贡献检查 |
| [移动端回归（英文）](docs/mobile-regression.md) | 可重复运行的窄屏场景和 Android 真机检查清单 |

技术栈为 Nuxt 4、Vue 3、TypeScript、Tauri 2、Rust 和 SQLite。欢迎通过 [Issues](https://github.com/cybai6767/PocketLedger/issues) 反馈问题，或提交范围明确的 [Pull Request](https://github.com/cybai6767/PocketLedger/pulls)。
