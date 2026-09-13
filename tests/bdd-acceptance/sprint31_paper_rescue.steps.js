#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * BDD Acceptance Steps for Sprint 31: 导入失败批量 agent 补救
 *
 * 核心断言：所有失败**一次性**进入 rescue_paper_imports（不是一篇一调），
 * 且每条的 url/title/error 全文都作为上下文携带；补救结局回写到结果列表。
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
let __aiConfigured = true;
let __importedList = [];
let __rescueCalls = [];
let __statusDuringRescue = null;

const SEARCH_FIXTURES = {
  '铝电解': [
    { title: '铝电解槽优化控制方法综述', url: 'https://arxiv.org/abs/2402.70007', year: 2024 },
    { title: 'Aluminum Electrolysis Process Modeling', url: 'https://arxiv.org/abs/2301.80008', year: 2023 },
    { title: '铝电解质成分在线检测方法研究', url: 'https://arxiv.org/abs/2206.90009', year: 2022 }
  ]
};

global.window.__TAURI__ = global.window.__TAURI__ || { core: {} };
const mockInvoke = async (cmd, args) => {
  switch (cmd) {
    case 'search_papers':
      return { results: SEARCH_FIXTURES[(args && args.query) || ''] || [] };
    case 'import_paper_from_url': {
      await new Promise(r => setTimeout(r, 100));
      if (__importShouldFail) {
        throw new Error(`解析论文链接失败: Semantic Scholar 请求失败: status code 429；重试仍失败（${(args && args.url) || ''}）`);
      }
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-s31-import-'));
      const mdPath = path.join(tmpDir, 'papers', '2026-09', 'cached.md');
      fs.mkdirSync(path.dirname(mdPath), { recursive: true });
      fs.writeFileSync(mdPath, '# Cached\n', 'utf-8');
      return { md_path: mdPath, md_content: '# Cached\n', title: 'Cached Paper' };
    }
    case 'rescue_paper_imports': {
      // 补救期间的进度文案现场取证（命令返回后 UI 已切走）
      const statusEl = global.document && global.document.querySelector('.paper-import-status');
      __statusDuringRescue = statusEl ? statusEl.textContent : null;
      __rescueCalls.push(JSON.parse(JSON.stringify(args)));
      if (!__aiConfigured) throw new Error('未配置 AI，无法智能补救');
      await new Promise(r => setTimeout(r, 100));
      // 模拟 agent 补救：第一篇找到替代源成功，第二篇无救
      const failures = (args && args.failures) || [];
      return failures.map((f, i) => {
        if (i === 0) {
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-s31-rescue-'));
          const mdPath = path.join(tmpDir, 'rescued.md');
          fs.writeFileSync(mdPath, '# Rescued\n', 'utf-8');
          return { url: f.url, ok: true, md_path: mdPath, title: f.title, error: null };
        }
        return {
          url: f.url, ok: false, md_path: null, title: null,
          error: `${f.error}；agent 补救尝试 2 个候选源仍失败（OpenAlex 无开放获取，AnySearch 无可下载 PDF）`
        };
      });
    }
    case 'get_config':
      return { anysearch_api_key: 'as_sk_mock' };
    case 'list_imported_papers':
      return __importedList;
    case 'open_external':
      return null;
    default:
      throw new Error(`Mock invoke not implemented: ${cmd}`);
  }
};
global.window.__TAURI__.core.invoke = mockInvoke;
global.window.TyporaNext = global.window.TyporaNext || {};
global.window.TyporaNext.invoke = mockInvoke;
global.window.TyporaNext.addTab = async () => {};

// Load REAL modules
for (const rel of [
  '../../dist/scripts/learning/paper-import.js',
  '../../dist/scripts/learning/paper-search.js'
]) {
  const abs = path.join(__dirname, rel);
  delete require.cache[require.resolve(abs)];
  require(abs);
}

const steps = new StepRegistry();
let markdownBody = null;
let doc = null;

function findAll(sel) { return markdownBody.querySelectorAll(sel); }
function find(sel) { return markdownBody.querySelector(sel); }

steps.given('用户已进入论文导读模式且已配置 AI', async () => {
  __importShouldFail = false;
  __aiConfigured = true;
  __importedList = [];
  __rescueCalls = [];
  __statusDuringRescue = null;
  const built = buildMockDOM();
  doc = built.document;
  global.document = doc;
  markdownBody = doc.createElement('div');
  markdownBody.id = 'markdownBody';
  doc.body.appendChild(markdownBody);
  await global.window.PaperSearch.attach(markdownBody);
});

