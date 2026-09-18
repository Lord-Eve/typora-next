# 划线批注 UX：输入框就近、备注可读、批注可见
# 对应产物: dist/scripts/main.js（批注输入浮层 / updateNoteMarker / tooltip 定位）
#           dist/styles/main.css（has-note 标志样式）
#
# 核心保证：
#   1) 批注输入不再用系统 prompt()，而是定位在划线附近的内联浮层（多行、Ctrl+Enter 保存）；
#   2) 有备注的划线末尾显示 💬 标志（跨段划线只标最后一段），hover 划线可读出备注；
#   3) 备注清空后标志同步消失。
#
# 验证方式说明：main.js 是巨型 IIFE 无法直接 require，本层按仓库先例
# （tests/sprint7/unit/test_external_open_attention.js）做源码契约断言。
#
# 注意：本仓库的 feature 解析器只认英文关键字（Feature/Scenario/Given/When/Then/And），
# 中文关键字行会被静默忽略导致场景空跑。

Feature: 划线批注 UX（就近输入 + 备注标志 + hover 可读）

  As a reader
  I want to annotate highlights with notes near the text
  So that I can see which highlights have notes and read them on hover

  Scenario: 批注输入框定位在划线附近且预填已有备注
    Given the annotation UX source files
    Then the annotate button should not use the native prompt dialog
    And the note editor should be positioned near the annotated highlight
    And the note editor should be clamped inside the viewport
    And the note editor should prefill the existing note and support multiline save

  Scenario: 保存备注后划线出现标志且 hover 可读
    Given the annotation UX source files
    Then saving a note should mark only the last wrapper with the note indicator
    And the stylesheet should render the note indicator on marked annotations
    And hovering an annotated highlight should reveal its note near the highlight

  Scenario: 备注清空后标志消失
    Given the annotation UX source files
    Then clearing the note should remove the note indicator from all wrappers
    And restoring annotations should rebuild note markers from persisted notes

  Scenario: 已有备注的划线默认进入追加模式
    Given the annotation UX source files
    Then the note editor should show the existing note read-only when present
    And saving in append mode should concatenate old note and new input with a date separator
    And an edit toggle should allow switching back to full editing

  Scenario: 编辑器打开期间点击编辑器内部不丢失正在编辑的批注
    Given the annotation UX source files
    Then global mouse handlers should ignore clicks inside the note editor
    And saving should use the annotation id captured when the editor opened

  Scenario: 选中文本直接点批注一步完成标注
    Given the annotation UX source files
    Then the annotate button should create a highlight on the fly when none exists

  Scenario: 多条批注按条目单元格展示
    Given the annotation UX source files
    Then notes should be rendered as separate entry cells instead of one raw text blob
    And the stylesheet should style note entries as stacked cells with date badges

  Scenario: 跨行划线不包裹纯空白节点
    Given the annotation UX source files
    Then multi-block highlighting should skip whitespace-only text nodes
