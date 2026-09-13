#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * BDD Acceptance Steps for Sprint 30: 论文库首页 + 缓存交互修复
 *
 * Drives REAL paper-search.js / paper-library.js / paper-reader-integration.js
 * / settings-panel.js with mocked Tauri invoke.
 * 核心回归：重进欢迎页不再恢复上次搜索结果，而是按领域展示论文库
 * （课程模式 hub 的交互语言）。
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
let __tabs = [];
let __importedList = [];
let __importCallCount = 0;
let __openedFolders = [];
let __openedExternals = [];
let __currentConfig = {};
let __savedConfig = null;

const RESOLVED_PAPERS_DIR = path.join(os.tmpdir(), 'mock-appdata', 'papers');

const SEARCH_FIXTURES = {
  '铝电解': [
    { title: '铝电解槽优化控制方法综述', url: 'https://arxiv.org/abs/2402.70007', year: 2024 },
    { title: 'Aluminum Electrolysis Process Modeling', url: 'https://arxiv.org/abs/2301.80008', year: 2023 },
    { title: '铝电解质成分在线检测方法研究', url: 'https://arxiv.org/abs/2206.90009', year: 2022 }
  ]
};

function fixtureFor(query) {
  if (SEARCH_FIXTURES[query]) return SEARCH_FIXTURES[query];
  return [
    { title: `${query} 研究进展`, url: 'https://arxiv.org/abs/2401.11111', year: 2024 },
    { title: `A Survey on ${query}`, url: 'https://arxiv.org/abs/2301.22222', year: 2023 }
  ];
}

// ============================================================
// Mock Tauri invoke
// ============================================================
global.window.__TAURI__ = global.window.__TAURI__ || { core: {} };
const mockInvoke = async (cmd, args) => {
  switch (cmd) {
    case 'search_papers': {
      const query = (args && args.query) || '';
      return { results: fixtureFor(query) };
    }
    case 'import_paper_from_url': {
      if (__importShouldFail === 'no-oa') {
        // 模拟真实解析耗时，让忙态可观测
        await new Promise(r => setTimeout(r, 150));
        throw new Error('URL 不支持: 未找到开放获取 PDF，请先下载 PDF 后再导入');
      }
      if (__importShouldFail) throw new Error('模拟导入失败');
      __importCallCount++;
      await new Promise(r => setTimeout(r, 200));
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-s30-import-'));
      const mdPath = path.join(tmpDir, 'papers', '2026-09', 'cached.md');
      fs.mkdirSync(path.dirname(mdPath), { recursive: true });
      fs.writeFileSync(mdPath, '# Cached\n', 'utf-8');
      return { md_path: mdPath, md_content: '# Cached\n', title: 'Cached Paper' };
    }
    case 'get_config':
      return JSON.parse(JSON.stringify(__currentConfig));
    case 'set_config':
      __savedConfig = (args && args.config) || null;
      return true;
    case 'list_imported_papers':
      return __importedList;
    case 'read_text_file':
      return '# Cached Paper\n\n此前缓存的论文内容。';
    case 'show_in_folder':
      __openedFolders.push((args && (args.path || args.filePath)) || '');
      return null;
    case 'open_folder':
      __openedFolders.push((args && args.path) || '');
      return null;
    case 'open_external':
      __openedExternals.push((args && args.url) || '');
      return null;
    case 'get_papers_dir':
      return RESOLVED_PAPERS_DIR;
    case 'pick_papers_dir':
      return null;
    default:
      throw new Error(`Mock invoke not implemented: ${cmd}`);
  }
};
global.window.__TAURI__.core.invoke = mockInvoke;

// ============================================================
// TyporaNext stub
// ============================================================
global.window.TyporaNext = global.window.TyporaNext || {};
global.window.TyporaNext.invoke = mockInvoke;
global.window.TyporaNext.addTab = async (filePath, content, baseDir, options) => {
  __tabs.push({ path: filePath, content, baseDir, mode: options && options.mode });
};

