#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * BDD Acceptance Steps for Sprint 29 PB2: Settings Panel regroup + save-merge
 *
 * Drives the REAL settings-panel.js frontend module with mocked Tauri invoke.
 * 关键回归场景：保存设置不得清空 sidebar_collapsed / sidebar_active_tab / last_file
 * （main.js 旧 saveSettings 只回写 9 字段 + set_config 全量覆盖的实锤 bug）。
 */

const path = require('path');
const { StepRegistry } = require('../shared/runner');
const { buildMockDOM } = require('../shared/mock-dom');

require('./mock-tauri');

// ============================================================
// State
// ============================================================
let __currentConfig = {};
let __savedConfig = null;
let __pickedDir = null;

// ============================================================
// Mock Tauri invoke for settings
// ============================================================
const originalInvoke = global.window.__TAURI__?.core?.invoke;
global.window.__TAURI__ = global.window.__TAURI__ || { core: {} };
global.window.__TAURI__.core.invoke = async (cmd, args) => {
  switch (cmd) {
    case 'get_config':
      return JSON.parse(JSON.stringify(__currentConfig));
    case 'set_config':
      __savedConfig = (args && args.config) || null;
      return true;
    case 'pick_papers_dir':
      return __pickedDir;
    default:
      if (originalInvoke) return originalInvoke(cmd, args);
      throw new Error(`Mock invoke not implemented: ${cmd}`);
  }
};

// ============================================================
// Load REAL frontend module
// ============================================================
global.window.TyporaNext = global.window.TyporaNext || {};
global.window.TyporaNext.invoke = global.window.__TAURI__.core.invoke;

const settingsPanelPath = path.join(__dirname, '../../dist/scripts/settings-panel.js');
require(settingsPanelPath);

// ============================================================
// Step definitions
// ============================================================
const steps = new StepRegistry();
let root = null;
let doc = null;

function freshConfig() {
  return {
    api_key: null,
    ai_provider: 'anthropic',
    ai_base_url: null,
    model: 'claude-3-5-haiku-20241022',
    theme: null,
    custom_cursor: null,
    mineru_api_token: null,
    mineru_base_url: 'https://mineru.net',
    mineru_model_version: 'vlm',
    anysearch_api_key: null,
    sidebar_collapsed: false,
    sidebar_active_tab: 'files',
    last_file: null,
    word_export_use_template: false
  };
}

steps.given('用户已打开设置面板', async () => {
  __currentConfig = freshConfig();
  __savedConfig = null;
  __pickedDir = null;
  const built = buildMockDOM();
  doc = built.document;
  global.document = doc;
  root = doc.createElement('div');
  root.classList.add('modal-body');
  doc.body.appendChild(root);
  const SettingsPanel = global.window.SettingsPanel;
  SettingsPanel.mount(root);
  await SettingsPanel.load(__currentConfig);
});

steps.then('显示 AI 设置分组', async () => {
  const group = root.querySelector('#group-ai');
  if (!group) throw new Error('未找到 AI 设置分组');
  const title = group.querySelector('.settings-group-title');
  if (!title || !title.textContent) throw new Error('AI 分组缺少标题');
});

steps.then('显示论文服务设置分组', async () => {
  const group = root.querySelector('#group-papers');
  if (!group) throw new Error('未找到论文服务设置分组');
});

steps.then('显示外观设置分组', async () => {
  const group = root.querySelector('#group-appearance');
  if (!group) throw new Error('未找到外观设置分组');
});

steps.then('论文服务分组包含 AnySearch API key 输入框', async () => {
  const group = root.querySelector('#group-papers');
  if (!group) throw new Error('未找到论文服务设置分组');
  const input = group.querySelector('#settingAnysearchKey');
  if (!input) throw new Error('论文分组缺少 AnySearch API key 输入框');
});

steps.when('用户在 AnySearch API key 输入框输入{string}', async (key) => {
  const input = root.querySelector('#settingAnysearchKey');
  if (!input) throw new Error('未找到 AnySearch API key 输入框');
  input.value = key;
});

steps.when('点击保存设置', async () => {
  const btn = root.querySelector('#settingsSaveBtn');
  if (!btn) throw new Error('未找到保存按钮');
  btn.click();
  await new Promise(r => setTimeout(r, 50));
});

steps.then('保存的配置包含 anysearch_api_key 为{string}', async (key) => {
  if (!__savedConfig) throw new Error('set_config 未被调用');
  if (__savedConfig.anysearch_api_key !== key) {
    throw new Error(`anysearch_api_key=${__savedConfig.anysearch_api_key}，期望 ${key}`);
  }
});

