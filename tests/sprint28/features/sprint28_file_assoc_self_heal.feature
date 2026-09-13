# language: zh-CN
#
# Sprint 28：文件关联自愈
#
# 背景（2026-09-10 用户实机事故）：
# Tauri NSIS 更新流程先静默运行旧版 uninstall.exe，卸载器删除
# HKCU\Software\Classes 下的 "Markdown Document" ProgID 与打开命令，
# 更新模式的新安装器不写回 → 更新后双击 .md 找不到应用。
#
# 可执行层说明：注册表 IO 超出 JS bdd-acceptance 层范围，
# 本 feature 的可执行规格为 src-tauri/tests/file_assoc_test.rs
# （#[path] include 纯逻辑 + 真实 HKCU scratch 键 round-trip）。
# 场景与测试一一对应，场景名即测试名。

功能: 启动时文件关联自检自愈
  作为 Windows 桌面用户
  我希望应用更新后双击 .md 仍能打开 TyporaNext
  即使更新过程删除了文件关联注册表项

  场景: NSIS 更新删除 ProgID 后启动自愈
    假如 ".md" 扩展名映射仍指向 "Markdown Document"
    且 "Markdown Document" ProgID 的名称、图标、打开命令键已被删除
    当 应用启动执行关联自检
    那么 "Markdown Document" ProgID 的名称、图标、打开命令被重建
    且 打开命令指向当前 exe 路径
    且 ".md" 扩展名映射不被重写

  场景: 打开命令指向旧安装路径时重写
    假如 "Markdown Document" 的打开命令指向已被覆盖安装抹掉的旧路径
    当 应用启动执行关联自检
    那么 打开命令和图标被重写为当前 exe 路径

  场景: 关联完好时不做任何写操作
    假如 所有关联键均存在且指向当前 exe 路径
    当 应用启动执行关联自检
    那么 修复计划为空（零写入）

  场景: 用户已把 .md 默认程序设为其他应用时不劫持
    假如 ".md" 扩展名映射指向其他应用的 ProgID
    当 应用启动执行关联自检
    那么 ".md" 扩展名映射保持不变
    且 "Markdown Document" ProgID 仍被修复
    且 ".md" 的 OpenWithProgids 列表中补充 "Markdown Document"

  场景: OpenWithProgids 只增不删
    假如 ".md" 的 OpenWithProgids 列表中已有其他应用的 ProgID
    且 缺少 "Markdown Document"
    当 应用启动执行关联自检
    那么 仅追加 "Markdown Document"，已有条目不受影响

  场景: 修复可幂等重复执行
    假如 关联自检刚刚完成修复
    当 再次执行关联自检
    那么 修复计划为空（零写入）
