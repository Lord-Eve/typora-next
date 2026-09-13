#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * BDD Acceptance Steps for Sprint 30c: 论文库真删除
 *
 * 真实文件系统层：给定论文落在临时目录的真 .md 文件，删除后文件必须
 * 真的消失（区别于课程模式的软删除）。mock 的 delete_paper /
 * delete_paper_domain 复刻后端语义：删文件 + 清索引条目。
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
let __importedList = [];
let __confirmResult = true;
let __deleteCalls = [];
let __tmpRoot = null;

global.window.__TAURI__ = global.window.__TAURI__ || { core: {} };
const mockInvoke = async (cmd, args) => {
  switch (cmd) {
    case 'list_imported_papers':
      return __importedList;
    case 'read_text_file':
      return '# x\n';
    case 'get_config':
      return {};
    // 复刻后端语义：真删文件 + 清索引（验收层验证的是文件真的没了）
    case 'delete_paper': {
      const entry = __importedList.find((e) => e.url === (args && args.url));
      __deleteCalls.push({ cmd, url: args && args.url });
      if (entry && fs.existsSync(entry.md_path)) fs.unlinkSync(entry.md_path);
      __importedList = __importedList.filter((e) => e.url !== (args && args.url));
      return null;
    }
    case 'delete_paper_domain': {
      const domain = (args && args.domain) || '';
      const isBlank = (d) => !d || !String(d).trim();
      const inDomain = (e) => domain === '' ? isBlank(e.domain) : (e.domain === domain);
      const doomed = __importedList.filter(inDomain);
      __deleteCalls.push({ cmd, domain, count: doomed.length });
      doomed.forEach((e) => { if (fs.existsSync(e.md_path)) fs.unlinkSync(e.md_path); });
      __importedList = __importedList.filter((e) => !inDomain(e));
      return doomed.length;
    }
    default:
      throw new Error(`Mock invoke not implemented: ${cmd}`);
  }
};
global.window.__TAURI__.core.invoke = mockInvoke;
global.window.TyporaNext = global.window.TyporaNext || {};
global.window.TyporaNext.invoke = mockInvoke;
global.window.TyporaNext.addTab = async () => {};

// confirm 弹窗：由场景控制用户确认/取消
global.confirm = () => __confirmResult;
global.window.confirm = global.confirm;

