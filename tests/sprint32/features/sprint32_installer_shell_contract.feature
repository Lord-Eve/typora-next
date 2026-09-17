# Sprint 32: 安装期 Windows Shell 契约（快捷方式图标 + 图标文件编码）
# 对应产物: tauri.conf.json (bundle.windows.nsis.installerHooks)
#           nsis/hooks.nsh
#           icons/icon.ico
#
# 背景（2026-09-17 用户实机事故）：
# 用 NSIS 包重装后桌面快捷方式变成通用白图标，但点击仍能正常启动。
# 排查结论：.lnk 数据完好——target 指向正确的 app.exe 且文件存在，Shell API 能从
# .lnk 解析出正常的应用图标，exe 的内嵌图标资源也正常。真正的链条是：
#   1) NSIS 生成的 .lnk 不带显式 IconLocation（空，`,0`），图标完全靠系统
#      「回退去读 target exe 的内嵌图标资源」；
#   2) 重装时旧卸载器先删掉 $INSTDIR（含 app.exe）。此刻已存在的 .lnk 指向一个
#      不存在的图标源，Windows 就把「该源没有图标」写进 iconcache_*.db；
#   3) 新安装器随后放回 exe，但那条坏缓存没人作废 → 桌面一直白图标。
#
# 另一个已知来源：icons/icon.ico 原先 16~64px 全部使用 PNG 编码。
# Windows 对小尺寸 PNG 条目的支持历史上不完整，是 shell 白图标的常见成因，
# 因此 16~64px 用 BMP(DIB)、只给 256 保留 PNG。
#
# 注意：本仓库的 feature 解析器只认英文关键字（Feature/Scenario/Given/When/Then/And），
# 中文关键字行会被静默忽略导致场景空跑。

Feature: 安装期 Windows Shell 契约

  As a Windows desktop user
  I want shortcuts and app icons to stay correct after reinstall/update
  So that a white generic icon never replaces the app icon

  Scenario: 快捷方式使用显式图标路径而非空回退
    Given the real installer artifacts
    Then the installer hooks should set an explicit icon location on shortcuts
    And the hooks should only touch shortcuts that already exist

  Scenario: 安装结束强制 Shell 刷新图标与关联缓存
    Given the real installer artifacts
    Then the post-install hook should force a shell icon refresh
    And the nsis installer hooks file should be wired in the bundle config

  Scenario: 小尺寸图标不使用 PNG 编码
    Given the real installer artifacts
    Then the icon should carry the standard shell sizes
    And the small icon entries should use bmp encoding
    And the large icon entry should keep png encoding
