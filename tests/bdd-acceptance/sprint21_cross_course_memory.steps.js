#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * BDD Acceptance Steps for 跨课程记忆（Sprint 21）
 *
 * 仿 sprint20 模式：直接读真实源码断言接线存在，缺失即 throw。
 *
 * 行为层（档案聚合 / 截断 / 去重 / backfill / prompt 注入与 None 回归）由：
 * - cargo test --test learner_profile_test --test plan_prompt_test
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

// ============================================
// Given
// ============================================

steps.given('the real learner_profile source', function () {
  this.learnerProfile = read(path.join(SRC, 'learner_profile.rs'));
});

steps.given('the real lib.rs source', function () {
  this.libRs = read(path.join(SRC, 'lib.rs'));
});

steps.given('the real plan_prompt source', function () {
  this.planPromptRs = read(path.join(SRC, 'plan_prompt.rs'));
});

steps.given('the real ai_agent.rs source', function () {
  this.aiAgentRs = read(path.join(SRC, 'ai_agent.rs'));
});

steps.given('the real memory_rank source', function () {
  this.memoryRankRs = read(path.join(SRC, 'memory_rank.rs'));
});

steps.given('the real index.html and project-manager.js sources', function () {
  this.indexHtml = read(path.join(DIST, 'index.html'));
  this.projectManagerJs = read(path.join(DIST, 'scripts/learning/project-manager.js'));
  this.learningCss = read(path.join(DIST, 'styles/learning.css'));
});

steps.given('the real project-resume.js source', function () {
  this.projectResumeJs = read(path.join(DIST, 'scripts/learning/project-resume.js'));
});

// ============================================
// PB21-1: 数据层
// ============================================

steps.then('it should expose build_completion_profile', function () {
  if (!this.learnerProfile.includes('pub fn build_completion_profile')) {
    throw new Error('learner_profile.rs missing build_completion_profile');
  }
});

steps.then('it should expose record_course_completion', function () {
  if (!this.learnerProfile.includes('pub fn record_course_completion')) {
    throw new Error('learner_profile.rs missing record_course_completion');
  }
});

steps.then('it should expose aggregate_learner_context', function () {
  if (!this.learnerProfile.includes('pub fn aggregate_learner_context')) {
    throw new Error('learner_profile.rs missing aggregate_learner_context');
  }
});

steps.then('it should expose learner_index_path and list_valid_course_names', function () {
  if (!this.learnerProfile.includes('pub fn learner_index_path')) {
    throw new Error('learner_profile.rs missing learner_index_path');
  }
  if (!this.learnerProfile.includes('pub fn list_valid_course_names')) {
    throw new Error('learner_profile.rs missing list_valid_course_names');
  }
});

steps.then('aggregation should truncate to newest five courses', function () {
  if (!this.learnerProfile.includes('MAX_COURSES: usize = 5')) {
    throw new Error('learner_profile.rs missing MAX_COURSES = 5 truncation');
  }
  if (!this.learnerProfile.includes('truncate(MAX_COURSES)')) {
    throw new Error('aggregation should truncate to MAX_COURSES');
  }
});

steps.then('aggregation should dedup concepts with newest status winning', function () {
  if (!this.learnerProfile.includes('seen.insert')) {
    throw new Error('aggregation missing concept dedup (seen set)');
  }
  // 新课在前（completed_at 降序），dedup 自然实现「最新状态赢」
  if (!this.learnerProfile.includes('Reverse')) {
    throw new Error('aggregation should sort newest first for newest-wins dedup');
  }
});

// ============================================
// PB21-2: 结课钩子与命令
// ============================================

steps.then('persist_quiz_result should record completion profile on course completion', function () {
  const hookIdx = this.libRs.indexOf('mark_course_completed_if_done');
  if (hookIdx < 0) {
    throw new Error('lib.rs missing course completion check');
  }
  const seg = this.libRs.slice(hookIdx, hookIdx + 1500);
  if (!seg.includes('record_course_completion')) {
    throw new Error('completion hook should call record_course_completion');
  }
});

steps.then('the hook should be best-effort with non-fatal logging', function () {
  const hookIdx = this.libRs.indexOf('record_course_completion');
  const seg = this.libRs.slice(hookIdx, hookIdx + 800);
  if (!seg.includes('non-fatal') && !seg.includes('log::warn')) {
    throw new Error('completion hook should log warn and stay non-fatal');
  }
});

