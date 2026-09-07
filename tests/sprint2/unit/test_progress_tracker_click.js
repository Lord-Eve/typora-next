#!/usr/bin/env node
/**
 * TDD Tests: 章节生成过程中，面板列表的点击可用性
 *
 * 回归背景（2026-09-03）：滑窗生成 2 章时，第 1 章 chapter_complete 后状态
 * 已置 ready，但 _bindEvents 只在 render() 时给「当时已 .clickable」的元素绑
 * listener，增量 updateChapter() 只加 class 不绑 listener → 用户看得见能点、
 * 实际是死区，直到全部完成触发完整 render() 才恢复。
 *
 * 期望行为：
 * 1. 生成中，某章变 ready 后立即可点击触发 onChapterClick(index)
 * 2. generating/not_generated 的章点击不触发
 * 3. 生成中某章失败，updateChapter 后重试按钮即时出现且可点，且不误触 onChapterClick
 */

const TestRunner = require('../../shared/test-runner');
const { buildMockDOM } = require('../../shared/mock-dom');

function setupEnv() {
  const { document } = buildMockDOM();
  global.document = document;
  global.window = {
    document,
    addEventListener() {},
    removeEventListener() {}
  };
  const path = require('path');
  const modPath = path.join(__dirname, '../../../dist/scripts/learning/progress-tracker.js');
  delete require.cache[require.resolve(modPath)];
  require(modPath);
  return global.window.LearningProgress;
}

function makeUI() {
  const LP = setupEnv();
  const container = global.document.createElement('div');
  global.document.body.appendChild(container);
  const manager = new LP.ChapterStatusManager([{ title: '第一章' }, { title: '第二章' }]);
  const ui = new LP.ProgressUI(container);
  ui.projectPath = 'P:/proj';
  return { LP, container, manager, ui };
}

function itemByIndex(container, index) {
  return container.querySelectorAll('[data-index]').find(
    el => el.dataset.index === String(index) && el.classList.contains('learning-chapter-item')
  );
}

// ============================================
// Test 1: 生成中完成的章节立即可点
// ============================================
TestRunner.test('chapter that becomes ready mid-generation is immediately clickable', () => {
  const { container, manager, ui } = makeUI();

  const clicked = [];
  ui.onChapterClick = (i) => clicked.push(i);

  // 生成开始：ch0 generating，ch1 排队；面板此时的 render 里没有任何 clickable 项
  manager.setStatus(0, 'generating');
  ui.init(manager);

  // chapter_complete(0)：状态机置 ready + 增量更新（不整面板 re-render）
  manager.setStatus(0, 'ready');
  manager.setChapterFile(0, 'P:/proj/00-第一章.md');
  ui.updateChapter(0);

  const item0 = itemByIndex(container, 0);
  TestRunner.assertExists(item0, 'chapter 0 row exists');
  TestRunner.assert(item0.classList.contains('clickable'), 'row 0 marked clickable after updateChapter');

  item0.click();
  TestRunner.assertEquals(clicked.length, 1, 'click handler fired exactly once');
  TestRunner.assertEquals(clicked[0], 0, 'onChapterClick received index 0');
});

// ============================================
// Test 2: 点击落在行内子元素（标题 span）同样生效
// ============================================
TestRunner.test('click on inner title span of a ready chapter still opens it', () => {
  const { container, manager, ui } = makeUI();

  const clicked = [];
  ui.onChapterClick = (i) => clicked.push(i);

  manager.setStatus(0, 'generating');
  ui.init(manager);
  manager.setStatus(0, 'ready');
  ui.updateChapter(0);

  const item0 = itemByIndex(container, 0);
  const title = item0.querySelector('.learning-chapter-title');
  TestRunner.assertExists(title, 'title span exists');
  title.click();

  TestRunner.assertEquals(clicked.length, 1, 'delegated handler fired for inner element click');
  TestRunner.assertEquals(clicked[0], 0, 'index resolved from closest item');
});

// ============================================
// Test 3: 未就绪的章节点击不触发
// ============================================
TestRunner.test('clicking a generating/not_generated chapter does not fire onChapterClick', () => {
  const { container, manager, ui } = makeUI();

  const clicked = [];
  ui.onChapterClick = (i) => clicked.push(i);

  manager.setStatus(0, 'generating');
  ui.init(manager);

  const item1 = itemByIndex(container, 1);
  TestRunner.assertExists(item1, 'chapter 1 row exists');
  TestRunner.assert(!item1.classList.contains('clickable'), 'row 1 not clickable');
  item1.click();

  TestRunner.assertEquals(clicked.length, 0, 'no open attempted for non-ready chapter');
});

// ============================================
// Test 4: 生成中失败 → 重试按钮即时出现且可点
// ============================================
TestRunner.test('chapter failing mid-generation gets a working retry button via updateChapter', () => {
  const { container, manager, ui } = makeUI();

  const clicked = [];
  const retried = [];
  ui.onChapterClick = (i) => clicked.push(i);
  ui.onRetryClick = (i) => retried.push(i);

  manager.setStatus(0, 'generating');
  ui.init(manager);

  // chapter_failed(0)：仅增量更新
  manager.setStatus(0, 'failed');
  ui.updateChapter(0);

  const item0 = itemByIndex(container, 0);
  const retryBtn = item0.querySelector('.learning-retry-btn');
  TestRunner.assertExists(retryBtn, 'retry button appears without full re-render');

  retryBtn.click();
  TestRunner.assertEquals(retried.length, 1, 'onRetryClick fired');
  TestRunner.assertEquals(retried[0], 0, 'retry received index 0');
  TestRunner.assertEquals(clicked.length, 0, 'retry click does not open the chapter');
});

TestRunner.run();
