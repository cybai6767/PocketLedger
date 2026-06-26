accounting-tool | 个人财务管理系统




中文 | English

项目简介
accounting-tool 是一个基于现代技术栈（Spring Boot 3 + Vue 3）开发的个人财务记账与资产管理系统。该项目旨在帮助个人用户实现资产的统一管理，涵盖现金、银行卡、投资账户、债务等多维度数据。
它不仅是一个实用的记账工具，也是初学者学习全栈开发（前后端分离、权限控制、Docker 部署）的理想参考项目。
核心功能

多账户资产管理：统一管理现金、信用卡、投资账户、平台钱包（支付宝/微信等）。
收支流水记录：支持多维度筛选、分类记账，清晰掌握资金去向。
预算与提醒：自定义月度/年度预算，支持账单到期自动提醒。
可视化统计：内置图表分析收支趋势、资产占比。
安全保障：基于 JWT 的权限控制，支持操作日志审计。
便捷部署：支持 Docker 一键容器化部署。

技术栈
后端 (Backend)

核心框架：Spring Boot 3.x
持久层：MyBatis-Plus (简化 CRUD 操作)
数据库：MySQL 8.0
权限校验：Spring Security + JWT
工具类：Lombok, Hutool

前端 (Frontend)

框架：Vue 3 (Composition API)
构建工具：Vite
状态管理：Pinia
UI 组件库：Element Plus
图表库：ECharts / AntV


Introduction
accounting-tool is a comprehensive personal finance and asset management system built with a modern tech stack (Spring Boot 3 + Vue 3). It helps users manage various assets including cash, bank cards, investments, and debts in one centralized platform.
Key Features

Multi-Account Management: Manage cash, credit cards, investment accounts, and digital wallets.
Transaction Tracking: Support for categorized logging and multi-dimensional data filtering.
Budget & Alerts: Set monthly/yearly budgets with automated bill reminders.
Data Visualization: Built-in analytics for income/expense trends and asset distribution.
Security: Robust permission control via JWT and detailed operation logging.
Deployment: Ready for Docker containerization.

Tech Stack

Backend: Spring Boot, MyBatis-Plus, MySQL, JWT, Redis.
Frontend: Vue 3, Vite, Pinia, Element Plus, TypeScript.


快速开始 | Quick Start
1. 环境准备 (Prerequisites)

JDK 17+
Node.js 18+
MySQL 8.0+
Maven 3.8+

2. 后端配置 (Backend Setup)
sh复制# 1. 克隆项目git clone https://github.com/your-username/accounting-tool.git
# 2. 修改 application.yml 中的数据库连接配置# 3. 运行项目mvn clean installjava -jar target/accounting-tool.jar

3. 前端配置 (Frontend Setup)
sh复制cd frontend
# 安装依赖npm install
# 启动开发服务器npm run dev
# 构建生产环境npm run build

4. Docker 部署 (Docker Deployment)
sh复制docker-compose up -d


项目结构 | Project Structure
📝Write📋复制accounting-tool
├── sql/                    # 数据库脚本
├── backend/                # Spring Boot 后端源码
│   ├── src/main/java       # 业务逻辑
│   └── src/main/resources  # 配置文件
└── frontend/               # Vue 3 前端源码
    ├── src/api             # 接口请求
    ├── src/views           # 页面组件
    └── src/store           # 状态管理