steps.given('侧栏处于折叠状态', async () => {
  __currentConfig.sidebar_collapsed = true;
  const SettingsPanel = global.window.SettingsPanel;
  await SettingsPanel.load(__currentConfig);
});

steps.when('用户修改模型名称为{string}', async (model) => {
  const input = root.querySelector('#settingModel');
  if (!input) throw new Error('未找到模型名称输入框');
  input.value = model;
});

steps.then('保存的配置仍包含 sidebar_collapsed 为 true', async () => {
  if (!__savedConfig) throw new Error('set_config 未被调用');
  if (__savedConfig.sidebar_collapsed !== true) {
    throw new Error(`sidebar_collapsed=${__savedConfig.sidebar_collapsed}，保存后被清空（覆盖 bug 回归）`);
  }
});

steps.then('保存的配置包含 model 为{string}', async (model) => {
  if (!__savedConfig) throw new Error('set_config 未被调用');
  if (__savedConfig.model !== model) {
    throw new Error(`model=${__savedConfig.model}，期望 ${model}`);
  }
});

steps.when('用户勾选 Word 导出模板', async () => {
  const checkbox = root.querySelector('#settingWordTemplate');
  if (!checkbox) throw new Error('未找到 Word 导出模板开关');
  checkbox.checked = true;
});

steps.then('保存的配置包含 word_export_use_template 为 true', async () => {
  if (!__savedConfig) throw new Error('set_config 未被调用');
  if (__savedConfig.word_export_use_template !== true) {
    throw new Error(`word_export_use_template=${__savedConfig.word_export_use_template}`);
  }
});

steps.then('API key 输入框的提示包含 AI 字样', async () => {
  const hint = root.querySelector('#settingApiKeyHint');
  if (!hint) throw new Error('未找到 API key 提示');
  if (!hint.textContent.includes('AI')) {
    throw new Error(`API key 提示文案不含「AI」: ${hint.textContent}`);
  }
});

module.exports = steps;

steps.then('论文服务分组包含根目录选择', async () => {
  if (!root.querySelector('#settingPapersDir')) {
    throw new Error('论文服务分组缺少保存位置输入框');
  }
  if (!root.querySelector('#settingPapersDirPick')) {
    throw new Error('论文服务分组缺少选择目录按钮');
  }
});

steps.when('用户选择论文库根目录为{string}', async (dir) => {
  __pickedDir = dir;
  const btn = root.querySelector('#settingPapersDirPick');
  if (!btn) throw new Error('未找到选择目录按钮');
  btn.click();
  await new Promise(r => setTimeout(r, 30));
  const input = root.querySelector('#settingPapersDir');
  if (!input || input.value !== dir) {
    throw new Error(`选择目录后输入框未更新（实际: ${input ? input.value : 'null'}）`);
  }
});

steps.then('保存的配置包含 papers_root 为{string}', async (dir) => {
  if (!__savedConfig) throw new Error('配置未保存');
  if (__savedConfig.papers_root !== dir) {
    throw new Error(`papers_root 期望 ${dir}，实际 ${__savedConfig.papers_root}`);
  }
});

steps.then('缓存的论文按领域分子目录存放', async () => {
  // 后端 choose_papers_dir 的领域子目录行为由 paper_title_test.rs 覆盖，
  // 这里验证前端把领域关键词传给导入命令（根目录语义的一环）
  const { PaperSearch } = require('../../dist/scripts/learning/paper-search.js');
  PaperSearch._lastQuery = '铝电解因果建模';
  let captured = null;
  const originalInvoke = global.window.__TAURI__.core.invoke;
  global.window.__TAURI__.core.invoke = async (cmd, args) => {
    if (cmd === 'import_paper_from_url') {
      captured = args;
      return { md_path: '/tmp/x.md', md_content: '# x', title: 'x' };
    }
    return originalInvoke(cmd, args);
  };
  global.window.TyporaNext.invoke = global.window.__TAURI__.core.invoke;
  await PaperSearch._importItem({ url: 'https://arxiv.org/abs/2401.1', title: 't' });
  global.window.__TAURI__.core.invoke = originalInvoke;
  global.window.TyporaNext.invoke = originalInvoke;
  if (!captured || captured.domain !== '铝电解因果建模') {
    throw new Error(`导入未携带领域参数（实际: ${captured && captured.domain}）`);
  }
});
