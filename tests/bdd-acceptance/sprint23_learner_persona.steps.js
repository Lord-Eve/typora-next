#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * BDD Acceptance Steps for 学习者画像 v1（Sprint 23）
 *
 * 仿 sprint21 模式：直接读真实源码断言接线存在，缺失即 throw。
 *
 * 行为层（prompt 构建 / 白名单解析 / 上限 / 降级 / render / 指纹稳定性）由：
 * - cargo test --test persona_prompt_test
 * 覆盖。
 */

const fs = require('fs');
const path = require('path');
const { StepRegistry } = require('../shared/runner');

const steps = new StepRegistry();

const SRC = path.join(__dirname, '../../src-tauri/src');
const DIST = path.join(__dirname, '../../dist');

function read(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`source file missing on disk: ${p}`);
  }
  return fs.readFileSync(p, 'utf-8');
}

function windowOf(src, anchor, len, what) {
  const i = src.indexOf(anchor);
  if (i === -1) throw new Error(`missing anchor: ${what}`);
  return src.slice(i, i + len);
}

// ============================================
// Given
// ============================================

steps.given('the real persona_prompt source', function () {
  this.personaPromptRs = read(path.join(SRC, 'persona_prompt.rs'));
});

steps.given('the real learner_profile source', function () {
  this.learnerProfile = read(path.join(SRC, 'learner_profile.rs'));
});

steps.given('the real ai_agent.rs source', function () {
  this.aiAgentRs = read(path.join(SRC, 'ai_agent.rs'));
});

steps.given('the real lib.rs source', function () {
  this.libRs = read(path.join(SRC, 'lib.rs'));
});

steps.given('the real plan_prompt source', function () {
  this.planPromptRs = read(path.join(SRC, 'plan_prompt.rs'));
});

steps.given('the real index.html and project-manager.js sources', function () {
  this.indexHtml = read(path.join(DIST, 'index.html'));
  this.projectManagerJs = read(path.join(DIST, 'scripts/learning/project-manager.js'));
  this.learningCss = read(path.join(DIST, 'styles/learning.css'));
});

// ============================================
// PB23-1: 纯模块契约
// ============================================

steps.then('persona_prompt should expose the pure persona API', function () {
  const src = this.personaPromptRs;
  for (const sig of [
    'pub fn build_persona_prompt',
    'pub fn parse_persona_response',
    'pub fn rule_persona',
    'pub fn render_persona_block',
    'pub fn collect_valid_concepts',
    'pub fn fnv1a_hex',
  ]) {
    if (!src.includes(sig)) throw new Error(`persona_prompt.rs missing ${sig}`);
  }
  if (/^\s*mod tests:/m.test(src)) {
    throw new Error('persona_prompt.rs must not embed its own test module (use tests/ exe)');
  }
});

steps.then('parsing should whitelist concepts and cap domains and bank size', function () {
  const src = this.personaPromptRs;
  if (!/MAX_DOMAINS\s*:\s*usize\s*=\s*8/.test(src)) {
    throw new Error('persona_prompt.rs must cap domains at 8 via MAX_DOMAINS');
  }
  if (!/MAX_ANALOGY_BANK\s*:\s*usize\s*=\s*40/.test(src)) {
    throw new Error('persona_prompt.rs must cap analogy bank at 40 via MAX_ANALOGY_BANK');
  }
  const w = windowOf(src, 'pub fn parse_persona_response', 3000, 'parse_persona_response');
  if (!w.includes('valid') || !w.includes('contains')) {
    throw new Error('parse_persona_response must filter concepts against the valid whitelist');
  }
});

// ============================================
// PB23-1: 缓存 / ensure / 降级 / 只读真相源
// ============================================

steps.then('learner_profile should expose persona file read and write', function () {
  const src = this.learnerProfile;
  for (const sig of ['pub fn persona_path', 'pub fn read_persona', 'pub fn write_persona']) {
    if (!src.includes(sig)) throw new Error(`learner_profile.rs missing ${sig}`);
  }
  if (!src.includes('learner-persona.json')) {
    throw new Error('persona file must be learner-persona.json (derived cache beside the index)');
  }
});

steps.then('get_learner_persona should ensure by fingerprint with rule fallback', function () {
  const w = windowOf(this.aiAgentRs, 'pub async fn get_learner_persona', 2600, 'get_learner_persona command');
  if (!w.includes('fnv1a_hex')) throw new Error('ensure must compare source fingerprint (fnv1a_hex)');
  if (!w.includes('build_persona_prompt')) throw new Error('rebuild must call the LLM via build_persona_prompt');
  if (!w.includes('rule_persona')) throw new Error('LLM failure must fall back to rule_persona, never Err');
  if (!w.includes('write_persona')) throw new Error('rebuilt persona must be persisted');
});