steps.given('未配置 AI', async () => {
  __aiConfigured = false;
});

steps.when('用户输入领域关键词{string}', async (keyword) => {
  const input = find('.paper-search-input');
  if (!input) throw new Error('未找到搜索输入框');
  input.value = keyword;
});

steps.when('点击搜索按钮', async () => {
  find('.paper-search-btn').click();
  await new Promise(r => setTimeout(r, 50));
});

steps.when('设定导入将因无开放获取而失败', async () => {
  __importShouldFail = true;
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
  // 2 篇快路径各 100ms + rescue 100ms + 渲染余量
  await new Promise(r => setTimeout(r, 800));
});

steps.when('用户点击第{int}条结果的缓存按钮', async (n) => {
  const items = findAll('.paper-search-item');
  if (items.length < n) throw new Error(`结果只有 ${items.length} 条`);
  const btn = items[n - 1].querySelector('.paper-search-import-btn');
  if (!btn) throw new Error('结果缺少缓存按钮');
  btn.click();
  // 快路径 100ms + rescue 100ms + 渲染余量
  await new Promise(r => setTimeout(r, 500));
});

steps.then('智能补救被调用一次', async () => {
  if (__rescueCalls.length !== 1) {
    throw new Error(`rescue_paper_imports 应恰好调用 1 次（批量视角），实际 ${__rescueCalls.length} 次`);
  }
});

steps.then('补救请求携带全部 {int} 条失败及错误上下文', async (count) => {
  if (__rescueCalls.length === 0) throw new Error('rescue 未被调用');
  const failures = __rescueCalls[0].failures || [];
  if (failures.length !== count) {
    throw new Error(`补救请求应携带 ${count} 条失败，实际 ${failures.length}`);
  }
  for (const f of failures) {
    if (!f.url) throw new Error('失败条目缺 url');
    if (!f.error || f.error.length < 10) throw new Error(`失败条目缺错误上下文: ${JSON.stringify(f)}`);
    if (!/429/.test(f.error)) throw new Error(`错误上下文未携带原始错误全文: ${f.error}`);
  }
});

steps.then('补救期间显示批量补救进度文案', async () => {
  if (!__statusDuringRescue) throw new Error('补救期间未捕获到进度文案');
  if (!/补救|agent/i.test(__statusDuringRescue)) {
    throw new Error(`补救期间文案未体现 agent 补救: ${__statusDuringRescue}`);
  }
});

steps.then('补救成功的篇目显示已缓存标记', async () => {
  const badges = findAll('.paper-search-cached-badge');
  if (badges.length < 1) throw new Error('补救成功后未显示已缓存标记');
});

steps.then('仍失败的篇目透出补救尝试记录', async () => {
  const fails = findAll('.paper-search-fail-item');
  if (fails.length === 0) throw new Error('没有失败条目（补救应保留仍失败的篇目）');
  const text = fails.map((f) => {
    const t = f.querySelector('.paper-search-fail-text');
    return t ? t.textContent : '';
  }).join('\n');
  if (!/agent 补救|补救尝试/.test(text)) {
    throw new Error(`失败文案未透出补救尝试记录: ${text.slice(0, 120)}`);
  }
});

steps.then('智能补救返回不可用', async () => {
  if (__rescueCalls.length !== 1) throw new Error('rescue 应被调用一次（由后端拒绝）');
});

steps.then('仍失败的篇目透出原始错误', async () => {
  const fails = findAll('.paper-search-fail-item');
  if (fails.length === 0) throw new Error('没有失败条目');
  const text = fails.map((f) => {
    const t = f.querySelector('.paper-search-fail-text');
    return t ? t.textContent : '';
  }).join('\n');
  if (!/429/.test(text)) throw new Error(`失败文案未透出原始错误: ${text.slice(0, 120)}`);
});

steps.then('每条失败原因附带浏览器打开按钮', async () => {
  const fails = findAll('.paper-search-fail-item');
  if (fails.length === 0) throw new Error('没有失败条目');
  for (const fail of fails) {
    if (!fail.querySelector('.paper-search-open-btn')) {
      throw new Error('失败条目缺少逃生门按钮');
    }
  }
});

module.exports = steps;
