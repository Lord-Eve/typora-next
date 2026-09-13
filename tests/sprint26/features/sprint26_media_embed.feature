Feature: 人文课原作试听嵌入（Wikimedia Commons 内联播放器）

  As a learner taking a humanities course (music/art appreciation)
  I want chapters to embed playable recordings of the works being discussed
  So that 赏析课不再是纯文字转述——读到《勃兰登堡协奏曲》就能当场听到

  设计文档：docs/plans/2026-09-07-humanities-media-embed-design.md
  形态：skill 内置脚本（wiki-fetch.mjs，域名白名单 GET）+ bridge 受限执行器
  （自定义 BashOperations 只放行该脚本）+ 生成期 agent 直写 <audio> 直链。

  行为层（白名单/截断/错误 JSON/受限 exec 放行与拒绝）由 JS unit
  （test_wiki_fetch / test_bridge_wiki_exec）覆盖；本 feature 验收文件存在性
  与全链路接线。

  # PB26-1: wikimedia-commons skill

  Scenario: wikimedia-commons skill 存在且完整
    Given the bundled wikimedia-commons skill
    Then SKILL.md should document the Commons search API
    And SKILL.md should document audio mime filtering
    And SKILL.md should document recording selection rules
    And SKILL.md should document the fallback link card
    And the skill should bundle the wiki-fetch script

  Scenario: wiki-fetch 脚本带白名单与自我保护
    Given the wiki-fetch script source
    Then the script should whitelist only wikimedia hosts
    And the script should truncate large responses
    And the script should output structured error JSON

  # PB26-2: bridge 受限执行器

  Scenario: agent-bridge 为 humanities 注入锁死的 bash
    Given the real agent-bridge.mjs source
    Then the bridge should build a restricted wiki-fetch bash tool
    And the bridge should reject non-wiki-fetch commands
    And the restricted tool should only inject for humanities and hybrid
    And runPiTurn should forward customTools to createAgentSession

  # PB26-3: chapter-generation 接线 + 渲染层

  Scenario: chapter-generation humanities 分支接入试听
    Given the bundled chapter-generation skill
    Then the humanities branch should require attempting audio embeds
    And the skill References should list wikimedia-commons

  Scenario: 渲染层放行音频播放
    Then tauri.conf.json CSP should allow upload.wikimedia.org media
    And the audio passthrough rust test should exist