steps.then('backfill_completion_profile command should be registered', function () {
  if (!this.libRs.includes('async fn backfill_completion_profile')) {
    throw new Error('lib.rs missing backfill_completion_profile command');
  }
  // invoke_handler 注册（函数定义之外还有一处引用）
  const matches = this.libRs.split('backfill_completion_profile').length - 1;
  if (matches < 3) {
    throw new Error('backfill_completion_profile should be defined AND registered (expect ≥3 occurrences)');
  }
});

steps.then('list_learner_courses command should be registered', function () {
  if (!this.libRs.includes('async fn list_learner_courses')) {
    throw new Error('lib.rs missing list_learner_courses command');
  }
  const matches = this.libRs.split('list_learner_courses').length - 1;
  if (matches < 2) {
    throw new Error('list_learner_courses should be defined AND registered (expect ≥2 occurrences)');
  }
});

// ============================================
// PB21-3: plan 注入
// ============================================

steps.then('build_plan_prompt should accept learner_context parameter', function () {
  if (!this.planPromptRs.includes('learner_context: Option<&str>')) {
    throw new Error('build_plan_prompt missing learner_context parameter');
  }
});

steps.then('the prompt should contain 学习者历史 section and 衔接规则', function () {
  if (!this.planPromptRs.includes('学习者历史')) {
    throw new Error('plan_prompt missing 学习者历史 section');
  }
  if (!this.planPromptRs.includes('衔接规则')) {
    throw new Error('plan_prompt missing 衔接规则');
  }
  if (!this.planPromptRs.includes('不得作为独立章节')) {
    throw new Error('衔接规则 should forbid re-teaching mastered concepts');
  }
});

steps.then('None context should leave the prompt without the learner section', function () {
  if (!this.planPromptRs.includes('unwrap_or_default()')) {
    throw new Error('None learner_context should degrade to empty section');
  }
});

steps.then('plan flow should aggregate learner context before building the prompt', function () {
  const aggIdx = this.aiAgentRs.indexOf('aggregate_learner_context');
  const buildIdx = this.aiAgentRs.indexOf('build_plan_prompt(&goal');
  if (aggIdx < 0) {
    throw new Error('ai_agent.rs missing aggregate_learner_context call');
  }
  if (buildIdx < 0 || aggIdx > buildIdx) {
    throw new Error('aggregation must happen before build_plan_prompt');
  }
});

// ============================================
// PB21-4: 前端 UX
// ============================================

steps.then('the create dialog should contain the learnerContextHint element', function () {
  if (!this.indexHtml.includes('id="learnerContextHint"')) {
    throw new Error('index.html missing learnerContextHint element');
  }
  if (!this.learningCss.includes('.learner-context-hint')) {
    throw new Error('learning.css missing .learner-context-hint style');
  }
});

steps.then('project-manager should load learner courses on dialog open', function () {
  if (!this.projectManagerJs.includes('loadLearnerContextHint')) {
    throw new Error('project-manager.js missing loadLearnerContextHint');
  }
  if (!this.projectManagerJs.includes('list_learner_courses')) {
    throw new Error('project-manager.js should invoke list_learner_courses');
  }
  // openDialog 必须调用
  const openIdx = this.projectManagerJs.indexOf('function openDialog');
  const seg = this.projectManagerJs.slice(openIdx, openIdx + 400);
  if (!seg.includes('loadLearnerContextHint')) {
    throw new Error('openDialog should call loadLearnerContextHint');
  }
});

steps.then('the hint should be hidden when there are no completed courses', function () {
  if (!this.indexHtml.includes('id="learnerContextHint" style="display: none;"')) {
    throw new Error('learnerContextHint should default to hidden');
  }
  if (!this.projectManagerJs.includes("style.display = 'none'")) {
    throw new Error('loadLearnerContextHint should hide hint when list is empty');
  }
});

