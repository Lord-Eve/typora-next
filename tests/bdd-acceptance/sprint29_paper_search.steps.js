#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * BDD Acceptance Steps for Sprint 29: Paper Search (AnySearch)
 *
 * Drives the REAL paper-search.js frontend module with mocked Tauri invoke.
 * UX state machine under test:
 *   form → searching → results → import(progress) → open tab
 *   failures stay on results list with concrete error (Sprint 2 lesson);
 *   missing API key degrades to a guided hint, never a dead end.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { StepRegistry } = require('../shared/runner');
const { buildMockDOM } = require('../shared/mock-dom');

require('./mock-tauri');

// ============================================================
// State
// ============================================================
let __importShouldFail = false;
let __searchShouldFail = false;
let __anysearchKeyConfigured = true;
let __tabs = [];
let __lastImportUrl = null;
let __importedList = [];
let __importCallCount = 0;

// ============================================================
// Search fixtures (keyword → canned academic results)
// ============================================================
const SEARCH_FIXTURES = {
  '铝电解因果建模': [
    { title: '铝电解过程因果建模与数据驱动决策方法', url: 'https://arxiv.org/abs/2401.10001', year: 2024 },
    { title: 'Causal Discovery in Aluminum Electrolysis Cells', url: 'https://arxiv.org/abs/2305.20002', year: 2023 },
    { title: '基于本体论的铝电解领域知识建模', url: 'https://arxiv.org/abs/2203.30003', year: 2022 }
  ],
  '本体论建模': [
    { title: '本体论建模方法论综述', url: 'https://arxiv.org/abs/2101.40004', year: 2021 },
    { title: 'Ontology Modeling for Data Teams', url: 'https://arxiv.org/abs/2007.50005', year: 2020 },
    { title: '领域本体论构建实践指南', url: 'https://arxiv.org/abs/1904.60006', year: 2019 }
  ],
  '铝电解': [
    { title: '铝电解槽优化控制方法综述', url: 'https://arxiv.org/abs/2402.70007', year: 2024 },
    { title: 'Aluminum Electrolysis Process Modeling', url: 'https://arxiv.org/abs/2301.80008', year: 2023 },
    { title: '铝电解质成分在线检测方法研究', url: 'https://arxiv.org/abs/2206.90009', year: 2022 }
  ]
};

function fixtureFor(query) {
  if (SEARCH_FIXTURES[query]) return SEARCH_FIXTURES[query];
  if (query === 'zzzqqqnonexistent') return [];
  return [
    { title: `${query} 研究进展`, url: 'https://arxiv.org/abs/2401.11111', year: 2024 },
    { title: `A Survey on ${query}`, url: 'https://arxiv.org/abs/2301.22222', year: 2023 }
  ];
}

// ============================================================
// Mock Tauri invoke for paper search
// ============================================================
const originalInvoke = global.window.__TAURI__?.core?.invoke;
global.window.__TAURI__ = global.window.__TAURI__ || { core: {} };
const mockInvoke = async (cmd, args) => {
  switch (cmd) {
    case 'search_papers': {
      if (__searchShouldFail) throw new Error('AnySearch 服务不可用 (mock)');
      const query = (args && args.query) || '';
      return { results: fixtureFor(query) };
    }
    case 'import_paper_from_url': {
      if (__importShouldFail === 'no-oa') throw new Error('URL 不支持: 未找到开放获取 PDF，请先下载 PDF 后再导入');
      if (__importShouldFail) throw new Error('模拟导入失败：minerU 队列已满');
      const url = (args && args.url) || '';
      __lastImportUrl = url;
      __importCallCount++;
      // 模拟真实解析耗时，让进度状态可观测（否则太快，断言时已完成）
      await new Promise(r => setTimeout(r, 200));
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-search-import-'));
      const mdPath = path.join(tmpDir, '.learning', 'papers', '2026-09', 'searched-paper.md');
      fs.mkdirSync(path.dirname(mdPath), { recursive: true });
      fs.writeFileSync(mdPath, '# Searched Paper\n\nContent.', 'utf-8');
      return { md_path: mdPath, md_content: '# Searched Paper\n\nContent.', title: 'Searched Paper' };
    }
    case 'get_config': {
      return { anysearch_api_key: __anysearchKeyConfigured ? 'as_sk_mockkey123' : null };
    }
    case 'list_imported_papers': {
      return __importedList;
    }
    case 'read_text_file': {
      return '# Cached Paper\n\n此前缓存的论文内容。';
    }
    default:
      if (originalInvoke) return originalInvoke(cmd, args);
      throw new Error(`Mock invoke not implemented: ${cmd}`);
  }
};
global.window.__TAURI__.core.invoke = mockInvoke;

