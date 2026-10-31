# 口袋账本 v1.0.6 · 2026-10-31

本次更新修复 Android 上无法读取 JSON 备份的问题。v1.0.4 导出的完整备份可以在 v1.0.6 中恢复。

## 更新内容

- 修复“选择 JSON 备份”打不开或选中后没有反应的问题。手机文件选择器不再按 `application/json` 过滤，下载目录里的 `.json` 备份可以直接点选。
- 修复备份里空备注写成 `null` 时被拒绝的问题。v1.0.4 导出的 JSON 现在可以通过检查并恢复。
- “读取最近自动备份”的结果和失败原因会显示在按钮下方。卸载或重装会清掉手机里的自动备份，这种情况请改用以前导出的 JSON 文件。
- 已安装 v1.0.5 的用户可以直接覆盖安装。v1.0.4 及更早版本仍需先导出备份、卸载旧版，再安装并恢复。

## 下载与安装

| 平台 | 安装包 |
| --- | --- |
| Android ARM64 | `PocketLedger-v1.0.6-android-arm64.apk` |
| Windows 10/11 x64 | `PocketLedger-v1.0.6-windows-x64.exe` |
| Ubuntu 24.04+ / Linux AMD64 | `PocketLedger-v1.0.6-linux-amd64.deb` |

Ubuntu 下载后，在文件所在目录运行：

```bash
sudo apt install ./PocketLedger-v1.0.6-linux-amd64.deb
```

Release 同时提供 `SHA256SUMS.txt`。Android 签名与 v1.0.5 相同。Windows 安装包尚未使用商业 Authenticode 证书。

旧版本更新内容见 [更新历史](CHANGELOG.md)。