steps.then('the hint container should be a memory panel with search and list', function () {
  // 外层容器 id + 默认隐藏必须保留
  if (!this.indexHtml.includes('id="learnerContextHint" style="display: none;"')) {
    throw new Error('learnerContextHint wrapper must keep id + default hidden');
  }
  for (const id of ['learnerMemorySearch', 'learnerMemoryList', 'learnerMemoryStatus']) {
    if (!this.indexHtml.includes(`id="${id}"`)) {
      throw new Error(`index.html missing memory panel element #${id}`);
    }
  }
  // 左右排布（面板是侧栏，不是上下堆叠的提示行）
  if (!this.learningCss.includes('.learner-context-hint')) {
    throw new Error('learning.css missing .learner-context-hint style');
  }
});

steps.then('the panel should explain what selecting a course does', function () {
  if (!this.indexHtml.includes('id="learnerMemoryHelp"')) {
    throw new Error('index.html missing #learnerMemoryHelp explainer');
  }
  const idx = this.indexHtml.indexOf('learnerMemoryHelp');
  const seg = this.indexHtml.slice(idx, idx + 400);
  // 说明必须讲清「勾选 = 注入什么效果」，而不是空泛标题
  if (!seg.includes('已知基础') || !seg.includes('大纲')) {
    throw new Error('explainer should state checked courses feed into the outline as known baseline');
  }
});

steps.then('project-manager should load course details and render selectable rows', function () {
  if (!this.projectManagerJs.includes("invoke('list_learner_courses_detail'")) {
    throw new Error('project-manager.js should call list_learner_courses_detail');
  }
  if (!this.projectManagerJs.includes('function renderMemoryList')) {
    throw new Error('project-manager.js missing renderMemoryList');
  }
  // 每门课一个可勾选行，携带 course_path 作为选择身份
  if (!this.projectManagerJs.includes('data-path')) {
    throw new Error('memory rows should carry data-path for selection identity');
  }
});

steps.then('rows should support search filtering by course name and concept', function () {
  if (!this.projectManagerJs.includes('learnerMemorySearch')) {
    throw new Error('project-manager.js missing learnerMemorySearch handling');
  }
  if (!this.projectManagerJs.includes("addEventListener('input'")) {
    throw new Error('search box should listen to input events for live filtering');
  }
  // 过滤是纯函数：课程名 + 概念名 拼接小写匹配
  const idx = this.projectManagerJs.indexOf('function memoryMatchesQuery');
  if (idx < 0) {
    throw new Error('missing memoryMatchesQuery filter helper');
  }
  const seg = this.projectManagerJs.slice(idx, idx + 400);
  if (!seg.includes('concepts') || !seg.includes('toLowerCase')) {
    throw new Error('filter should match course name and concepts, case-insensitively');
  }
});

steps.then('goal input should debounce-invoke rank_learner_courses', function () {
  if (!this.projectManagerJs.includes("invoke('rank_learner_courses'")) {
    throw new Error('project-manager.js should call rank_learner_courses');
  }
  // 防抖：setTimeout + clearTimeout
  if (!this.projectManagerJs.includes('setTimeout')) {
    throw new Error('rank trigger should be debounced via setTimeout');
  }
  if (!this.projectManagerJs.includes('clearTimeout')) {
    throw new Error('debounce should cancel prior timer via clearTimeout');
  }
});

steps.then('ranked results should reorder rows with score and reason and pre-check relevant courses', function () {
  // 相关性排序结果应驱动行顺序与预勾选
  if (!this.projectManagerJs.includes('memoryRank')) {
    throw new Error('project-manager.js missing memory ranking state (memoryRank)');
  }
  if (!/\.score\b|score\s*:/.test(this.projectManagerJs)) {
    throw new Error('ranked rows should carry a relevance score');
  }
  if (!this.projectManagerJs.includes('reason')) {
    throw new Error('ranked rows should surface the agent reason');
  }
});

steps.then('a reject control should restore the pre-rank order and selection', function () {
  if (!this.indexHtml.includes('id="learnerMemoryReject"')) {
    throw new Error('index.html missing #learnerMemoryReject control');
  }
  if (!this.indexHtml.includes('不采纳')) {
    throw new Error('reject control should be labeled 不采纳');
  }
  const js = this.projectManagerJs;
  if (!js.includes('function rejectMemoryRecommendation')) {
    throw new Error('missing rejectMemoryRecommendation handler');
  }
  const idx = js.indexOf('function rejectMemoryRecommendation');
  const seg = js.slice(idx, idx + 500);
  // 还原推荐前的顺序与勾选快照
  if (!seg.includes('snapshot')) {
    throw new Error('reject should restore order + selection from the pre-rank snapshot');
  }
  if (!js.includes('function applyMemoryRanking') || js.indexOf('snapshot =') < 0) {
    throw new Error('ranking application should first snapshot order + selection');
  }
});

