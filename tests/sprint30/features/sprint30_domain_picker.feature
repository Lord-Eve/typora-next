# Sprint 30b: 导入时选择领域
# 对应模块: domain-picker.js (新增), main.js openPaperUrl/openPaperPdf,
#           lib.rs import_paper_from_pdf (domain 参数 + 索引记录)
#
# 背景：论文分类（domain）此前只能由搜索关键词隐式携带——
# 粘贴 URL / 本地 PDF 导入的论文永远落在「未分类」。用户拍板：
# 导入时问一次（已有领域 + 可输新领域 + 暂不分类 + 取消）。

Feature: 导入论文时选择领域

  作为从搜索之外渠道导入论文的用户
  我想要导入前选择或新建领域
  以便所有论文都按领域归位，而不是堆在未分类里

  Background:
    Given 论文库已有“铝电解”和“本体论”两个领域

  Scenario: 领域选择器列出已有领域
    When 用户触发导入前领域选择
    Then 显示已有领域“铝电解”和“本体论”
    And 提供新领域输入框

  Scenario: 选择已有领域
    When 用户触发导入前领域选择
    And 用户选择领域“铝电解”并确定
    Then 领域选择结果为“铝电解”

  Scenario: 输入新领域
    When 用户触发导入前领域选择
    And 用户输入新领域“知识图谱”并确定
    Then 领域选择结果为“知识图谱”

  Scenario: 暂不分类
    When 用户触发导入前领域选择
    And 用户点击暂不分类
    Then 领域选择结果为未分类

  Scenario: 取消导入
    When 用户触发导入前领域选择
    And 用户点击取消
    Then 领域选择被取消