// ============================================================
// Load REAL frontend modules
// NOTE: 早先 Sprint 的 steps 文件可能已重写过 global.window，require 缓存
// 不会重新执行 paper-import.js —— 显式把导出绑回当前 window。
// ============================================================
const paperImportPath = path.join(__dirname, '../../dist/scripts/learning/paper-import.js');
const { PaperImport } = require(paperImportPath);
global.window.PaperImport = PaperImport;
const paperSearchPath = path.join(__dirname, '../../dist/scripts/learning/paper-search.js');
require(paperSearchPath);

// ============================================================
// TyporaNext stub (invoke passthrough + tab capture)
// ============================================================
global.window.TyporaNext = global.window.TyporaNext || {};
global.window.TyporaNext.invoke = global.window.__TAURI__.core.invoke;
global.window.TyporaNext.addTab = async (filePath, content, baseDir, options) => {
  __tabs.push({ path: filePath, content, baseDir, mode: options && options.mode });
};

// ============================================================
// Step definitions
// ============================================================
const steps = new StepRegistry();
let markdownBody = null;
let doc = null;

function findAll(sel) {
  return markdownBody.querySelectorAll(sel);
}

function find(sel) {
  return markdownBody.querySelector(sel);
}

steps.given('用户已进入论文导读模式', async () => {
  __importShouldFail = false;
  __searchShouldFail = false;
  __anysearchKeyConfigured = true;
  __tabs = [];
  __lastImportUrl = null;
  __importedList = [];
  __importCallCount = 0;
  const built = buildMockDOM();
  doc = built.document;
  global.document = doc;
  markdownBody = doc.createElement('div');
  markdownBody.id = 'markdownBody';
  doc.body.appendChild(markdownBody);
  const PaperSearch = global.window.PaperSearch;
  await PaperSearch.attach(markdownBody);
});

steps.when('用户输入领域关键词{string}', async (keyword) => {
  const input = find('.paper-search-input');
  if (!input) throw new Error('未找到搜索输入框');
  input.value = keyword;
});

steps.when('用户输入一个不可能命中的关键词{string}', async (keyword) => {
  const input = find('.paper-search-input');
  if (!input) throw new Error('未找到搜索输入框');
  input.value = keyword;
});

steps.when('点击搜索按钮', async () => {
  const btn = find('.paper-search-btn');
  if (!btn) throw new Error('未找到搜索按钮');
  btn.click();
  await new Promise(r => setTimeout(r, 50));
});

steps.then('显示搜索结果列表', async () => {
  const items = findAll('.paper-search-item');
  if (items.length === 0) throw new Error('搜索结果列表为空');
});

steps.then('每条结果包含标题和来源链接', async () => {
  const items = findAll('.paper-search-item');
  if (items.length === 0) throw new Error('没有搜索结果');
  for (const item of items) {
    const title = item.querySelector('.paper-search-title');
    if (!title || !title.textContent) throw new Error('结果缺少标题');
    const link = item.querySelector('.paper-search-link');
    if (!link || !link.href) throw new Error(`结果「${title.textContent}」缺少来源链接`);
  }
});

steps.then('返回的论文标题与关键词相关', async () => {
  const items = findAll('.paper-search-item');
  if (items.length === 0) throw new Error('没有搜索结果');
  for (const item of items) {
    const title = item.querySelector('.paper-search-title');
    const text = title ? title.textContent : '';
    if (!/本体论|Ontology|ontology/.test(text)) {
      throw new Error(`标题「${text}」与关键词不相关`);
    }
  }
});

steps.when('用户点击第{int}条结果的缓存按钮', async (n) => {
  const items = findAll('.paper-search-item');
  if (items.length < n) throw new Error(`结果只有 ${items.length} 条，无法点击第 ${n} 条`);
  const btn = items[n - 1].querySelector('.paper-search-import-btn');
  if (!btn) throw new Error('结果缺少缓存按钮');
  btn.click();
  await new Promise(r => setTimeout(r, 80));
});

steps.when('设定导入将会失败', async () => {
  __importShouldFail = true;
});

steps.then('进入缓存进度状态', async () => {
  if (!find('.paper-import-progress')) {
    throw new Error('未显示导入进度状态');
  }
});

