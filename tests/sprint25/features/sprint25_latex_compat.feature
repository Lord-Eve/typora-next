Feature: LaTeX 兼容层（KaTeX 裸上下标 sanitize）

  As a learner reading AI-generated course chapters
  I want real-LaTeX idioms like `1800\sim2000\,^\circ\mathrm{C}` to render
  So that LLM 按真 LaTeX 习惯生成的公式不再以红色源码形式炸在页面上

  背景：真 LaTeX 中 `\,^`（间距命令后裸上标）合法（上标附着隐式空原子），
  但 KaTeX 报 "Got group of unknown type: 'internal'"。本 sprint 在数学提取
  层加 sanitize：间距命令（\, \; \: \!）后紧跟 ^ 或 _ 时插入空基元 {}。

  行为层（sanitize 规则正确性 / 幂等性 / 不越界）由 Rust test
  （latex_sanitize_test）覆盖；sanitize 目标形态的 KaTeX 可渲染性由
  JS unit（test_latex_sanitize_katex，真实 vendored KaTeX）覆盖；
  本 feature 验收提取链路接线与测试资产存在。

  # PB25-1: sanitize 规则与导出

  Scenario: docx-export crate 暴露 sanitize_latex
    Given the real docx-export crate source
    Then the crate should expose a public sanitize_latex function
    And sanitize_latex should cover all four spacing commands
    And sanitize_latex should handle both superscript and subscript

  # PB25-2: 提取链路接线

  Scenario: 数学提取链路统一经过 sanitize
    Given the real docx-export crate source
    Then extract_math_blocks should sanitize inline math content
    And extract_math_blocks should sanitize block math content
    And the main render path should share the same extraction

  # PB25-3: 测试资产

  Scenario: 行为测试与 KaTeX 验收测试存在
    Then the rust latex_sanitize test file should exist
    And the JS KaTeX acceptance test file should exist
