#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * BDD Acceptance Steps for 课程案例研习（Sprint 17）
 *
 * 真实文件系统 + 真实前端模块：
 * - CaseStudyModal（require dist/scripts/learning/case-study-modal）
 * - mock-tauri 真实 fs（case_study_chat/save/list 三命令）
 * - 静态接线检查（skill / agent-bridge / lib.rs / index.html）
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { StepRegistry } = require('../shared/runner');

// DOM mock 必须在 require 前端模块之前（模块顶层会探测 document）
global.document = global.document || {};
global.document.createElement = (tag) => {
  const el = {
    tagName: tag,
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    className: '',
    style: { cssText: '' },
    innerHTML: '',
    textContent: '',
    value: '',
    children: [],
    appendChild: (c) => { el.children.push(c); return c; },
    remove: () => {},
    removeChild: () => {},
    addEventListener: () => {},
    querySelector: () => ({
      addEventListener: () => {}, remove: () => {}, focus: () => {}, click: () => {},
      appendChild: (c) => c, setAttribute: () => {}, getAttribute: () => null,
      style: {}, classList: { add: () => {}, remove: () => {} }, textContent: ''
    }),
    querySelectorAll: () => [],
    setAttribute: () => {}, getAttribute: () => null, focus: () => {}, click: () => {}
  };
  return el;
};
global.document.getElementById = global.document.getElementById || (() => null);
global.document.body = global.document.body || { appendChild: () => {}, removeChild: () => {} };
global.document.addEventListener = global.document.addEventListener || (() => {});
global.document.removeEventListener = global.document.removeEventListener || (() => {});

const mockTauri = require('./mock-tauri'); // sets global.window.__TAURI__ (real fs)
global.window.confirm = () => true; // 二次确认自动通过

const { CaseStudyModal } = require('../../dist/scripts/learning/case-study-modal');

const steps = new StepRegistry();

const SKILL_MD = path.join(__dirname, '../../src-tauri/skills/typora-course-case-study/SKILL.md');
const BRIDGE = path.join(__dirname, '../../agent-bridge.mjs');
const LIB_RS = path.join(__dirname, '../../src-tauri/src/lib.rs');
const AI_AGENT_RS = path.join(__dirname, '../../src-tauri/src/ai_agent.rs');
const INDEX_HTML = path.join(__dirname, '../../dist/index.html');
const MAIN_JS = path.join(__dirname, '../../dist/scripts/main.js');
const MODE_INTEGRATION_JS = path.join(__dirname, '../../dist/scripts/learning/mode-integration.js');
const LEARNING_CSS = path.join(__dirname, '../../dist/styles/learning.css');
const MAIN_CSS = path.join(__dirname, '../../dist/styles/main.css');

let _tmpDirs = [];

function tmpdir(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'cs17-'));
  _tmpDirs.push(d);
  return d;
}