steps.then('rank failure should degrade silently to manual selection', function () {
  const idx = this.projectManagerJs.indexOf("invoke('rank_learner_courses'");
  if (idx < 0) {
    throw new Error('project-manager.js missing rank_learner_courses invoke');
  }
  const seg = this.projectManagerJs.slice(idx, idx + 500);
  if (!seg.includes('catch')) {
    throw new Error('rank invoke must be wrapped in try/catch so failure is non-fatal');
  }
});

steps.then('rank_learner_courses and list_learner_courses_detail should be registered', function () {
  if (!this.libRs.includes('list_learner_courses_detail')) {
    throw new Error('lib.rs missing list_learner_courses_detail command');
  }
  if (!this.libRs.includes('rank_learner_courses')) {
    throw new Error('lib.rs missing rank_learner_courses command');
  }
});

steps.then('memory_rank should build a compact prompt and parse validated rankings', function () {
  if (!this.memoryRankRs.includes('pub fn build_rank_prompt')) {
    throw new Error('memory_rank.rs missing build_rank_prompt');
  }
  if (!this.memoryRankRs.includes('pub fn parse_rank_response')) {
    throw new Error('memory_rank.rs missing parse_rank_response');
  }
  // 防御式解析：丢弃 LLM 幻觉出的未知 path
  if (!this.memoryRankRs.includes('valid') && !this.memoryRankRs.includes('known')) {
    throw new Error('parse should drop unknown/hallucinated course paths');
  }
});

steps.then('plan injection should accept an explicit memory course selection', function () {
  // 选中集取代布尔开关：None=旧行为全量注入；Some(paths)=只注入选中课程；
  // Some([])=用户取消全部勾选 = 完全不注入
  if (!this.aiAgentRs.includes('memory_courses: Option<Vec<String>>')) {
    throw new Error('plan_course_llm missing memory_courses selection parameter');
  }
  if (!this.aiAgentRs.includes('aggregate_selected_learner_context')) {
    throw new Error('plan should call aggregate_selected_learner_context (path-filtered)');
  }
  // 空选中集必须在聚合前短路（不读盘、不注入）——门控 match 块内检查
  const gateIdx = this.aiAgentRs.indexOf('match &memory_courses');
  const aggIdx = this.aiAgentRs.indexOf('aggregate_selected_learner_context', gateIdx);
  if (gateIdx < 0 || aggIdx < 0 || aggIdx - gateIdx > 600) {
    throw new Error('plan gating block must wrap the selected aggregation call');
  }
  const gateSeg = this.aiAgentRs.slice(gateIdx, gateIdx + 600);
  if (!gateSeg.includes('is_empty()')) {
    throw new Error('empty selection should short-circuit to None before aggregation');
  }
  // 前端把勾选集合透传为 memoryCourses
  const inv = this.projectManagerJs.indexOf("invoke('plan_course_llm'");
  const seg = this.projectManagerJs.slice(inv, inv + 400);
  if (!seg.includes('memoryCourses')) {
    throw new Error('frontend should pass memoryCourses from the checkbox set');
  }
});

steps.then('completed course load should invoke backfill_completion_profile', function () {
  if (!this.projectResumeJs.includes('backfill_completion_profile')) {
    throw new Error('project-resume.js missing backfill_completion_profile invoke');
  }
  // 只在课程完结时调用
  const idx = this.projectResumeJs.indexOf('backfill_completion_profile');
  const seg = this.projectResumeJs.slice(Math.max(0, idx - 400), idx);
  if (!seg.includes('courseCompleted')) {
    throw new Error('backfill should be gated on courseCompleted');
  }
});

steps.then('the backfill call should be best-effort', function () {
  const idx = this.projectResumeJs.indexOf('backfill_completion_profile');
  const seg = this.projectResumeJs.slice(idx, idx + 400);
  if (!seg.includes('.catch(')) {
    throw new Error('backfill invoke should catch errors (best-effort)');
  }
});

module.exports = steps;
