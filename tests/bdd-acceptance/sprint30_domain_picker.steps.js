#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * BDD Acceptance Steps for Sprint 30b: 导入时选择领域（DomainPicker）
 *
 * Drives the REAL domain-picker.js with mocked Tauri invoke + mock DOM。
 * pick() 的 Promise 语义：已有领域/新领域 → 字符串；暂不分类 → null；
 * 取消 → undefined（调用方据此中止导入）。
 */

const path = require('path');
const { StepRegistry } = require('../shared/runner');
const { buildMockDOM } = require('../shared/mock-dom');

require('./mock-tauri');

// ============================================================
// State
// ============================================================
let __importedList = [];

global.window.__TAURI__ = global.window.__TAURI__ || { core: {} };
const mockInvoke = async (cmd) => {
  switch (cmd) {
    case 'list_imported_papers':
      return __importedList;
    default:
      throw new Error(`Mock invoke not implemented: ${cmd}`);
  }
};
global.window.__TAURI__.core.invoke = mockInvoke;
global.window.TyporaNext = global.window.TyporaNext || {};
global.window.TyporaNext.invoke = mockInvoke;

// Load REAL modules（清缓存防撞旧 window）
for (const rel of [
  '../../dist/scripts/learning/paper-library.js',
  '../../dist/scripts/learning/domain-picker.js'
]) {
  const abs = path.join(__dirname, rel);
  delete require.cache[require.resolve(abs)];
  require(abs);
}

const steps = new StepRegistry();
let doc = null;
let __pickPromise = null;
let __pickResult = '__pending__';

function body() { return doc.body; }
function findAll(sel) { return body().querySelectorAll(sel); }
function find(sel) { return body().querySelector(sel); }

steps.given('论文库已有{string}和{string}两个领域', async (d1, d2) => {
  __importedList = [
    { url: 'https://a1', md_path: 'D:/papers/x/p1.md', title: 'p1', cached_at: '2026-09-10T10:00:00+08:00', domain: d1 },
    { url: 'https://a2', md_path: 'D:/papers/x/p2.md', title: 'p2', cached_at: '2026-09-11T10:00:00+08:00', domain: d2 }
  ];
  const built = buildMockDOM();
  doc = built.document;
  global.document = doc;
  __pickPromise = null;
  __pickResult = '__pending__';
});

steps.when('用户触发导入前领域选择', async () => {
  const DomainPicker = global.window.DomainPicker;
  if (!DomainPicker) throw new Error('DomainPicker 未加载');
  __pickPromise = DomainPicker.pick().then((v) => { __pickResult = v; });
  // 等待领域列表加载与渲染
  await new Promise(r => setTimeout(r, 50));
});

steps.then('显示已有领域{string}和{string}', async (d1, d2) => {
  const chips = findAll('.domain-picker-chip');
  const names = chips.map((c) => c.textContent);
  if (!names.includes(d1)) throw new Error(`缺少领域「${d1}」（实际: ${names.join(',')}）`);
  if (!names.includes(d2)) throw new Error(`缺少领域「${d2}」（实际: ${names.join(',')}）`);
});

steps.then('提供新领域输入框', async () => {
  if (!find('.domain-picker-input')) throw new Error('缺少新领域输入框');
});

steps.when('用户选择领域{string}并确定', async (domain) => {
  const chips = findAll('.domain-picker-chip');
  const chip = chips.find((c) => c.textContent === domain);
  if (!chip) throw new Error(`未找到领域「${domain}」`);
  chip.click();
  const ok = find('.domain-picker-ok');
  if (!ok) throw new Error('缺少确定按钮');
  ok.click();
  await __pickPromise;
});

steps.when('用户输入新领域{string}并确定', async (domain) => {
  const input = find('.domain-picker-input');
  if (!input) throw new Error('缺少新领域输入框');
  input.value = domain;
  const ok = find('.domain-picker-ok');
  if (!ok) throw new Error('缺少确定按钮');
  ok.click();
  await __pickPromise;
});

steps.when('用户点击暂不分类', async () => {
  const skip = find('.domain-picker-skip');
  if (!skip) throw new Error('缺少暂不分类按钮');
  skip.click();
  await __pickPromise;
});

steps.when('用户点击取消', async () => {
  const cancel = find('.domain-picker-cancel');
  if (!cancel) throw new Error('缺少取消按钮');
  cancel.click();
  await __pickPromise;
});

steps.then('领域选择结果为{string}', async (domain) => {
  if (__pickResult !== domain) {
    throw new Error(`选择结果期望「${domain}」，实际: ${__pickResult}`);
  }
  // 选择器必须已关闭（DOM 清理）
  if (find('.domain-picker-overlay')) throw new Error('选择器未关闭');
});

steps.then('领域选择结果为未分类', async () => {
  if (__pickResult !== null) {
    throw new Error(`暂不分类应 resolve null，实际: ${__pickResult}`);
  }
  if (find('.domain-picker-overlay')) throw new Error('选择器未关闭');
});

steps.then('领域选择被取消', async () => {
  if (__pickResult !== undefined) {
    throw new Error(`取消应 resolve undefined，实际: ${__pickResult}`);
  }
  if (find('.domain-picker-overlay')) throw new Error('选择器未关闭');
});

module.exports = steps;