function writeSession(projectPath, endedAt, selectedText, turnCount) {
  const dir = path.join(projectPath, '.learning', 'case-studies');
  fs.mkdirSync(dir, { recursive: true });
  const session = {
    version: '1.0',
    selected_text: selectedText,
    chapter_file: '01-ch.md',
    session_id: 's-1',
    turns: Array.from({ length: turnCount }, (_, i) => ({ role: i % 2 ? 'user' : 'tutor', content: `t${i}` })),
    started_at: endedAt,
    ended_at: endedAt,
    end_reason: 'user_ended'
  };
  const file = path.join(dir, endedAt.replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(file, JSON.stringify(session, null, 2), 'utf-8');
  return session;
}

// ============================================
// Given
// ============================================
steps.given('a course project and a selected concept', function() {
  this.projectPath = tmpdir('cs17-new-');
  this.modal = new CaseStudyModal({
    projectPath: this.projectPath,
    selectedText: 'rdfs:domain',
    context: { chapterTitle: '第0章', chapterGoal: '掌握 RDFS 词汇', surroundingText: '' },
    chapterFile: '00-ch.md'
  });
});

steps.given('an opened case study modal with a generated case', async function() {
  this.projectPath = tmpdir('cs17-open-');
  this.modal = new CaseStudyModal({
    projectPath: this.projectPath,
    selectedText: 'rdfs:domain',
    context: null,
    chapterFile: '00-ch.md'
  });
  await this.modal.open();
});

steps.given('an opened case study modal with dialogue turns', async function() {
  this.projectPath = tmpdir('cs17-end-');
  this.modal = new CaseStudyModal({
    projectPath: this.projectPath,
    selectedText: 'rdfs:domain',
    context: null,
    chapterFile: '00-ch.md'
  });
  await this.modal.open(); // 首轮
  this.modal._shell.takeInput = () => '那 range 呢？';
  await this.modal._handleSend(); // 追问一轮
});

steps.given('an opened case study modal whose save will fail', async function() {
  this.projectPath = tmpdir('cs17-fail-');
  this.modal = new CaseStudyModal({
    projectPath: this.projectPath,
    selectedText: 'rdfs:domain',
    context: null,
    chapterFile: '00-ch.md'
  });
  await this.modal.open();
  // 让 save 失败：目录占位为文件，mkdir 必败
  fs.writeFileSync(path.join(this.projectPath, '.learning'), 'block');
});

steps.given('two saved case study sessions on disk', function() {
  this.projectPath = tmpdir('cs17-hist-');
  writeSession(this.projectPath, '2026-08-10T10:00:00', 'rdfs:domain', 4);
  writeSession(this.projectPath, '2026-08-11T09:00:00', 'rdf:type', 6);
});

steps.given('a saved case study session on disk', async function() {
  this.projectPath = tmpdir('cs17-ro-');
  writeSession(this.projectPath, '2026-08-11T09:00:00', 'rdf:type', 4);
  // 走真实 listing 拿会话（与生产同路径）：file 字段由 list_sessions 注入，
  // 续聊落盘靠它覆盖原文件
  const listed = await global.window.__TAURI__.core.invoke('case_study_list_sessions', {
    projectPath: this.projectPath
  });
  this.savedSession = listed[0];
  this.savedTurnCount = (this.savedSession.turns || []).length;
});

steps.given('the real project sources', function() {
  this.skillContent = fs.readFileSync(SKILL_MD, 'utf-8');
  this.bridgeContent = fs.readFileSync(BRIDGE, 'utf-8');
  this.libRs = fs.readFileSync(LIB_RS, 'utf-8');
  this.aiAgentRs = fs.readFileSync(AI_AGENT_RS, 'utf-8');
  this.indexHtml = fs.readFileSync(INDEX_HTML, 'utf-8');
  this.mainJs = fs.readFileSync(MAIN_JS, 'utf-8');
  this.modeIntegration = fs.readFileSync(MODE_INTEGRATION_JS, 'utf-8');
  this.learningCss = fs.readFileSync(LEARNING_CSS, 'utf-8');
});

// ============================================
// When
// ============================================
steps.when('the case study modal opens', async function() {
  await this.modal.open();
});

steps.when('the user sends a follow-up question', async function() {
  this.modal._shell.takeInput = () => '如果换成酒店预订领域呢？';
  await this.modal._handleSend();
});

steps.when('the user ends the session', async function() {
  this.modal._handleEndClick(); // confirm=true → confirmEnd
  await new Promise(r => setTimeout(r, 50)); // 等 confirmEnd 的异步落盘
});

steps.when('case study history is listed', async function() {
  this.sessions = await global.window.__TAURI__.core.invoke('case_study_list_sessions', {
    projectPath: this.projectPath
  });
});

steps.when('the session is reopened for resume', async function() {
  this.callsBefore = mockTauri.getCaseStudyChatCalls().length;
  this.modal = new CaseStudyModal({ projectPath: this.projectPath, savedSession: this.savedSession });
  await this.modal.open();
});

steps.when('the user reopens it without sending anything and ends', async function() {
  const dir = path.join(this.projectPath, '.learning', 'case-studies');
  const file = fs.readdirSync(dir).filter(f => f.endsWith('.json'))[0];
  this.beforeContent = fs.readFileSync(path.join(dir, file), 'utf-8');
  this.modal = new CaseStudyModal({ projectPath: this.projectPath, savedSession: this.savedSession });
  await this.modal.open();
  this.modal._handleEndClick();
  await new Promise(r => setTimeout(r, 50));
});

steps.when('the user continues the conversation and ends it', async function() {
  this.modal = new CaseStudyModal({ projectPath: this.projectPath, savedSession: this.savedSession });
  await this.modal.open();
  this.modal._shell.takeInput = () => '那 range 呢？';
  await this.modal._handleSend();
  this.modal._handleEndClick(); // confirm=true → confirmEnd
  await new Promise(r => setTimeout(r, 50)); // 等 confirmEnd 的异步落盘
});

// ============================================
// Then
// ============================================
steps.then('case_study_chat should be invoked with the selected concept and no user answer', function() {
  const calls = mockTauri.getCaseStudyChatCalls();
  const last = calls[calls.length - 1];
  if (!last) throw new Error('case_study_chat was not invoked');
  if (last.selectedText !== 'rdfs:domain') {
    throw new Error(`selectedText mismatch: ${last.selectedText}`);
  }
  if (last.userAnswer !== null && last.userAnswer !== undefined) {
    throw new Error(`first turn should have no userAnswer, got: ${last.userAnswer}`);
  }
});

steps.then('case_study_chat should be invoked with the answer and captured session id', function() {
  const calls = mockTauri.getCaseStudyChatCalls();
  const last = calls[calls.length - 1];
  if (!last || !last.userAnswer) throw new Error('follow-up call missing userAnswer');
  if (last.userAnswer !== '如果换成酒店预订领域呢？') {
    throw new Error(`unexpected userAnswer: ${last.userAnswer}`);
  }
  if (last.sessionId !== 'mock-case-session-1') {
    throw new Error(`session id not captured from first turn, got: ${last.sessionId}`);
  }
});

steps.then('a session file should be written under case-studies with the contract fields', function() {
  const dir = path.join(this.projectPath, '.learning', 'case-studies');
  if (!fs.existsSync(dir)) throw new Error('case-studies dir not created');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (files.length !== 1) throw new Error(`expected 1 session file, got ${files.length}`);
  const s = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf-8'));
  for (const key of ['selected_text', 'chapter_file', 'turns', 'started_at', 'ended_at', 'end_reason']) {
    if (!(key in s)) throw new Error(`session missing contract field: ${key}`);
  }
  if (s.selected_text !== 'rdfs:domain') throw new Error('selected_text mismatch');
  if (!Array.isArray(s.turns) || s.turns.length < 3) {
    throw new Error(`expected ≥3 turns (首轮+追问+回答), got ${(s.turns || []).length}`);
  }
});

steps.then('the modal should stay open and allow retrying the save', function() {
  if (this.modal.opened !== true) throw new Error('modal closed despite save failure');
  if (this.modal._sessionSaved !== false) {
    throw new Error('_sessionSaved should reset to false after failure for retry');
  }
});

steps.then('sessions should come back newest first', function() {
  if (!Array.isArray(this.sessions) || this.sessions.length !== 2) {
    throw new Error(`expected 2 sessions, got ${(this.sessions || []).length}`);
  }
  if (this.sessions[0].selected_text !== 'rdf:type') {
    throw new Error(`newest first violated: ${this.sessions[0].selected_text}`);
  }
});

steps.then('no case_study_chat call should happen and the input should be enabled', function() {
  const callsAfter = mockTauri.getCaseStudyChatCalls().length;
  if (callsAfter !== this.callsBefore) {
    throw new Error('resuming a history session must not trigger case_study_chat');
  }
  if (this.modal._resumed !== true) throw new Error('modal not in resume mode');
  if (this.modal._sessionSaved !== false) {
    throw new Error('resumed session should be persisted on close (not pre-marked saved)');
  }
  if (!Array.isArray(this.modal.turns) || this.modal.turns.length !== this.savedTurnCount) {
    throw new Error(
      `saved turns not seeded into turns: expected ${this.savedTurnCount}, ` +
      `got ${(this.modal.turns || []).length}（不灌入会在落盘时截断原对话）`
    );
  }
  if (this.modal._shell.inputEl && this.modal._shell.inputEl.disabled) {
    throw new Error('input should stay enabled so the user can continue the conversation');
  }
});

steps.then('the session file should be left untouched', function() {
  const dir = path.join(this.projectPath, '.learning', 'case-studies');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (files.length !== 1) throw new Error(`expected 1 session file, got ${files.length}`);
  const after = fs.readFileSync(path.join(dir, files[0]), 'utf-8');
  if (after !== this.beforeContent) {
    throw new Error('翻开历史未追问却重写了会话文件（ended_at 被污染，条目会无端置顶）');
  }
});

steps.then('the history should keep a single entry with all turns preserved', function() {
  const dir = path.join(this.projectPath, '.learning', 'case-studies');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (files.length !== 1) {
    throw new Error(
      `expected 1 session file（续聊覆盖原文件，不新增重复条目）, got ${files.length}: ${files.join(', ')}`
    );
  }
  const s = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf-8'));
  const expected = this.savedTurnCount + 2; // 旧轮次 + 新追问 + 新回答
  if ((s.turns || []).length !== expected) {
    throw new Error(`turns truncated: expected ${expected}, got ${(s.turns || []).length}`);
  }
  if (s.started_at !== '2026-08-11T09:00:00') {
    throw new Error(`started_at should be preserved on resume, got ${s.started_at}`);
  }
});

steps.then('the case study skill should exist with valid frontmatter and constraints', function() {
  if (!this.skillContent.includes('name: typora-course-case-study')) {
    throw new Error('SKILL.md missing typora-course-case-study name frontmatter');
  }
  if (!this.skillContent.includes('禁止半角双引号')) {
    throw new Error('SKILL.md missing 禁止半角双引号 constraint');
  }
  if (!this.skillContent.includes('📖 情境') || !this.skillContent.includes('🔍 分析') || !this.skillContent.includes('🔗 回扣')) {
    throw new Error('SKILL.md missing three-part case structure');
  }
});

steps.then('the bridge should wire the case-study stage', function() {
  if (!this.bridgeContent.includes("case 'case-study'")) {
    throw new Error('agent-bridge.mjs missing case-study stage');
  }
  if (!this.bridgeContent.includes('typora-course-case-study skill')) {
    throw new Error('agent-bridge.mjs does not reference the skill by name');
  }
});

steps.then('Rust should register the case study commands', function() {
  if (!this.aiAgentRs.includes('pub async fn case_study_chat')) {
    throw new Error('ai_agent.rs missing case_study_chat');
  }
  for (const cmd of ['ai_agent::case_study_chat', 'case_study_save_session', 'case_study_list_sessions']) {
    if (!this.libRs.includes(cmd)) throw new Error(`lib.rs missing registration: ${cmd}`);
  }
});

steps.then('index.html should load the case study modules', function() {
  if (!this.indexHtml.includes('scripts/learning/notebook-modal.js')) {
    throw new Error('index.html does not load notebook-modal.js');
  }
  if (!this.indexHtml.includes('scripts/learning/case-study-modal.js')) {
    throw new Error('index.html does not load case-study-modal.js');
  }
});

// ============================================
// UX 修正（2026-08-11）：原地触发 + 防遮挡
// ============================================
steps.then('the selection toolbar should contain a case study button', function() {
  if (!this.mainJs.includes('id="caseStudySelectionBtn"')) {
    throw new Error('selection toolbar missing caseStudySelectionBtn');
  }
});

steps.then('the selection toolbar should toggle it together with the explain button', function() {
  const fnIdx = this.mainJs.indexOf('function showSelectionToolbar');
  if (fnIdx < 0) throw new Error('main.js missing showSelectionToolbar');
  const body = this.mainJs.slice(fnIdx, fnIdx + 1200);
  if (!body.includes('caseStudySelectionBtn')) {
    throw new Error('showSelectionToolbar does not toggle caseStudySelectionBtn');
  }
  if (!body.includes("AppWorkspace.isIn('course')")) {
    throw new Error('case button visibility not gated on course mode');
  }
});

steps.then('the case study click should call openCaseStudy with the selected text', function() {
  const btnIdx = this.mainJs.indexOf("querySelector('#caseStudySelectionBtn').addEventListener");
  if (btnIdx < 0) throw new Error('caseStudySelectionBtn click handler not bound');
  const body = this.mainJs.slice(btnIdx, btnIdx + 800);
  if (!body.includes('openCaseStudy(text)')) {
    throw new Error('click handler does not call openCaseStudy(text)');
  }
});

steps.then('the cornell sidebar should place action buttons in an actions row', function() {
  if (!this.modeIntegration.includes('cornell-sidebar-actions')) {
    throw new Error('mode-integration missing cornell-sidebar-actions row');
  }
});

steps.then('the footer should not carry the action buttons', function() {
  const footerIdx = this.modeIntegration.indexOf('class="cornell-sidebar-footer"');
  if (footerIdx < 0) throw new Error('mode-integration missing sidebar footer');
  const closeIdx = this.modeIntegration.indexOf('</div>', footerIdx);
  const footerBlock = this.modeIntegration.slice(footerIdx, closeIdx);
  if (footerBlock.includes('cornellExplainBtn') || footerBlock.includes('caseStudyBtn')) {
    throw new Error('action buttons still inside the footer (overlapped by fixed progress bar)');
  }
});

steps.then('the stylesheet should not restyle the footer as flex', function() {
  if (/\.cornell-sidebar-footer\s*\{[^}]*display:\s*flex/.test(this.learningCss)) {
    throw new Error('learning.css still restyles .cornell-sidebar-footer as flex');
  }
  if (!this.learningCss.includes('.cornell-sidebar-actions')) {
    throw new Error('learning.css missing .cornell-sidebar-actions style');
  }
});

// ============================================
// UX 第二轮（2026-08-11）：作用域 / 按钮取舍 / 流式 / 渲染
// ============================================
steps.then('the selection toolbar mouseup handler should be scoped to markdownBody', function() {
  if (!this.mainJs.includes('elements.markdownBody.contains(parentEl)')) {
    throw new Error('selection toolbar mouseup handler not scoped to markdownBody');
  }
});

steps.then('the course selection tracking should be scoped to markdownBody', function() {
  const idx = this.modeIntegration.indexOf('function onSelectionChange');
  if (idx < 0) throw new Error('mode-integration missing onSelectionChange');
  const body = this.modeIntegration.slice(idx, idx + 1200);
  if (!body.includes('mdBody.contains(node)')) {
    throw new Error('onSelectionChange not scoped to markdownBody');
  }
});

steps.then('the cornell sidebar should not contain an explain button', function() {
  const tplIdx = this.modeIntegration.indexOf('cornell-sidebar-actions');
  if (tplIdx < 0) throw new Error('mode-integration missing actions row');
  const actionsBlock = this.modeIntegration.slice(tplIdx, tplIdx + 400);
  if (actionsBlock.includes('cornellExplainBtn')) {
    throw new Error('explain button still in sidebar actions row');
  }
});

steps.then('the case study sidebar button should open history directly', function() {
  const idx = this.modeIntegration.indexOf("getElementById('caseStudyBtn')");
  if (idx < 0) throw new Error('caseStudyBtn binding missing');
  const body = this.modeIntegration.slice(idx, idx + 400);
  if (!body.includes('openHistory')) {
    throw new Error('caseStudyBtn does not open history directly');
  }
  if (body.includes('openCaseStudy(_pendingSelectedText)')) {
    throw new Error('sidebar button still creates new case from selection');
  }
});

steps.then('the bridge should emit case study deltas', function() {
  if (!this.bridgeContent.includes("emit('case_study_delta'")) {
    throw new Error('bridge does not emit case_study_delta');
  }
});

steps.then('Rust should stream case study events to the frontend', function() {
  if (!this.aiAgentRs.includes('emit("case-study-event"')) {
    throw new Error('ai_agent.rs does not emit case-study-event');
  }
});

steps.then('the modal should listen for case study delta events', function() {
  const modalSrc = fs.readFileSync(
    path.join(__dirname, '../../dist/scripts/learning/case-study-modal.js'), 'utf-8');
  if (!modalSrc.includes("listen('case-study-event'")) {
    throw new Error('case-study-modal does not listen case-study-event');
  }
});

steps.then('the shell should support streaming bubbles', function() {
  const shellSrc = fs.readFileSync(
    path.join(__dirname, '../../dist/scripts/learning/notebook-modal.js'), 'utf-8');
  if (!shellSrc.includes('startTutorStream')) {
    throw new Error('notebook-modal missing startTutorStream');
  }
});

steps.then('the shell should render tutor bubbles via markdownToHtml with escape fallback', function() {
  const shellSrc = fs.readFileSync(
    path.join(__dirname, '../../dist/scripts/learning/notebook-modal.js'), 'utf-8');
  if (!shellSrc.includes('window.markdownToHtml')) {
    throw new Error('shell does not use window.markdownToHtml');
  }
  if (!shellSrc.includes('escapeHtml(text)')) {
    throw new Error('shell missing escapeHtml fallback');
  }
});

// ============================================
// 气泡代码块配色回归（2026-09-17 实爆）
//
// 现场：案例研习（及苏格拉底）气泡里，白天主题下代码块几乎不可读、
// 深色主题正常。根因是 .socratic-bubble-md pre 用了半透明灰底
// rgba(127,127,127,0.12)（白天合成出浅底），而代码文字色来自
// main.css `pre code { color: #cdd6f4 }`——那是专为深底设计的浅字。
// 本步骤不锁死具体色值，只验证「气泡代码块底色不透明 + 与文字色对比度
// 达到 WCAG AA」，因此换色方案也能通过、配色写错则必红。
// ============================================

function parseHexColor(v) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
}

