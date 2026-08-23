# 我的记账本

一个基于 **Nuxt 4 + Vue 3 + Nitro + SQLite** 的个人财务记账全栈应用。前端页面、服务端 API、数据校验和数据库都在同一个 TypeScript 仓库中，开发和部署只需要启动一个 Node.js 服务。

## 已实现功能

- 账户的新增、编辑、删除和拖拽排序
- 现金、银行卡、信用卡、投资、负债、钱包等账户类型
- CNY、HKD、USD、EUR、USDT、BTC 多币种展示和基准币种折算
- 收入、支出流水记录，支持账户筛选和关键词搜索
- 新增/删除流水时自动更新或还原账户余额
- 净资产、本月收支、12 个月趋势和本月支出分类报表
- 金额遮罩、明暗主题和基准货币服务端持久化
- SQLite 自动建表、参数校验、错误反馈和响应式界面

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
app/                    Vue 页面、组件和客户端状态
server/api/             Nitro HTTP API
server/utils/           SQLite 初始化、数据仓库和校验
shared/types/           前后端共享 TypeScript 契约
tests/                  数据层单元测试
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
npm test
npm run typecheck
npm run lint
npm run build
```

生产构建完成后：

```bash
NODE_ENV=production node .output/server/index.mjs
```

默认监听 `0.0.0.0:3000`，可以通过 `HOST` 和 `PORT` 修改。

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
| `GET/POST` | `/api/accounts` | 查询或新建账户 |
| `PUT/DELETE` | `/api/accounts/:id` | 编辑或删除账户 |
| `PUT` | `/api/accounts/reorder` | 保存账户排序 |
| `GET/POST` | `/api/transactions` | 查询或新建流水 |
| `DELETE` | `/api/transactions/:id` | 删除流水并还原余额 |
| `PUT` | `/api/settings` | 保存偏好设置 |

## 数据与迁移说明

- 原 Spring Boot/MyBatis-Plus 后端已移除，Git 历史仍可查看旧实现。
- 仓库中没有旧 MySQL 的表结构或数据文件，因此不会自动迁移现有 MySQL 数据。如果已有实际数据，应先保留数据库，再单独编写一次性导入脚本。
- 当前汇率是前端内置的固定演示值，不是实时牌价。涉及真实财务决策前，应接入可信汇率源并记录汇率日期。
- 删除账户会同时删除该账户下的流水；界面会在执行前要求确认。
