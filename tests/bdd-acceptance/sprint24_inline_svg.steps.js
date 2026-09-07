#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * BDD Acceptance Steps for 内联 SVG 插图（Sprint 24）
 *
 * 仿 sprint20/sprint23 模式：直接读真实源码断言接线存在，缺失即 throw。
 *
 * 行为层（has_inline_svg / check_svg_figure / kind 分派补图）由：
 * - cargo test --test element_compliance_test
 * - node tests/sprint24/unit/test_element_repair_svg.js
 * 覆盖。
 */

const fs = require('fs');
const path = require('path');
const { StepRegistry } = require('../shared/runner');

const steps = new StepRegistry();

const SRC = path.join(__dirname, '../../src-tauri/src');
const SKILL = path.join(__dirname, '../../src-tauri/skills/chapter-generation');

function read(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`source file missing on disk: ${p}`);
  }
  return fs.readFileSync(p, 'utf-8');
}

function mustInclude(haystack, needle, what) {
  if (!haystack.includes(needle)) {
    throw new Error(`missing expected content: ${what} (${JSON.stringify(needle.slice(0, 60))})`);
  }
}

// ============================================
// Given
// ============================================

steps.given('the bundled chapter-generation skill references', function () {
  this.svgSpec = read(path.join(SKILL, 'references/inline-svg-spec.md'));
  this.skillMd = read(path.join(SKILL, 'SKILL.md'));
});

steps.given('the bundled chapter-generation skill', function () {
  this.skillMd = read(path.join(SKILL, 'SKILL.md'));
});

steps.given('the chapter-generation content-format spec', function () {
  this.contentFormat = read(path.join(SKILL, 'references/content-format.md'));
});

steps.given('the chapter-generation examples reference', function () {
  this.examples = read(path.join(SKILL, 'references/examples.md'));
});

steps.given('the real element_compliance source', function () {
  this.elementCompliance = read(path.join(SRC, 'element_compliance.rs'));
});

steps.given('the real ai_agent.rs source', function () {
  this.aiAgentRs = read(path.join(SRC, 'ai_agent.rs'));
});

steps.given('the real agent-bridge.mjs source', function () {
  this.bridge = read(path.join(__dirname, '../../agent-bridge.mjs'));
});

// ============================================
// Then — inline-svg-spec.md
// ============================================

steps.then('inline-svg-spec.md should define the 680 canvas', function () {
  mustInclude(this.svgSpec, 'viewBox="0 0 680 H"', 'SVG 画布 680 约束');
});

steps.then('inline-svg-spec.md should mandate a light card background', function () {
  mustInclude(this.svgSpec, '#F1EFE8', '浅色底卡色值');
  mustInclude(this.svgSpec, '底卡', '底卡要求');
});

steps.then('inline-svg-spec.md should ban style blocks classes and css vars', function () {
  mustInclude(this.svgSpec, '`<style>`', '禁 style 块');
  mustInclude(this.svgSpec, 'class="…"', '禁 class');
  mustInclude(this.svgSpec, 'var(…)', '禁 CSS 变量');
  mustInclude(this.svgSpec, 'context-stroke', '禁 context-stroke');
});

steps.then('inline-svg-spec.md should provide engineering and humanities recipes', function () {
  mustInclude(this.svgSpec, '### engineering（真实工业 / 过程工程）', 'engineering 学科配方');
  mustInclude(this.svgSpec, '### humanities（人文社科）', 'humanities 学科配方');
});

steps.then('inline-svg-spec.md should include a minimal working example', function () {
  mustInclude(this.svgSpec, '<svg xmlns="http://www.w3.org/2000/svg"', '最小示例 SVG');
});

// ============================================
// Then — SKILL.md
// ============================================

steps.then('SKILL.md should require an inline SVG figure for engineering', function () {
  const section = this.skillMd.split('### engineering（真实科学与工程 / 工业过程课）')[1] || '';
  mustInclude(section, '≥ 1 个内联 SVG 插图', 'engineering SVG 槽位');
});

steps.then('SKILL.md should require an inline SVG figure for humanities', function () {
  const section = this.skillMd.split('### humanities（人文课）')[1] || '';
  mustInclude(section, '≥ 1 个内联 SVG 插图', 'humanities SVG 槽位');
});