// ============================================================
// Load REAL frontend modules（清缓存防撞旧 window，Sprint 29 教训）
// ============================================================
const modulePaths = [
  '../../dist/scripts/learning/paper-import.js',
  '../../dist/scripts/learning/paper-search.js',
  '../../dist/scripts/learning/paper-library.js',
  '../../dist/scripts/learning/paper-reader-integration.js',
  '../../dist/scripts/settings-panel.js'
];
for (const rel of modulePaths) {
  const abs = path.join(__dirname, rel);
  delete require.cache[require.resolve(abs)];
  require(abs);
}

// ============================================================
// Step definitions
// ============================================================
const steps = new StepRegistry();
let markdownBody = null;
let doc = null;

function findAll(sel) { return markdownBody.querySelectorAll(sel); }
function find(sel) { return markdownBody.querySelector(sel); }

async function showWelcomeAndWait() {
  const integration = global.window.PaperReaderIntegration;
  if (!integration) throw new Error('PaperReaderIntegration 未加载');
  integration.showWelcome(markdownBody);
  await new Promise(r => setTimeout(r, 80));
}

steps.given('用户已进入论文导读模式', async () => {
  __importShouldFail = false;
  __tabs = [];
  __importedList = [];
  __importCallCount = 0;
  __openedFolders = [];
  __openedExternals = [];
  const built = buildMockDOM();
  doc = built.document;
  global.document = doc;
  markdownBody = doc.createElement('div');
  markdownBody.id = 'markdownBody';
  doc.body.appendChild(markdownBody);
  await global.window.PaperSearch.attach(markdownBody);
});