steps.then('the plan path should never rebuild the persona', function () {
  const w = windowOf(this.aiAgentRs, 'pub async fn plan_course_llm', 3200, 'plan_course_llm');
  if (w.includes('build_persona_prompt')) {
    throw new Error('plan path must not rebuild persona (zero new LLM latency); it may only read cache');
  }
  if (!w.includes('read_persona') && !w.includes('render_persona_block')) {
    throw new Error('plan path should read cached persona for injection');
  }
});

steps.then('lib.rs should register get_learner_persona', function () {
  if (!this.libRs.includes('pub mod persona_prompt;')) throw new Error('lib.rs missing mod persona_prompt');
  if (!this.libRs.includes('get_learner_persona')) throw new Error('lib.rs not registering get_learner_persona');
});

// ============================================
// PB23-2: 注入与开关
// ============================================

steps.then('build_plan_prompt should accept an optional persona section', function () {
  const w = windowOf(this.planPromptRs, 'pub fn build_plan_prompt', 300, 'build_plan_prompt signature');
  if (!w.includes('persona_section: Option<&str>')) {
    throw new Error('build_plan_prompt must take persona_section: Option<&str>');
  }
  if (!this.planPromptRs.includes('persona_section')) throw new Error('persona_section never used');
});

steps.then('the persona block should carry analogy instructions and boundaries', function () {
  const src = this.personaPromptRs;
  const w = windowOf(src, 'pub fn render_persona_block', 3500, 'render_persona_block');
  for (const kw of ['学习者画像', '类比']) {
    if (!w.includes(kw)) throw new Error(`persona block prompt must mention ${kw}`);
  }
  if (!/不得假设|不假设/.test(w)) {
    throw new Error('persona block must bound the model: never assume domains outside the persona');
  }
});

steps.then('plan_course_llm should gate persona injection by persona_enabled', function () {
  const w = windowOf(this.aiAgentRs, 'pub async fn plan_course_llm', 3200, 'plan_course_llm');
  if (!w.includes('persona_enabled: Option<bool>')) {
    throw new Error('plan_course_llm must accept persona_enabled: Option<bool>');
  }
  if (!w.includes('persona_enabled.unwrap_or(true)')) {
    throw new Error('persona_enabled must default to true (opt-out), legacy callers unaffected');
  }
});

// ============================================
// PB23-3: 面板
// ============================================

steps.then('the memory panel should contain persona row and detail markup', function () {
  const html = this.indexHtml;
  if (!html.includes('id="learnerPersonaRow" style="display: none;"')) {
    throw new Error('index.html missing default-hidden #learnerPersonaRow');
  }
  for (const id of ['learnerPersonaSummary', 'learnerPersonaDetail', 'learnerPersonaToggle', 'learnerPersonaRebuild']) {
    if (!html.includes(`id="${id}"`)) throw new Error(`index.html missing #${id}`);
  }
  if (!html.includes('本次规划使用画像')) throw new Error('toggle label must state per-plan scope');
  const css = this.learningCss;
  for (const cls of ['.learner-persona-row', '.learner-persona-detail', '.learner-persona-chip']) {
    if (!css.includes(cls)) throw new Error(`learning.css missing ${cls}`);
  }
});

steps.then('project-manager should load persona and render the summary line', function () {
  const js = this.projectManagerJs;
  if (!js.includes("invoke('get_learner_persona'")) {
    throw new Error('project-manager must invoke get_learner_persona');
  }
  const w = windowOf(js, 'function loadLearnerPersona', 1500, 'loadLearnerPersona');
  if (!w.includes('个领域') || !w.includes('类比素材')) {
    throw new Error('summary line must show N 个领域 · M 个类比素材');
  }
  if (!w.includes('display')) throw new Error('row must hide itself when persona absent');
  if (!js.includes('catch')) throw new Error('persona load must fail silently (never block the dialog)');
  const row = windowOf(js, 'function renderPersonaDetail', 1200, 'renderPersonaDetail');
  if (!row.includes('learner-persona-chip')) throw new Error('detail must render domain chips');
  if (!row.includes('简化模式')) throw new Error('rule-fallback persona must be labelled 简化模式');
});

steps.then('project-manager should wire persona toggle and force rebuild', function () {
  const js = this.projectManagerJs;
  if (!js.includes('personaState')) throw new Error('missing personaState');
  if (!js.includes("addEventListener('change'")) throw new Error('toggle must listen for change');
  const rw = windowOf(js, 'function bindPersonaEvents', 1400, 'bindPersonaEvents');
  if (!rw.includes('force: true')) throw new Error('rebuild button must pass force: true');
  if (!rw.includes("addEventListener('change'")) {
    throw new Error('bindPersonaEvents must wire the per-plan toggle');
  }
  const submit = windowOf(js, "invoke('plan_course_llm'", 600, 'plan invoke');
  if (!submit.includes('personaEnabled')) throw new Error('plan invoke must pass personaEnabled');
});

module.exports = steps;
