#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * BDD Acceptance Steps for 人文课原作试听嵌入（Sprint 26）
 *
 * 仿 sprint24/25 模式：读真实源码断言接线存在。
 * 行为层由 tests/sprint26/unit/ 两个 JS 单测覆盖。
 */

const fs = require('fs');
const path = require('path');
const { StepRegistry } = require('../shared/runner');

const steps = new StepRegistry();

const SKILL_DIR = path.join(__dirname, '../../src-tauri/skills/wikimedia-commons');
const CHAPTER_SKILL = path.join(__dirname, '../../src-tauri/skills/chapter-generation/SKILL.md');
const BRIDGE = path.join(__dirname, '../../agent-bridge.mjs');
const TAURI_CONF = path.join(__dirname, '../../src-tauri/tauri.conf.json');
const RUST_TEST = path.join(__dirname, '../../src-tauri/tests/audio_passthrough_test.rs');

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

steps.given('the bundled wikimedia-commons skill', function () {
  this.wikiSkill = read(path.join(SKILL_DIR, 'SKILL.md'));
});

steps.given('the wiki-fetch script source', function () {
  this.wikiFetch = read(path.join(SKILL_DIR, 'scripts/wiki-fetch.mjs'));
});

steps.given('the real agent-bridge.mjs source', function () {
  this.bridge = read(BRIDGE);
});

steps.given('the bundled chapter-generation skill', function () {
  this.chapterSkill = read(CHAPTER_SKILL);
});

// ============================================
// Then — wikimedia-commons skill
// ============================================

steps.then('SKILL.md should document the Commons search API', function () {
  mustInclude(this.wikiSkill, 'commons.wikimedia.org/w/api.php', 'API 端点');
  mustInclude(this.wikiSkill, 'gsrnamespace=6', 'File 命名空间搜索');
});

steps.then('SKILL.md should document audio mime filtering', function () {
  mustInclude(this.wikiSkill, 'audio/ogg', 'ogg');
  mustInclude(this.wikiSkill, 'audio/flac', 'flac');
  mustInclude(this.wikiSkill, 'audio/mpeg', 'mp3');
});

steps.then('SKILL.md should document recording selection rules', function () {
  mustInclude(this.wikiSkill, '单乐章', '单乐章优先规则');
  mustInclude(this.wikiSkill, '全曲', '全曲降级标注');
});

steps.then('SKILL.md should document the fallback link card', function () {
  mustInclude(this.wikiSkill, '不阻塞章节', '降级不阻塞');
});

steps.then('the skill should bundle the wiki-fetch script', function () {
  const p = path.join(SKILL_DIR, 'scripts/wiki-fetch.mjs');
  if (!fs.existsSync(p)) {
    throw new Error(`wiki-fetch script missing: ${p}`);
  }
});

// ============================================
// Then — wiki-fetch 脚本
// ============================================

steps.then('the script should whitelist only wikimedia hosts', function () {
  mustInclude(this.wikiFetch, 'commons.wikimedia.org', 'API 域白名单');
  mustInclude(this.wikiFetch, 'upload.wikimedia.org', '直链域白名单');
});

steps.then('the script should truncate large responses', function () {
  mustInclude(this.wikiFetch, '32 * 1024', '32KB 截断');
});

steps.then('the script should output structured error JSON', function () {
  mustInclude(this.wikiFetch, 'ok: false', '结构化错误（JS 字面量 ok:false）');
});

// ============================================
// Then — bridge 受限执行器
// ============================================

steps.then('the bridge should build a restricted wiki-fetch bash tool', function () {
  mustInclude(this.bridge, 'createBashToolDefinition', 'pi bash 工具工厂');
  mustInclude(this.bridge, 'wiki-fetch.mjs', 'wiki-fetch 命令校验');
});

steps.then('the bridge should reject non-wiki-fetch commands', function () {
  mustInclude(this.bridge, 'isWikiFetchCommand', '命令校验函数');
});

steps.then('the restricted tool should only inject for humanities and hybrid', function () {
  mustInclude(this.bridge, "course_type === 'humanities'", 'humanities 条件');
  mustInclude(this.bridge, "course_type === 'hybrid'", 'hybrid 条件');
});

steps.then('runPiTurn should forward customTools to createAgentSession', function () {
  mustInclude(this.bridge, 'customTools', 'customTools 透传');
});

// ============================================
// Then — chapter-generation 接线 + 渲染层
// ============================================

steps.then('the humanities branch should require attempting audio embeds', function () {
  const section = this.chapterSkill.split('### humanities（人文课）')[1] || '';
  mustInclude(section, 'wikimedia-commons', 'humanities 分支指向 wikimedia skill');
  mustInclude(section, '<audio', 'audio 嵌入要求');
});

steps.then('the skill References should list wikimedia-commons', function () {
  mustInclude(this.chapterSkill, 'wikimedia-commons/SKILL.md', 'References 列表');
});

steps.then('tauri.conf.json CSP should allow upload.wikimedia.org media', function () {
  const conf = read(TAURI_CONF);
  mustInclude(conf, 'media-src', 'media-src 指令');
  mustInclude(conf, 'https://upload.wikimedia.org', 'upload.wikimedia.org 白名单');
});

steps.then('the audio passthrough rust test should exist', function () {
  if (!fs.existsSync(RUST_TEST)) {
    throw new Error(`rust test missing: ${RUST_TEST}`);
  }
});

module.exports = steps;
