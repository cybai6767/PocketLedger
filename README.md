Markdown
# Accounting Tool 💰

🌍 *[English](#english-version) | [中文版](#中文版本)*

---

<h2 id="中文版本">🇨🇳 中文版本</h2>

### 📖 项目简介
本项目是一个全栈开发的个人财务记账与资产管理系统。专为个人用户设计，旨在帮助用户摆脱糊涂账，实现对现金、银行卡、信用卡、投资账户、债务账户以及各类平台钱包的统一管理与精细化追踪。

### ✨ 功能特性
* **🔐 账户与权限管理：** 支持用户注册、安全登录以及基础的权限控制机制。
* **💼 全面资产管理：** 集中管理各类资产（现金、储蓄卡、信用卡、理财投资、负债等）。
* **📝 交易流水记录：** 快速记录日常收支流水，支持自定义交易分类与备注。
* **📊 统计与分析：** 提供多维度的收支统计图表与数据筛选功能，财务状况一目了然。
* **⏰ 预算与提醒：** 支持设置月度/分类预算，并在超支或有待缴账单时进行提醒。
* **📁 扩展功能：** 支持相关财务文件的上传与管理、系统关键操作日志记录。
* **🐳 快速部署：** 完善的 Docker 支持，可快速实现容器化部署。

### 🛠️ 技术栈
* **前端 (Frontend):** Vue 3, Vite, TypeScript
* **后端 (Backend):** Spring Boot, MyBatis-Plus, Java
* **数据库 (Database):** MySQL

### 🚀 快速开始

#### 环境要求
* Node.js 16+
* JDK 1.8 或 11+
* MySQL 8.0+

#### 1. 克隆项目
```sh
git clone [https://github.com/your-username/accounting-tool.git](https://github.com/your-username/accounting-tool.git)
2. 后端配置
在 MySQL 中创建名为 accounting 的数据库。

导入后端目录下的 schema.sql (如有) 初始化表结构。

修改 application.yml 中的数据库连接信息（用户名、密码）。

运行 Spring Boot 主启动类。

3. 前端配置与运行
进入前端项目目录：

Bash
# 安装依赖
npm install

# 启动开发服务器 (支持热更新)
npm run dev

# 生产环境编译打包
npm run build

# 代码格式化与检查
npm run lint

📖 Introduction
Accounting Tool is a full-stack personal finance and asset management system. Designed specifically for individual users, it helps you keep track of your money and centrally manage your cash, bank cards, credit cards, investment accounts, debts, and various digital wallets.

✨ Features
🔐 User System: Secure user registration, login, and Role-Based Access Control (RBAC).

💼 Asset Management: Unified dashboard for diverse assets (Cash, Debit/Credit Cards, Investments, Debts).

📝 Transaction Tracking: Easily record daily income and expenses with customizable categories.

📊 Data Analytics: Visualized charts and multi-dimensional data filtering for clear financial insights.

⏰ Budgets & Alerts: Set monthly or category-specific budgets, and receive notifications for overspending or upcoming bills.

📁 Advanced Tools: Supports financial document uploads, system operation logs, and secure data storage.

🐳 Deployment: Docker-ready for quick and isolated container deployment.

🛠️ Tech Stack
Frontend: Vue 3, Vite, TypeScript

Backend: Spring Boot, MyBatis-Plus, Java

Database: MySQL

🚀 Quick Start
Prerequisites
Node.js 16+

JDK 1.8 or 11+

MySQL 8.0+

1. Clone the repository
Bash
git clone [https://github.com/your-username/accounting-tool.git](https://github.com/your-username/accounting-tool.git)
2. Backend Setup
Create a database named accounting in MySQL.

Execute the provided schema.sql (if any) to initialize the tables.

Update the database credentials in the application.yml file.

Run the Spring Boot application.

3. Frontend Setup
Navigate to the frontend directory:

Bash
# Install dependencies
npm install

# Compile and Hot-Reload for Development
npm run dev

# Type-Check, Compile and Minify for Production
npm run build

# Lint with ESLint
npm run lint

### 修改建议：
1. **替换占位符**：把里面的 `https://github.com/your-username/accounting-tool.git` 换成你真实的 GitHub 或 Gitee 仓库地址。
2. **Node.js 和 JDK 版本**：我在文档中写了常见的 Node 16+ 和 JDK 1.8/11+，你可以根据你实际开发使用的版本进行微调。