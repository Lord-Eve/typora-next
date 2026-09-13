# Sprint 29 PB1: 按领域搜索论文
# 对应模块: paper-search.js (前端), paper_import/search.rs (Rust), AnySearch API
#
# UX 状态机（Sprint 2 教训：必须有明确进入/退出路径）：
#   搜索表单 → 搜索中 → 结果列表 →（选中导入 → 走现有 MinerU 管线进度 UI）
#   任意失败 → 停留在结果列表 + 透出具体错误；无 key → 降级提示不断崖

Feature: 按领域搜索论文

  作为想进入一个新领域的用户
  我想要按关键词/领域搜索论文
  以便不用先知道具体论文 URL 就能开始阅读

  Background:
    Given 用户已进入论文导读模式

  Scenario: 按关键词搜索到论文列表
    When 用户输入领域关键词“铝电解因果建模”
    And 点击搜索按钮
    Then 显示搜索结果列表
    And 每条结果包含标题和来源链接

  Scenario: 搜索结果按相关度排序
    When 用户输入领域关键词“本体论建模”
    And 点击搜索按钮
    Then 返回的论文标题与关键词相关

  Scenario: 缓存搜索结果后不跳阅读并显示已缓存标记
    When 用户输入领域关键词“铝电解”
    And 点击搜索按钮
    And 用户点击第 1 条结果的缓存按钮
    Then 进入缓存进度状态
    And 进度完成后该结果显示已缓存标记
    And 不打开论文 tab

  Scenario: 已缓存的论文可直接打开阅读
    Given 论文“https://arxiv.org/abs/2402.70007”已缓存
    When 用户输入领域关键词“铝电解”
    And 点击搜索按钮
    And 用户点击第 1 条结果的打开按钮
    Then 论文以 tab 形式打开

  Scenario: 批量缓存选中的论文
    When 用户输入领域关键词“铝电解”
    And 点击搜索按钮
    And 用户勾选第 1 和第 2 条结果
    And 用户点击批量缓存按钮
    Then 全部选中的论文已缓存
    And 结果列表显示已缓存标记

  # Sprint 30 起：重进欢迎页不再恢复上次搜索结果，改为按领域展示论文库
  # （见 sprint30_paper_library.feature「重新进入论文导读显示论文库而非上次搜索结果」）

  Scenario: 导入失败停留在结果列表并显示具体原因
    When 用户输入领域关键词“铝电解”
    And 点击搜索按钮
    And 设定导入将会失败
    And 用户点击第 1 条结果的缓存按钮
    Then 仍显示搜索结果列表
    And 显示具体错误原因

  Scenario: 搜索无结果时给出明确提示
    When 用户输入一个不可能命中的关键词“zzzqqqnonexistent”
    And 点击搜索按钮
    Then 显示无结果提示
    And 用户可以修改关键词重新搜索

  Scenario: 未配置 AnySearch API key 时可匿名搜索并提示限额
    Given 未配置 AnySearch API key
    When 用户打开论文搜索入口
    Then 仍显示搜索表单
    And 显示匿名搜索限额提示
    And 提供前往设置的引导

  Scenario: 无开放获取 PDF 的论文提供浏览器打开逃生门
    When 用户输入领域关键词“铝电解”
    And 点击搜索按钮
    And 设定导入将因无开放获取而失败
    And 用户点击第 1 条结果的缓存按钮
    Then 仍显示搜索结果列表
    And 提供在浏览器打开原文的按钮

  Scenario: 欢迎页以搜索为主角且导入入口可折叠
    When 用户查看论文导读欢迎页
    Then 搜索框位于导入入口上方
    And 导入入口默认折叠
    When 用户点击导入入口折叠开关
    Then 展开显示 Markdown、PDF 和 URL 导入方式
