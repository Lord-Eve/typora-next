# Sprint 29 PB2: 设置面板分组重构与配置可靠性
# 对应模块: settings-panel.js (前端, 从 main.js 抽取), lib.rs AppConfig
#
# 背景（调研确认的三个真问题）：
#   1. 所有设置项平铺在一个 480px modal 里，无分组无 tab，AI/minerU/外观混杂
#   2. saveSettings 只回写 9 个字段，set_config 全量覆盖 → 每次保存清空
#      sidebar_collapsed / sidebar_active_tab / last_file（实锤 bug）
#   3. Word 导出模板存 localStorage，与主配置分裂

Feature: 设置面板分组与配置可靠性

  作为需要配置多个服务的用户
  我想要设置项按用途分组展示，且保存不丢状态
  以便快速找到配置项并信任保存操作

  Background:
    Given 用户已打开设置面板

  Scenario: 设置项按分组展示
    Then 显示 AI 设置分组
    And 显示论文服务设置分组
    And 显示外观设置分组

  Scenario: 论文分组包含 AnySearch 配置项
    Then 论文服务分组包含 AnySearch API key 输入框

  Scenario: 保存配置包含 AnySearch key
    When 用户在 AnySearch API key 输入框输入“as_sk_test123”
    And 点击保存设置
    Then 保存的配置包含 anysearch_api_key 为“as_sk_test123”

  Scenario: 保存设置不丢失界面状态
    Given 侧栏处于折叠状态
    When 用户修改模型名称为“claude-test-model”
    And 点击保存设置
    Then 保存的配置仍包含 sidebar_collapsed 为 true
    And 保存的配置包含 model 为“claude-test-model”

  Scenario: Word 导出模板配置进入主配置
    When 用户勾选 Word 导出模板
    And 点击保存设置
    Then 保存的配置包含 word_export_use_template 为 true

  Scenario: API key 提示文案与实际用途一致
    Then API key 输入框的提示包含 AI 字样

  Scenario: 论文库根目录可配置
    Then 论文服务分组包含根目录选择
    When 用户选择论文库根目录为“D:\papers”
    And 点击保存设置
    Then 保存的配置包含 papers_root 为“D:\papers”
    And 缓存的论文按领域分子目录存放

  Scenario: 光标样式提供完整选项集
    Then 光标下拉框包含 12 种自定义光标
    And 光标下拉框第一项为系统默认

  Scenario: 新光标可选中并保存
    When 用户选择光标样式为“coffee”
    And 点击保存设置
    Then 保存的配置包含 custom_cursor 为“coffee”

  Scenario: 每种光标选项都接线完整
    Then 每个光标选项都有对应的 SVG 文件
    And 每个光标选项都有对应的 CSS 规则
    And 每个光标选项都有对应的 class 清理声明
