Feature: 课程案例研习（Case Study）

  As a learner reading a course chapter
  I want to select a concept and get an AI-generated teaching case
  So that I can understand the concept through a concrete story and ask follow-ups

  # 案例研习面板已并入 AI 伴学统一面板（📋 举个例子）：
  # 面板层的端到端行为（首轮生成 / 续聊 / 落盘）由 tests/ai-companion 覆盖，
  # 本文件只保留接线与外壳契约。

  Scenario: 后端接线（skill / bridge / Rust / index.html）
    Given the real project sources
    Then the case study skill should exist with valid frontmatter and constraints
    And the bridge should wire the case-study stage
    And Rust should register the case study commands
    And index.html should load the case study modules

  Scenario: 划词气泡原地触发（AI 伴学统一入口收敛）
    Given the real project sources
    Then the selection toolbar should offer case study via the companion menu
    And the companion button visibility should be gated on course mode
    And the example mode click should call openAICompanion with the selected text

  Scenario: 侧栏按钮避开底部进度条遮挡（UX 修正 2026-08-11）
    Given the real project sources
    Then the cornell sidebar should place action buttons in an actions row
    And the footer should not carry the action buttons
    And the stylesheet should not restyle the footer as flex

  Scenario: 划词只在文章正文内生效（UX 修正 2026-08-11 第二轮）
    Given the real project sources
    Then the selection toolbar mouseup handler should be scoped to markdownBody

  Scenario: 侧栏删除解释按钮、案例按钮纯历史入口（UX 修正 2026-08-11 第二轮）
    Given the real project sources
    Then the cornell sidebar should not contain an explain button
    And the case study sidebar entry should open the unified companion history

  Scenario: 案例研习流式输出接线（UX 修正 2026-08-11 第二轮）
    Given the real project sources
    Then the bridge should emit case study deltas
    And Rust should stream case study events to the frontend
    And the modal should listen for case study delta events
    And the shell should support streaming bubbles

  Scenario: 气泡复用全局 markdown 渲染（UX 修正 2026-08-11 第二轮）
    Given the real project sources
    Then the shell should render tutor bubbles via markdownToHtml with escape fallback

  Scenario: 气泡代码块在白天主题下可读（配色回归 2026-09-17）
    Given the real project sources
    Then the case study bubble code blocks should be readable in both themes