steps.when('用户输入领域关键词{string}', async (keyword) => {
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

// ---------- 场景 1：重进显示论文库而非上次结果 ----------

steps.when('用户重新进入论文导读模式', async () => {
  // 模拟关闭论文 tab 回欢迎页：容器清空后走真实入口 showWelcome
  markdownBody.innerHTML = '';
  await showWelcomeAndWait();
});

steps.then('不显示上次的搜索结果', async () => {
  const items = findAll('.paper-search-item');
  if (items.length !== 0) {
    throw new Error(`重新进入后仍残留 ${items.length} 条上次搜索结果`);
  }
});

steps.then('仍显示搜索表单', async () => {
  if (!find('.paper-search-form')) throw new Error('搜索表单未显示');
  if (!find('.paper-search-input')) throw new Error('搜索输入框未显示');
});

// ---------- 场景 2/3：论文库分组与打开 ----------

steps.given('论文库中有{string}领域的 {int} 篇论文和{string}领域的 {int} 篇论文', async (d1, n1, d2, n2) => {
  __importedList = [];
  const mk = (domain, i, day) => ({
    url: `https://arxiv.org/abs/2401.${domain === d1 ? 1 : 2}000${i}`,
    md_path: `D:\\papers\\${domain}\\2026-09\\paper-${i}.md`,
    title: `${domain}论文${i}`,
    cached_at: `2026-09-${String(day).padStart(2, '0')}T10:00:00+08:00`,
    domain
  });
  for (let i = 1; i <= n1; i++) __importedList.push(mk(d1, i, 10 + i));
  for (let i = 1; i <= n2; i++) __importedList.push(mk(d2, i, 8 + i));
});

steps.when('用户查看论文导读欢迎页', async () => {
  await showWelcomeAndWait();
});

steps.then('论文库显示{string}领域卡片且有 {int} 篇', async (domain, count) => {
  // 注意：mock DOM 的 textContent 不递归子元素，必须查具体子节点
  const cards = findAll('.paper-library-card');
  if (cards.length === 0) throw new Error('论文库未渲染任何领域卡片');
  const card = cards.find((c) => {
    const name = c.querySelector('.paper-library-card-name');
    return name && name.textContent.includes(domain);
  });
  if (!card) throw new Error(`未找到「${domain}」领域卡片`);
  const meta = card.querySelector('.paper-library-card-meta');
  if (!meta || !meta.textContent.includes(`${count} 篇`)) {
    throw new Error(`「${domain}」卡片未显示 ${count} 篇（实际: ${meta && meta.textContent}）`);
  }
});

steps.when('用户展开{string}领域', async (domain) => {
  const cards = findAll('.paper-library-card');
  const card = cards.find((c) => {
    const name = c.querySelector('.paper-library-card-name');
    return name && name.textContent.includes(domain);
  });
  if (!card) throw new Error(`未找到「${domain}」领域卡片`);
  const header = card.querySelector('.paper-library-card-header');
  header.click();
  await new Promise(r => setTimeout(r, 30));
  const list = card.querySelector('.paper-library-list');
  if (!list || list.style.display === 'none') throw new Error(`「${domain}」领域未展开论文列表`);
});

steps.when('用户点击论文库中第{int}篇论文的打开按钮', async (n) => {
  const items = findAll('.paper-library-item');
  if (items.length < n) throw new Error(`论文库展开的论文不足 ${n} 篇（实际 ${items.length}）`);
  const btn = items[n - 1].querySelector('.paper-library-open-btn');
  if (!btn) throw new Error('论文缺少打开按钮');
  btn.click();
  await new Promise(r => setTimeout(r, 50));
});

steps.then('论文以 tab 形式打开', async () => {
  if (__tabs.length === 0) throw new Error('没有打开任何 tab');
  const tab = __tabs[__tabs.length - 1];
  if (tab.mode !== 'paper') throw new Error(`tab 模式不是 paper，而是 ${tab.mode}`);
});

// ---------- 场景 4：缓存 loading 态 ----------

steps.when('用户点击第{int}条结果的缓存按钮', async (n) => {
  const items = findAll('.paper-search-item');
  if (items.length < n) throw new Error(`结果只有 ${items.length} 条`);
  const btn = items[n - 1].querySelector('.paper-search-import-btn');
  if (!btn) throw new Error('结果缺少缓存按钮');
  btn.click();
  await new Promise(r => setTimeout(r, 50));
});

steps.then('第{int}条结果的缓存按钮显示缓存中且被禁用', async (n) => {
  // 注意：不能等导入完成——下一个步骤要断言进度仍可见
  const items = findAll('.paper-search-item');
  if (items.length < n) throw new Error(`结果只有 ${items.length} 条`);
  const btn = items[n - 1].querySelector('.paper-search-import-btn');
  if (!btn) throw new Error('结果缺少缓存按钮');
  if (!btn.disabled) throw new Error('缓存期间按钮未禁用');
  if (!/缓存中/.test(btn.textContent)) {
    throw new Error(`缓存期间按钮未显示忙态（实际: ${btn.textContent}）`);
  }
});

steps.then('进入缓存进度状态', async () => {
  // 进度槽已前置到结果列表上方（Sprint 30 修复：之前在列表之后不可见）
  const slot = find('.paper-search-progress-slot');
  const results = find('.paper-search-results');
  if (!slot || !results) throw new Error('缺少进度槽或结果容器');
  const section = find('.paper-search-section');
  const nodes = Array.from(section.childNodes);
  if (nodes.indexOf(slot) > nodes.indexOf(results)) {
    throw new Error('进度槽仍在结果列表之后（视口外，用户看不到 loading）');
  }
  if (!find('.paper-import-progress')) throw new Error('未显示导入进度状态');
  await new Promise(r => setTimeout(r, 300));
});

// ---------- 场景 5：批量失败逐条 + 逃生门 ----------

steps.when('设定导入将因无开放获取而失败', async () => {
  __importShouldFail = 'no-oa';
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
  // 每篇 mock 150ms，2 篇 + 渲染余量
  await new Promise(r => setTimeout(r, 700));
});

steps.then('批量错误列表包含 {int} 条失败原因', async (count) => {
  const fails = findAll('.paper-search-fail-item');
  if (fails.length !== count) {
    throw new Error(`失败原因应为 ${count} 条，实际 ${fails.length}`);
  }
});

steps.then('每条失败原因附带浏览器打开按钮', async () => {
  const fails = findAll('.paper-search-fail-item');
  if (fails.length === 0) throw new Error('没有失败条目');
  for (const fail of fails) {
    const btn = fail.querySelector('.paper-search-open-btn');
    if (!btn) throw new Error(`失败条目缺少逃生门按钮: ${fail.textContent.slice(0, 40)}`);
  }
  // 逃生门可用：点击第一个应调 open_external
  const before = __openedExternals.length;
  fails[0].querySelector('.paper-search-open-btn').click();
  await new Promise(r => setTimeout(r, 30));
  if (__openedExternals.length === before) {
    throw new Error('点击逃生门后未调用 open_external');
  }
});

// ---------- 场景 6：打开所在文件夹 ----------

steps.given('论文{string}已缓存', async (url) => {
  __importedList = [{
    url,
    md_path: 'D:\\papers\\铝电解\\2026-09\\cached-paper.md',
    title: '已缓存的论文',
    cached_at: '2026-09-12T10:00:00+08:00',
    domain: '铝电解'
  }];
});

steps.when('用户点击第{int}条结果的所在文件夹按钮', async (n) => {
  const items = findAll('.paper-search-item');
  if (items.length < n) throw new Error(`结果只有 ${items.length} 条`);
  const btn = items[n - 1].querySelector('.paper-search-folder-btn');
  if (!btn) throw new Error('已缓存结果缺少所在文件夹按钮');
  btn.click();
  await new Promise(r => setTimeout(r, 30));
});

steps.then('调用 show_in_folder 展示该论文文件', async () => {
  if (__openedFolders.length === 0) throw new Error('show_in_folder 未被调用');
  const p = __openedFolders[__openedFolders.length - 1];
  if (!/cached-paper\.md$/.test(p)) {
    throw new Error(`show_in_folder 参数不是论文文件路径: ${p}`);
  }
});

// ---------- 场景 7：设置面板实际目录 ----------

let settingsRoot = null;

steps.given('用户已打开设置面板', async () => {
  __currentConfig = { anysearch_api_key: null, papers_root: null };
  __savedConfig = null;
  __openedFolders = [];
  const built = buildMockDOM();
  doc = built.document;
  global.document = doc;
  settingsRoot = doc.createElement('div');
  settingsRoot.classList.add('modal-body');
  doc.body.appendChild(settingsRoot);
  const SettingsPanel = global.window.SettingsPanel;
  SettingsPanel.mount(settingsRoot);
  await SettingsPanel.load(__currentConfig);
  await new Promise(r => setTimeout(r, 50));
});

steps.then('论文服务分组显示当前实际论文目录', async () => {
  const hint = settingsRoot.querySelector('#settingPapersDirHint');
  if (!hint) throw new Error('未找到论文目录提示元素');
  if (!hint.textContent.includes(RESOLVED_PAPERS_DIR)) {
    throw new Error(`提示未显示实际目录（实际: ${hint.textContent}）`);
  }
});

steps.then('论文库根目录行包含打开文件夹按钮', async () => {
  const btn = settingsRoot.querySelector('#settingPapersDirOpen');
  if (!btn) throw new Error('论文库根目录行缺少打开文件夹按钮');
  btn.click();
  await new Promise(r => setTimeout(r, 30));
  const hit = __openedFolders.find((p) => p === RESOLVED_PAPERS_DIR);
  if (!hit) throw new Error(`点击后未用实际目录调用 open_folder（实际: ${__openedFolders.join(',')}）`);
});

module.exports = steps;
