# accounting-tool | 个人财务管理系统

> 基于 Spring Boot 3 + Vue 3 的个人财务记账与资产管理系统，支持多账户管理、收支记录、预算提醒、数据可视化和 Docker 部署。

## 中文文档

### 项目简介

`accounting-tool` 是一个基于现代全栈技术栈开发的个人财务管理系统，后端采用 `Spring Boot 3`，前端采用 `Vue 3`。项目主要面向个人用户，帮助用户统一管理现金、银行卡、信用卡、投资账户、债务以及第三方平台钱包等资产信息。

该系统不仅可以作为日常记账和资产管理工具使用，也适合作为全栈开发学习项目，涵盖前后端分离开发、用户认证与权限控制、数据统计分析、接口设计、数据库建模以及 Docker 容器化部署等常见实践场景。

### 核心功能

- **多账户资产管理**  
  支持现金账户、银行卡、信用卡、投资账户、平台钱包等多种账户类型，方便用户统一管理个人资产。

- **收支流水记录**  
  支持收入、支出、转账等流水记录，可按账户、分类、时间范围等条件进行筛选和查询。

- **分类记账管理**  
  支持自定义收入和支出分类，帮助用户更清晰地了解资金来源与消费去向。

- **预算与提醒**  
  支持设置月度或年度预算，并可对账单到期、预算超支等场景进行提醒。

- **可视化统计分析**  
  通过图表展示收支趋势、资产占比、分类支出等数据，帮助用户直观了解财务状况。

- **权限与安全控制**  
  基于 `Spring Security + JWT` 实现用户认证与接口权限校验，提升系统安全性。

- **操作日志审计**  
  记录关键操作日志，便于追踪系统使用情况和排查问题。

- **Docker 快速部署**  
  支持通过 `Docker Compose` 一键启动项目，降低部署和运行成本。

### 技术栈

#### 后端技术

| 技术 | 说明 |
|---|---|
| Spring Boot 3.x | 后端核心开发框架 |
| Spring Security | 用户认证与权限控制 |
| JWT | 无状态身份认证 |
| MyBatis-Plus | 简化数据库 CRUD 操作 |
| MySQL 8.0 | 关系型数据库 |
| Lombok | 简化 Java 实体类代码 |
| Hutool | 常用 Java 工具类库 |
| Maven | 项目构建与依赖管理 |

#### 前端技术

| 技术 | 说明 |
|---|---|
| Vue 3 | 前端核心框架 |
| Composition API | Vue 3 组合式 API |
| Vite | 前端构建工具 |
| Pinia | 状态管理 |
| Element Plus | UI 组件库 |
| ECharts / AntV | 数据可视化图表库 |
| Axios | HTTP 请求库 |

### 快速开始

#### 环境要求

在运行项目前，请确保本地环境已安装以下软件：

- JDK 17+
- Node.js 18+
- MySQL 8.0+
- Maven 3.8+
- Docker 与 Docker Compose，可选

#### 克隆项目

```bash
git clone <REPO_URL>
cd accounting-tool
```

#### 后端启动

```bash
cd backend
```

修改 `src/main/resources/application.yml` 中的数据库连接信息：

```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/accounting_tool?useUnicode=true&characterEncoding=utf-8&serverTimezone=Asia/Shanghai
    username: root
    password: your_password
```

导入数据库脚本：

```bash
mysql -u root -p accounting_tool < ../sql/init.sql
```

编译并启动后端服务：

```bash
mvn clean install
java -jar target/accounting-tool.jar
```

后端服务默认运行地址：

```text
http://localhost:8080
```

#### 前端启动

```bash
cd frontend
npm install
npm run dev
```

前端开发服务默认运行地址：

```text
http://localhost:5173
```

#### 前端生产构建

```bash
npm run build
```

#### Docker 部署

如果项目已提供 `docker-compose.yml`，可以使用以下命令一键启动：

```bash
docker-compose up -d
```

停止服务：

```bash
docker-compose down
```

### 项目结构

```text
accounting-tool
├── sql/                    # 数据库脚本
├── backend/                # Spring Boot 后端源码
│   ├── src/main/java       # Java 业务逻辑代码
│   └── src/main/resources  # 配置文件
├── frontend/               # Vue 3 前端源码
│   ├── src/api             # 接口请求封装
│   ├── src/views           # 页面组件
│   ├── src/store           # Pinia 状态管理
│   └── src/router          # 前端路由配置
├── docker-compose.yml      # Docker Compose 配置文件
└── README.md               # 项目说明文档
```

### 适用场景

该项目适合以下用户或学习场景：

- 想要管理个人资产和日常收支的个人用户
- 正在学习 Spring Boot 3 后端开发的初学者
- 正在学习 Vue 3 前端开发的开发者
- 想了解前后端分离项目结构的学习者
- 想实践 JWT 登录认证、权限控制和 Docker 部署的开发者

### 后续规划

