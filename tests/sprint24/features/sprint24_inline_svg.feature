Feature: 内联 SVG 插图（engineering/humanities 内容增强 + E 层硬校验）

  As a learner taking an engineering or humanities course
  I want chapters with 实物感 SVG figures — equipment cross-sections, scene reconstructions, spatial layouts
  So that 工科与人文社科课程不再只有 mermaid 框图和纯文字

  行为层（has_inline_svg / check_svg_figure / kind 字段）由 Rust test
  （element_compliance_test）与 JS unit（test_element_repair_svg）覆盖；
  本 feature 验收 skill 内容约束、E 层校验接入与全链路接线。

  # PB24-1: skill 内容（规范 + 槽位 + 示例）

  Scenario: chapter-generation 内联 SVG 规范存在且完整
    Given the bundled chapter-generation skill references
    Then inline-svg-spec.md should define the 680 canvas
    And inline-svg-spec.md should mandate a light card background
    And inline-svg-spec.md should ban style blocks classes and css vars
    And inline-svg-spec.md should provide engineering and humanities recipes
    And inline-svg-spec.md should include a minimal working example

  Scenario: SKILL.md 将 SVG 槽位接入类型特化与自检
    Given the bundled chapter-generation skill
    Then SKILL.md should require an inline SVG figure for engineering
    And SKILL.md should require an inline SVG figure for humanities
    And SKILL.md should make inline SVG optional for technical
    And SKILL.md should have inline SVG items in the MUST-VERIFY per-type block
    And SKILL.md should reference inline-svg-spec as a required read

  Scenario: content-format 提供 SVG 格式与分工
    Given the chapter-generation content-format spec
    Then the spec should be version 1.4
    And the spec should state the mermaid svg division of labor
    And the spec should require svg figures for engineering and humanities

  Scenario: examples.md 含 engineering SVG 镜像片段
    Given the chapter-generation examples reference
    Then examples should include an inline svg block
    And examples should mention the svg spec

  # PB24-2: E 层硬校验与补图修复

  Scenario: element_compliance 校验缺图违规
    Given the real element_compliance source
    Then element_compliance should expose check_svg_figure
    And element_compliance should expose has_inline_svg
    And element violations should carry a kind field

  Scenario: generate_chapters 合并缺图违规并触发 element-repair
    Given the real ai_agent.rs source
    Then collect_element_violations should merge svg figure checks
    And the element repair status message should mention missing figures

  Scenario: agent-bridge 支持补图修复
    Given the real agent-bridge.mjs source
    Then buildElementRepairPrompt should dispatch by violation kind
    And the svg repair branch should instruct reading inline-svg-spec