// Load REAL modules（清缓存防撞旧 window）
for (const rel of [
  '../../dist/scripts/learning/paper-import.js',
  '../../dist/scripts/learning/paper-search.js',
  '../../dist/scripts/learning/paper-library.js',
  '../../dist/scripts/learning/paper-reader-integration.js'
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

steps.given('论文库中有{string}领域两篇真实文件论文', async (domain) => {
  __confirmResult = true;
  __deleteCalls = [];
  __tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-delete-'));
  __importedList = [1, 2].map((i) => {
    const mdPath = path.join(__tmpRoot, domain, '2026-09', `paper-${i}.md`);
    fs.mkdirSync(path.dirname(mdPath), { recursive: true });
    fs.writeFileSync(mdPath, `# ${domain}论文${i}\n`, 'utf-8');
    return {
      url: `https://arxiv.org/abs/2401.5000${i}`,
      md_path: mdPath,
      title: `${domain}论文${i}`,
      cached_at: `2026-09-1${i}T10:00:00+08:00`,
      domain
    };
  });

  const built = buildMockDOM();
  doc = built.document;
  global.document = doc;
  markdownBody = doc.createElement('div');
  markdownBody.id = 'markdownBody';
  doc.body.appendChild(markdownBody);
});

steps.when('用户查看论文导读欢迎页', async () => {
  const integration = global.window.PaperReaderIntegration;
  integration.showWelcome(markdownBody);
  await new Promise(r => setTimeout(r, 80));
});

steps.when('用户展开{string}领域', async (domain) => {
  const cards = findAll('.paper-library-card');
  const card = cards.find((c) => {
    const name = c.querySelector('.paper-library-card-name');
    return name && name.textContent.includes(domain);
  });
  if (!card) throw new Error(`未找到「${domain}」领域卡片`);
  card.querySelector('.paper-library-card-header').click();
  await new Promise(r => setTimeout(r, 30));
});

steps.when('用户确认后点击第{int}篇论文的删除按钮', async (n) => {
  __confirmResult = true;
  const items = findAll('.paper-library-item');
  if (items.length < n) throw new Error(`展开的论文不足 ${n} 篇`);
  const btn = items[n - 1].querySelector('.paper-library-delete-btn');
  if (!btn) throw new Error('论文缺少删除按钮');
  btn.click();
  await new Promise(r => setTimeout(r, 50));
});

steps.when('用户取消确认后点击第{int}篇论文的删除按钮', async (n) => {
  __confirmResult = false;
  const items = findAll('.paper-library-item');
  if (items.length < n) throw new Error(`展开的论文不足 ${n} 篇`);
  const btn = items[n - 1].querySelector('.paper-library-delete-btn');
  if (!btn) throw new Error('论文缺少删除按钮');
  btn.click();
  await new Promise(r => setTimeout(r, 50));
});

steps.then('该论文的磁盘文件被删除', async () => {
  const del = __deleteCalls.find((c) => c.cmd === 'delete_paper');
  if (!del) throw new Error('delete_paper 未被调用');
  const entry = { path: path.join(__tmpRoot, '铝电解', '2026-09', 'paper-2.md') };
  // 组内按 cached_at 倒序，第 1 篇是 paper-2（09-12 晚于 09-11）
  if (fs.existsSync(entry.path)) throw new Error(`文件仍存在: ${entry.path}`);
});

steps.then('论文库中该论文条目消失', async () => {
  const titles = findAll('.paper-library-item').map((i) => {
    const t = i.querySelector('.paper-library-item-title');
    return t ? t.textContent : '';
  });
  if (titles.includes('铝电解论文2')) {
    throw new Error(`已删除的论文仍在列表中: ${titles.join(',')}`);
  }
});

steps.then('该论文的磁盘文件仍存在', async () => {
  const p = path.join(__tmpRoot, '铝电解', '2026-09', 'paper-2.md');
  if (!fs.existsSync(p)) throw new Error('取消确认后文件却被删了');
  if (__deleteCalls.some((c) => c.cmd === 'delete_paper')) {
    throw new Error('取消确认后不应调用 delete_paper');
  }
});

steps.then('论文库中该论文条目仍在', async () => {
  const titles = findAll('.paper-library-item').map((i) => {
    const t = i.querySelector('.paper-library-item-title');
    return t ? t.textContent : '';
  });
  if (!titles.includes('铝电解论文2')) throw new Error('取消确认后条目消失了');
});

steps.when('用户确认后删除{string}领域', async (domain) => {
  __confirmResult = true;
  const cards = findAll('.paper-library-card');
  const card = cards.find((c) => {
    const name = c.querySelector('.paper-library-card-name');
    return name && name.textContent.includes(domain);
  });
  if (!card) throw new Error(`未找到「${domain}」领域卡片`);
  const btn = card.querySelector('.paper-library-delete-domain-btn');
  if (!btn) throw new Error('领域卡片缺少删除按钮');
  btn.click();
  await new Promise(r => setTimeout(r, 50));
});

steps.then('该领域所有论文的磁盘文件被删除', async () => {
  const del = __deleteCalls.find((c) => c.cmd === 'delete_paper_domain');
  if (!del) throw new Error('delete_paper_domain 未被调用');
  if (del.count !== 2) throw new Error(`应删除 2 篇，实际 ${del.count}`);
  [1, 2].forEach((i) => {
    const p = path.join(__tmpRoot, '铝电解', '2026-09', `paper-${i}.md`);
    if (fs.existsSync(p)) throw new Error(`文件仍存在: ${p}`);
  });
});

steps.then('论文库中{string}领域卡片消失', async (domain) => {
  const cards = findAll('.paper-library-card');
  const still = cards.find((c) => {
    const name = c.querySelector('.paper-library-card-name');
    return name && name.textContent.includes(domain);
  });
  if (still) throw new Error(`「${domain}」领域卡片仍在`);
});

module.exports = steps;
