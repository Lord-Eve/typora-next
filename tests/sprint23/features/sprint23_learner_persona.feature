# PB23-1/2/3: 学习者画像 v1（领域组合 + 类比素材）
# 设计: docs/design.md〔Sprint 23〕 需求: docs/specs/learner-persona-v1-req.md
# 行为层（prompt 构建/白名单解析/降级/render/指纹）由 cargo test --test persona_prompt_test 覆盖；
# 本文件断言真实源码接线。
功能: 学习者画像

  Background:
    Given the real persona_prompt source
    And the real learner_profile source
    And the real ai_agent.rs source
    And the real lib.rs source
    And the real plan_prompt source
    And the real index.html and project-manager.js sources

  # PB23-1 验收 1/4/5：派生纯模块契约（领域/素材/白名单/上限）
  Scenario: 画像由纯模块从课程档案派生且防御完整
    Then persona_prompt should expose the pure persona API
    And parsing should whitelist concepts and cap domains and bank size

  # PB23-1 验收 2/3/6：缓存、ensure、降级、不改写真相源
  Scenario: 打开对话框时按需重建且画像只是派生缓存
    Then learner_profile should expose persona file read and write
    And get_learner_persona should ensure by fingerprint with rule fallback
    And the plan path should never rebuild the persona
    And lib.rs should register get_learner_persona

  # PB23-2 验收 1/2/3/4/5：注入段落、类比指令、临时开关、零新增延迟
  Scenario: 画像段落注入规划且可临时关闭
    Then build_plan_prompt should accept an optional persona section
    And the persona block should carry analogy instructions and boundaries
    And plan_course_llm should gate persona injection by persona_enabled

  # PB23-3 验收 1-5：面板摘要行、明细、开关、重建、默认隐藏
  Scenario: 面板显示画像摘要行可展开可关可重建
    Then the memory panel should contain persona row and detail markup
    And project-manager should load persona and render the summary line
    And project-manager should wire persona toggle and force rebuild