steps.then('SKILL.md should make inline SVG optional for technical', function () {
  const section = this.skillMd.split('### technical（技术课）')[1] || '';
  mustInclude(section, '内联 SVG 插图**可选**', 'technical SVG 可选');
});

steps.then('SKILL.md should have inline SVG items in the MUST-VERIFY per-type block', function () {
  const section = this.skillMd.split('**类型条件项（按判定的 course_type 只检查对应一行）:**')[1] || '';
  const engineeringLine = (section.split('- [ ] **engineering**:')[1] || '').split('\n')[0] || '';
  const humanitiesLine = (section.split('- [ ] **humanities**:')[1] || '').split('\n')[0] || '';
  mustInclude(engineeringLine, '内联 SVG 插图', 'engineering checklist SVG 项');
  mustInclude(humanitiesLine, '内联 SVG 插图', 'humanities checklist SVG 项');
});

steps.then('SKILL.md should reference inline-svg-spec as a required read', function () {
  mustInclude(this.skillMd, 'inline-svg-spec.md', 'References 指向规范');
  mustInclude(this.skillMd, '画 SVG 前必读', '必读标注');
});

// ============================================
// Then — content-format.md
// ============================================

steps.then('the spec should be version 1.4', function () {
  mustInclude(this.contentFormat, '# Chapter Content Format Specification (v1.4)', '版本号 v1.4');
  mustInclude(this.contentFormat, 'v1.4 | 新增内联 SVG 插图槽位', '变更记录');
});

steps.then('the spec should state the mermaid svg division of labor', function () {
  mustInclude(this.contentFormat, 'mermaid 画关系，SVG 画实物感与空间感', 'mermaid/SVG 分工');
});

steps.then('the spec should require svg figures for engineering and humanities', function () {
  mustInclude(this.contentFormat, '## 7. Inline SVG figures（engineering/humanities 每章 ≥ 1）', '§7 SVG 章节');
  mustInclude(this.contentFormat, 'Inline SVG:', 'Markdown rules SVG 行');
});

// ============================================
// Then — examples.md
// ============================================

steps.then('examples should include an inline svg block', function () {
  mustInclude(this.examples, '<svg xmlns="http://www.w3.org/2000/svg"', 'engineering 片段内嵌 SVG');
});

steps.then('examples should mention the svg spec', function () {
  mustInclude(this.examples, 'inline-svg-spec.md', '规范指引');
});

// ============================================
// Then — element_compliance.rs
// ============================================

steps.then('element_compliance should expose check_svg_figure', function () {
  mustInclude(this.elementCompliance, 'pub fn check_svg_figure', 'check_svg_figure 导出');
});

steps.then('element_compliance should expose has_inline_svg', function () {
  mustInclude(this.elementCompliance, 'pub fn has_inline_svg', 'has_inline_svg 导出');
});

steps.then('element violations should carry a kind field', function () {
  mustInclude(this.elementCompliance, 'pub kind: String', 'kind 字段');
  mustInclude(this.elementCompliance, '"missing-svg-figure"', '缺图 kind');
});

// ============================================
// Then — ai_agent.rs
// ============================================

steps.then('collect_element_violations should merge svg figure checks', function () {
  mustInclude(this.aiAgentRs, 'check_svg_figure(course_type, &name, &content)', '合并缺图检查');
});

steps.then('the element repair status message should mention missing figures', function () {
  mustInclude(this.aiAgentRs, '缺 SVG 插图', '状态消息覆盖缺图');
});

// ============================================
// Then — agent-bridge.mjs
// ============================================

steps.then('buildElementRepairPrompt should dispatch by violation kind', function () {
  mustInclude(this.bridge, "v.kind === 'missing-svg-figure'", 'kind 分派判断');
  mustInclude(this.bridge, 'kind "missing-svg-figure"', '补图分支指令');
});

steps.then('the svg repair branch should instruct reading inline-svg-spec', function () {
  mustInclude(this.bridge, 'references/inline-svg-spec.md', '修复 prompt 指向规范');
});

module.exports = steps;
