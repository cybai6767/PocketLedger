# 我的记账本 v1.0.2

本次版本重点完善数据安全、跨平台一致性与正式发布流程。

## 更新内容

- 新增 CSV 与 Excel 完整账本导出，包含账户、流水、设置和备份版本信息。
- 修复 Excel 导出工作表出现大量无用空白列的问题，并统一两个导出按钮的样式。
- Web 与 Tauri SQLite 增加版本化迁移，升级时保留已有账本，并阻止旧程序误开更高版本数据库。
- 新增 TypeScript/Rust 共享契约测试，确保网页、Windows 和 Android 的账户、流水、余额及设置行为一致。
- 为 Tauri 桌面和 Android 启用内容安全策略（CSP），限制外部脚本、网络连接和页面嵌入。
- Android APK 改用项目专属 release keystore 正式签名，不再使用 Android debug key。
- 新增 GitHub Actions：自动运行质量检查，并在推送版本标签时构建 Windows 安装包和签名 Android APK。

## 下载说明

- Windows 11/10 64 位：下载 `accounting-tool-v1.0.2-windows-x64-setup.exe`。
- Android ARM64：下载 `accounting-tool-v1.0.2-android-arm64-release.apk`。

Windows 安装包暂未购买商业 Authenticode 证书，SmartScreen 可能显示“未知发布者”；请确认文件来自本仓库 Release 页面。Android APK 已使用项目专属发布密钥签名，请妥善保留同一密钥，以便后续版本可以覆盖安装。