steps.then('进度完成后该结果显示已缓存标记', async () => {
  // mock 导入耗时 200ms，等待其完成
  await new Promise(r => setTimeout(r, 300));
  if (!__lastImportUrl) throw new Error('缓存未被触发');
  if (findAll('.paper-search-cached-badge').length === 0) {
    throw new Error('缓存完成后未显示已缓存标记');
  }
  const openBtn = find('.paper-search-open-paper-btn');
  if (!openBtn) throw new Error('缓存完成后按钮未变为「打开」');
});

steps.then('不打开论文 tab', async () => {
  if (__tabs.length !== 0) throw new Error('缓存不应跳转到阅读（tab 被打开了）');
});

steps.then('仍显示搜索结果列表', async () => {
  const items = findAll('.paper-search-item');
  if (items.length === 0) throw new Error('导入失败后结果列表丢失');
});

steps.then('显示具体错误原因', async () => {
  const err = find('.paper-search-error');
  if (!err) throw new Error('未显示错误提示');
  if (!err.textContent || err.textContent.trim().length < 4) {
    throw new Error('错误提示缺少具体原因');
  }
  if (!/失败|不支持|错误|不可用/.test(err.textContent)) {
    throw new Error(`错误提示不含失败原因: ${err.textContent}`);
  }
});

steps.then('显示无结果提示', async () => {
  const empty = find('.paper-search-empty');
  if (!empty) throw new Error('未显示无结果提示');
});

steps.then('用户可以修改关键词重新搜索', async () => {
  const input = find('.paper-search-input');
  if (!input) throw new Error('搜索输入框丢失，无法重新搜索');
  input.value = '铝电解';
  const btn = find('.paper-search-btn');
  if (!btn) throw new Error('搜索按钮丢失，无法重新搜索');
  btn.click();
  await new Promise(r => setTimeout(r, 50));
  const items = findAll('.paper-search-item');
  if (items.length === 0) throw new Error('重新搜索后仍无结果');
});

steps.given('未配置 AnySearch API key', async () => {
  __anysearchKeyConfigured = false;
});

steps.when('用户打开论文搜索入口', async () => {
  const PaperSearch = global.window.PaperSearch;
  await PaperSearch.attach(markdownBody);
});

steps.then('仍显示搜索表单', async () => {
  const form = find('.paper-search-form');
  if (!form) throw new Error('未配置 key 时搜索表单未显示（匿名搜索不可用）');
  const input = find('.paper-search-input');
  if (!input) throw new Error('搜索表单缺少输入框');
});

steps.then('显示匿名搜索限额提示', async () => {
  const hint = find('.paper-search-anon-hint');
  if (!hint) throw new Error('未显示匿名搜索限额提示');
  if (!hint.textContent || hint.textContent.trim().length === 0) {
    throw new Error('匿名搜索提示为空');
  }
});

steps.then('提供前往设置的引导', async () => {
  const hint = find('.paper-search-anon-hint');
  if (!hint) throw new Error('未显示匿名搜索提示');
  const guide = hint.querySelector('.paper-search-settings-btn');
  if (!guide) throw new Error('匿名提示缺少前往设置的引导');
});

module.exports = steps;

// ============================================================
// Sprint 29b: 欢迎页重设计——搜索为主角，导入折叠
// ============================================================
const integrationPath = path.join(__dirname, '../../dist/scripts/learning/paper-reader-integration.js');
require(integrationPath);

steps.when('用户查看论文导读欢迎页', async () => {
  // 模块早前已被其他 sprint 步骤加载并挂到当时的 window 对象上，
  // 本文件运行时会重指派 global.window，因此清缓存按当前环境重新加载
  delete require.cache[require.resolve(integrationPath)];
  require(integrationPath);
  const integration = global.window.PaperReaderIntegration;
  if (!integration) throw new Error('PaperReaderIntegration 未加载');
  integration.showWelcome(markdownBody);
  // showWelcome 内部异步 attach，等待渲染完成
  await new Promise(r => setTimeout(r, 50));
});

steps.then('搜索框位于导入入口上方', async () => {
  const welcome = find('.paper-reader-welcome');
  if (!welcome) throw new Error('未找到欢迎页容器');
  const slot = find('.paper-search-slot');
  if (!slot) throw new Error('未找到搜索槽位');
  const importBox = find('.paper-reader-import');
  if (!importBox) throw new Error('未找到导入入口');
  const nodes = welcome.childNodes;
  const slotIdx = nodes.indexOf(slot);
  const importIdx = nodes.indexOf(importBox);
  if (slotIdx < 0 || importIdx < 0) throw new Error('搜索槽位或导入入口不在欢迎页内');
  if (slotIdx >= importIdx) throw new Error('搜索框未位于导入入口上方');
  const form = find('.paper-search-form');
  if (!form) throw new Error('搜索表单未渲染到槽位中');
});

