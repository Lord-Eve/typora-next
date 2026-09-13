# Sprint 31: 导入失败批量串联 agent 补救
# 对应模块: paper-search.js (_rescueFailures), lib.rs rescue_paper_imports,
#           agent-bridge.mjs paper-rescue stage, skills/paper-rescue/
#
# 用户原则（feedback_retry_must_carry_error 升级）：
#   1. 错误信息作为上下文交 agent 继续优化，而非抛异常就完事
#   2. 失败点自动串联 agent，无需用户触发
#   3. 批量视角：所有失败一起给 agent，由 agent 判断规划（不是一篇一调）

Feature: 导入失败批量 agent 补救

  作为批量缓存论文的用户
  我想要导入失败时 agent 自动携带全部错误上下文批量补救
  以便系统性问题（如 API 限额）被换源解决，而不是把异常抛给我

  Background:
    Given 用户已进入论文导读模式且已配置 AI

  Scenario: 批量缓存失败一次性串联 agent 补救
    When 用户输入领域关键词“铝电解”
    And 点击搜索按钮
    And 设定导入将因无开放获取而失败
    And 用户勾选第 1 和第 2 条结果
    And 用户点击批量缓存按钮
    Then 智能补救被调用一次
    And 补救请求携带全部 2 条失败及错误上下文
    And 补救期间显示批量补救进度文案
    And 补救成功的篇目显示已缓存标记
    And 仍失败的篇目透出补救尝试记录

  Scenario: 单篇缓存失败也会串联补救
    When 用户输入领域关键词“铝电解”
    And 点击搜索按钮
    And 设定导入将因无开放获取而失败
    And 用户点击第 1 条结果的缓存按钮
    Then 智能补救被调用一次
    And 补救请求携带全部 1 条失败及错误上下文
    And 补救成功的篇目显示已缓存标记

  Scenario: 无 AI 配置时不补救走旧错误路径
    Given 未配置 AI
    When 用户输入领域关键词“铝电解”
    And 点击搜索按钮
    And 设定导入将因无开放获取而失败
    And 用户勾选第 1 和第 2 条结果
    And 用户点击批量缓存按钮
    Then 智能补救返回不可用
    And 仍失败的篇目透出原始错误
    And 每条失败原因附带浏览器打开按钮