- 支持多用户独立账本
- 支持账单导入与导出
- 支持更多统计维度
- 支持移动端适配
- 支持定期账单自动生成
- 支持资产负债表分析
- 支持多币种账户管理

### 许可证

本项目仅供学习和参考使用，具体开源协议请根据实际情况补充。

---

# accounting-tool | Personal Finance Management System

> A personal finance and asset management system built with Spring Boot 3 and Vue 3. It supports multi-account management, transaction tracking, budgeting, data visualization, permission control, and Docker deployment.

## English Documentation

### Introduction

`accounting-tool` is a modern full-stack personal finance management system built with `Spring Boot 3` on the backend and `Vue 3` on the frontend. It is designed to help individual users manage different types of assets in one place, including cash, bank cards, credit cards, investment accounts, debts, and third-party digital wallets.

This project can be used not only as a practical bookkeeping and asset management tool, but also as a reference project for beginners learning full-stack development. It covers common development scenarios such as frontend-backend separation, user authentication, permission control, API design, database modeling, data visualization, and Docker-based deployment.

### Features

- **Multi-account Asset Management**  
  Manage cash accounts, bank cards, credit cards, investment accounts, digital wallets, and other asset types in a unified way.

- **Transaction Records**  
  Record income, expenses, and transfers. Filter transactions by account, category, date range, and other conditions.

- **Category-based Bookkeeping**  
  Customize income and expense categories to better understand where money comes from and where it goes.

- **Budget and Reminders**  
  Set monthly or yearly budgets and receive reminders for bill due dates, budget overruns, and other financial events.

- **Data Visualization**  
  Display income and expense trends, asset distribution, category-based spending, and other financial statistics through charts.

- **Authentication and Security**  
  Use `Spring Security + JWT` for user authentication and API permission control.

- **Operation Audit Logs**  
  Record important user operations for better traceability and troubleshooting.

- **Docker Deployment**  
  Support one-click deployment using `Docker Compose`.

### Tech Stack

#### Backend

| Technology | Description |
|---|---|
| Spring Boot 3.x | Backend framework |
| Spring Security | Authentication and authorization |
| JWT | Stateless authentication |
| MyBatis-Plus | Simplified CRUD operations |
| MySQL 8.0 | Relational database |
| Lombok | Reduces boilerplate Java code |
| Hutool | Java utility library |
| Maven | Dependency and build management |

#### Frontend

| Technology | Description |
|---|---|
| Vue 3 | Frontend framework |
| Composition API | Vue 3 composition-style development |
| Vite | Frontend build tool |
| Pinia | State management |
| Element Plus | UI component library |
| ECharts / AntV | Data visualization libraries |
| Axios | HTTP request library |

### Quick Start

#### Prerequisites

Before running the project, make sure the following software is installed:

- JDK 17+
- Node.js 18+
- MySQL 8.0+
- Maven 3.8+
- Docker and Docker Compose, optional

#### Clone the Project

```bash
git clone <REPO_URL>
cd accounting-tool
```

#### Backend Setup

```bash
cd backend
```

Update the database configuration in `src/main/resources/application.yml`:

```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/accounting_tool?useUnicode=true&characterEncoding=utf-8&serverTimezone=Asia/Shanghai
    username: root
    password: your_password
```

Import the database script:

```bash
mysql -u root -p accounting_tool < ../sql/init.sql
```

Build and start the backend service:

```bash
mvn clean install
java -jar target/accounting-tool.jar
```

The backend service will be available at:

```text
http://localhost:8080
```

#### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend development server will be available at:

```text
http://localhost:5173
```

#### Production Build

```bash
npm run build
```

#### Docker Deployment

If the project provides a `docker-compose.yml` file, you can start the project with:

```bash
docker-compose up -d
```

To stop the services:

```bash
docker-compose down
```

### Project Structure

```text
accounting-tool
├── sql/                    # Database scripts
├── backend/                # Spring Boot backend source code
│   ├── src/main/java       # Java business logic
│   └── src/main/resources  # Configuration files
├── frontend/               # Vue 3 frontend source code
│   ├── src/api             # API request modules
│   ├── src/views           # Page components
│   ├── src/store           # Pinia state management
│   └── src/router          # Frontend router configuration
├── docker-compose.yml      # Docker Compose configuration
└── README.md               # Project documentation
```

### Use Cases

This project is suitable for:

- Individual users who want to manage personal assets and daily expenses
- Beginners learning Spring Boot 3 backend development
- Developers learning Vue 3 frontend development
- Learners who want to understand frontend-backend separated architecture
- Developers practicing JWT authentication, permission control, and Docker deployment

### Roadmap

- Support multiple users and independent ledgers
- Support transaction import and export
- Add more financial statistics dimensions
- Improve mobile responsiveness
- Support recurring bill generation
- Add balance sheet analysis
- Support multi-currency account management

### License

This project is for learning and reference purposes. Please add a proper open-source license according to your actual requirements.

---