steps.then('导入入口默认折叠', async () => {
  const panel = find('.paper-reader-import-panel');
  if (!panel) throw new Error('未找到导入面板');
  if (panel.style.display !== 'none') throw new Error('导入面板应默认折叠');
});

steps.when('用户点击导入入口折叠开关', async () => {
  const toggle = find('#paper-reader-import-toggle');
  if (!toggle) throw new Error('未找到导入折叠开关');
  toggle.click();
});

steps.then('展开显示 Markdown、PDF 和 URL 导入方式', async () => {
  const panel = find('.paper-reader-import-panel');
  if (!panel) throw new Error('未找到导入面板');
  if (panel.style.display === 'none') throw new Error('导入面板未展开');
  if (!find('#paper-reader-select-file')) throw new Error('展开后缺少 Markdown 导入');
  if (!find('#paper-reader-select-pdf')) throw new Error('展开后缺少 PDF 导入');
  if (!find('#paper-reader-url-input')) throw new Error('展开后缺少 URL 导入');
});

steps.when('设定导入将因无开放获取而失败', async () => {
  __importShouldFail = 'no-oa';
});

steps.then('提供在浏览器打开原文的按钮', async () => {
  const error = find('.paper-search-error');
  if (!error) throw new Error('未显示错误信息');
  const btn = error.querySelector('.paper-search-open-btn');
  if (!btn) throw new Error('无开放获取失败时应提供浏览器打开原文的逃生门');
  // 逃生门必须能工作：mock 层记录 open_external 调用
  // 注意 paper-search.js 优先走 TyporaNext.invoke，两个入口都要换
  __openedExternal = null;
  const invokeWithCapture = async (cmd, args) => {
    if (cmd === 'open_external') {
      __openedExternal = args.url;
      return null;
    }
    return mockInvoke(cmd, args);
  };
  global.window.__TAURI__.core.invoke = invokeWithCapture;
  global.window.TyporaNext.invoke = invokeWithCapture;
  btn.click();
  await new Promise(r => setTimeout(r, 30));
  if (!__openedExternal) throw new Error('点击逃生门后未调用 open_external');
});

// ============================================================
// Sprint 29c: 缓存标记 / 批量缓存 / 状态恢复
// ============================================================

steps.given('论文{string}已缓存', async (url) => {
  __importedList = [{
    url,
    md_path: '/cached/papers/2026-09/cached-paper.md',
    title: '已缓存的论文',
    cached_at: '2026-09-12T10:00:00+08:00',
  }];
});

steps.when('用户点击第{int}条结果的打开按钮', async (n) => {
  const items = findAll('.paper-search-item');
  if (items.length < n) throw new Error(`结果只有 ${items.length} 条，无法点击第 ${n} 条`);
  const btn = items[n - 1].querySelector('.paper-search-open-paper-btn');
  if (!btn) throw new Error('结果缺少打开按钮（可能未显示已缓存状态）');
  btn.click();
  await new Promise(r => setTimeout(r, 50));
});

steps.then('论文以 tab 形式打开', async () => {
  if (__tabs.length === 0) throw new Error('没有打开任何 tab');
  const tab = __tabs[__tabs.length - 1];
  if (tab.mode !== 'paper') throw new Error(`tab 模式不是 paper，而是 ${tab.mode}`);
});

steps.when('用户勾选第 1 和第 2 条结果', async () => {
  const checks = findAll('.paper-search-check');
  if (checks.length < 2) throw new Error(`可勾选结果不足 2 条（实际 ${checks.length}）`);
  checks[0].checked = true;
  checks[1].checked = true;
});

steps.when('用户点击批量缓存按钮', async () => {
  const btn = find('.paper-search-batch-btn');
  if (!btn) throw new Error('未找到批量缓存按钮');
  btn.click();
  // mock 每个导入 200ms，2 个 + 渲染余量
  await new Promise(r => setTimeout(r, 600));
});

steps.then('全部选中的论文已缓存', async () => {
  if (__importCallCount < 2) throw new Error(`批量缓存应触发 2 次导入，实际 ${__importCallCount}`);
});

steps.then('结果列表显示已缓存标记', async () => {
  const badges = findAll('.paper-search-cached-badge');
  if (badges.length < 2) throw new Error(`已缓存标记不足 2 个（实际 ${badges.length}）`);
});

// Sprint 30 起「重新进入恢复上次结果」场景已废弃（改为论文库首页），
// 对应步骤迁移到 sprint30_paper_library.steps.js（断言相反行为）。
