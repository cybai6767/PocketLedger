<div align="center">

<img src="src-tauri/icons/128x128.png" width="80" height="80" alt="PocketLedger 应用图标">

# PocketLedger

**让每一笔收支，都清清楚楚。**

支持 Web、Windows 和 Android 的个人记账工具。
管理账户、记录收支、查看资产变化，桌面与 Android 端可离线使用。

[![质量检查](https://github.com/bcielai321/PocketLedger/actions/workflows/quality.yml/badge.svg)](https://github.com/bcielai321/PocketLedger/actions/workflows/quality.yml)
[![最新版本](https://img.shields.io/github/v/release/bcielai321/PocketLedger)](https://github.com/bcielai321/PocketLedger/releases/latest)

[下载安装](https://github.com/bcielai321/PocketLedger/releases/latest) · [快速开始](#快速开始) · [架构说明](docs/architecture.md) · [English](README.md)

</div>

## 看清自己的财务状况

| 离线也能记账 | 收支一目了然 | 数据可以带走 |
| --- | --- | --- |
| Windows 和 Android 使用设备本机 SQLite 保存账本。 | 查看净资产、本月收支和最近 12 个月趋势。 | 导出 JSON、CSV 或 Excel，通过 JSON 恢复完整账本。 |

## 主要功能

- **账户管理：**现金、银行卡、信用卡、投资、负债、钱包等账户，支持编辑与排序。
- **收支记录：**新增、修改、删除流水，按账户筛选和关键词搜索。
- **账户转账：**新增、修改和删除同币种账户之间的原子转账，不计入普通收入或支出统计。
- **财务报表：**净资产、本月收支、分类报表和趋势；支持 CNY、HKD、USD、EUR、USDT、BTC。
- **数据保护：**修改前自动快照、余额检查与修复、数据库版本迁移、事务性 JSON 恢复。
- **个性设置：**完整界面与导出内容可切换简体中文或英文，并支持明暗主题、金额遮罩和基准币种。

## 下载与使用

| 平台 | 使用方式 | 数据位置 |
| --- | --- | --- |
| Windows x64 | 从 [Releases](https://github.com/bcielai321/PocketLedger/releases/latest) 下载 `.exe` 安装包。 | 电脑应用数据目录 |
| Android ARM64 | 从 [Releases](https://github.com/bcielai321/PocketLedger/releases/latest) 下载正式版 `.apk`。 | 手机应用数据目录 |
| Web / 自部署 | 使用下面的 Node.js 或 Docker 方式启动。 | 服务器 SQLite |

已有发布包可能仍显示旧名称“我的记账本 / accounting-tool”。当前源码已改名为 PocketLedger，文档更新不会替换已经发布的安装包。

## 快速开始

要求 Node.js **22.x 的 22.19 及以上、24.x 的 24.11 及以上，或 26 及以上**。

```bash
git clone https://github.com/bcielai321/PocketLedger.git
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
- **各端数据独立：**Web、桌面和 Android 不会自动同步。JSON 恢复是覆盖目标账本，不支持合并。
- **汇率为演示值：**使用内置固定汇率，不提供实时或历史牌价。
- **导入格式：**仅支持 JSON 恢复；CSV 和 Excel 目前只支持导出。
- **备份隐私：**即使界面遮罩金额，导出文件仍包含真实金额。自动快照保留最近七份，与数据库存于同一设备或服务器，并非独立云备份。

## 开发者入口

共享 Vue 界面，通过两条路径保存数据：Web 使用 **Nuxt / Nitro → SQLite**，桌面和 Android 使用 **Tauri IPC → Rust → SQLite**。

| 文档 | 内容 |
| --- | --- |
| [架构说明（英文）](docs/architecture.md) | 数据路径、目录、存储、API 和兼容性 |
| [开发指南（英文）](docs/development.md) | 环境准备、测试、构建、发布与贡献检查 |
| [移动端回归（英文）](docs/mobile-regression.md) | 可重复运行的窄屏场景和 Android 真机检查清单 |

技术栈为 Nuxt 4、Vue 3、TypeScript、Tauri 2、Rust 和 SQLite。欢迎通过 [Issues](https://github.com/bcielai321/PocketLedger/issues) 反馈问题，或提交范围明确的 [Pull Request](https://github.com/bcielai321/PocketLedger/pulls)。