function parseRgbColor(v) {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(String(v).trim());
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
}

function parseColor(v) { return parseHexColor(v) || parseRgbColor(v); }

/** WCAG 2.x 相对亮度 */
function relativeLuminance(c) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** 取 CSS 声明块里某属性的值（同一 selector 多次出现时取最后一条） */
function declaredValue(css, selectorSource, prop, flags) {
  // 必须先剔除注释：注释里可能出现 `}`（例如 `pre { background: #1e1e2e }`），
  // 会让 [^}]* 提前截断声明块 → 取不到属性 → 测试假绿。
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = new RegExp(selectorSource + '\\s*\\{([^}]*)\\}', flags || 'g');
  let m, last = null;
  while ((m = re.exec(clean)) !== null) last = m[1];
  if (last === null) return null;
  const pm = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'i').exec(last);
  return pm ? pm[1].trim() : null;
}

steps.then('the case study bubble code blocks should be readable in both themes', function() {
  const mainCss = fs.readFileSync(MAIN_CSS, 'utf-8');

  // 代码文字色：正文代码块的单一事实源 main.css `pre code { color: #cdd6f4 }`
  const codeColorRaw = declaredValue(mainCss, '^pre code', 'color', 'gm');
  if (!codeColorRaw) throw new Error('main.css 未定义 pre code 文字色，气泡代码块的配色契约失效');
  const codeColor = parseColor(codeColorRaw);
  if (!codeColor) throw new Error(`无法解析 pre code 文字色: ${codeColorRaw}`);

  // 气泡代码块有效底色：优先 .socratic-bubble-md pre，未声明则回落正文 pre
  const bubbleBgRaw = declaredValue(this.learningCss, '\\.socratic-bubble-md pre(?![\\w-])', 'background')
    || declaredValue(mainCss, '^pre(?![\\w\\[.:])', 'background', 'gm');
  if (!bubbleBgRaw) throw new Error('未找到气泡代码块的底色声明');
  const bubbleBg = parseColor(bubbleBgRaw);
  if (!bubbleBg) throw new Error(`无法解析气泡代码块底色: ${bubbleBgRaw}`);

  // 半透明底色会与气泡背景合成：白天主题近白底、深色主题近暗底，
  // 不可能同时安全 → 直接判定回归（这正是本次 bug 的形态）
  if (bubbleBg.a < 1) {
    throw new Error(
      `气泡代码块底色是半透明的（${bubbleBgRaw}）：` +
      '会随主题合成出不同底色，白天主题下与浅色代码文字对比不足。' +
      '应使用与正文代码块一致的不透明深色底。'
    );
  }

  const ratio = contrastRatio(bubbleBg, codeColor);
  if (ratio < 4.5) {
    throw new Error(
      `气泡代码块对比度仅 ${ratio.toFixed(2)}:1（底 ${bubbleBgRaw} / 字 ${codeColorRaw}），` +
      '低于 WCAG AA 4.5:1 —— 白天主题下代码不可读。'
    );
  }
});

steps._cleanup = function() {
  for (const d of _tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
  _tmpDirs = [];
};

module.exports = steps;
