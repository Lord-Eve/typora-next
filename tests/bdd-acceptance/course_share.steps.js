#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * BDD Acceptance Steps: 课程分享（内容打包与应用内导入）
 *
 * 三层分工：
 *  - 行为验证（导出→导入 roundtrip 不泄漏上下文、zip-slip 防护、状态重置）
 *    由 src-tauri/tests/share_course_test.rs 在真实文件系统上覆盖；
 *  - 本层守「接线」与「导入侧读法」：命令注册、前端入口、以及用真实的
 *    learning-hub.js detectProjectAt 逻辑验证净化后的清单读出来是零进度。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { StepRegistry } = require('../shared/runner');

const ROOT = path.join(__dirname, '../..');
const MODULE_PATH = path.join(ROOT, 'src-tauri/src/share_course.rs');
const LIB_PATH = path.join(ROOT, 'src-tauri/src/lib.rs');
const HUB_PATH = path.join(ROOT, 'dist/scripts/learning/learning-hub.js');

const steps = new StepRegistry();

// ============================================
// Given
// ============================================
steps.given('the course share source files', function() {
  if (!fs.existsSync(MODULE_PATH)) throw new Error(`缺少分享模块: ${MODULE_PATH}`);
  this.moduleSrc = fs.readFileSync(MODULE_PATH, 'utf-8');
  this.libSrc = fs.readFileSync(LIB_PATH, 'utf-8');
  this.hubSrc = fs.readFileSync(HUB_PATH, 'utf-8');
});

steps.given('an imported course folder with a sanitized manifest', function() {
  // 模拟分享包解压后的课程目录：净化后的 manifest（ready / not_generated）
  this.fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-share-bdd-'));
  const learningDir = path.join(this.fixtureDir, '.learning');
  fs.mkdirSync(learningDir, { recursive: true });
  const manifest = {
    name: '分享的课程',
    created: 1700000000,
    total_duration: 60,
    share_version: 1,
    chapters: [
      { title: '第一章', duration_minutes: 30, concepts: ['a'], file: '01-a.md' },
      { title: '第二章', duration_minutes: 30, concepts: ['b'], file: '02-b.md' }
    ],
    chapters_status: {
      '01-a.md': 'ready',
      '02-b.md': 'not_generated'
    }
  };
  fs.writeFileSync(
    path.join(learningDir, 'project.json'),
    JSON.stringify(manifest, null, 2)
  );
  fs.writeFileSync(path.join(this.fixtureDir, '01-a.md'), '# 第一章');
});

// ============================================
// Then
// ============================================
steps.then('the share_course module should sanitize the manifest before packing', function() {
  // 净化函数存在且剥离进度字段
  if (!this.moduleSrc.includes('pub fn sanitize_project_json')) {
    throw new Error('share_course.rs 缺少 sanitize_project_json');
  }
  if (!this.moduleSrc.includes('obj.remove("course_status")')) {
    throw new Error('净化未删除 course_status（完成标记会泄漏）');
  }
  // 状态重置语义：存在 → ready，缺失 → not_generated
  if (!this.moduleSrc.includes('"ready"') || !this.moduleSrc.includes('"not_generated"')) {
    throw new Error('净化未重置 chapters_status 为 ready / not_generated');
  }
  // 白名单收集（而非整树拷贝）
  if (!this.moduleSrc.includes('pub fn collect_course_files')) {
    throw new Error('share_course.rs 缺少白名单收集 collect_course_files');
  }
  // 解压必须有 zip-slip 防护
  if (!this.moduleSrc.includes('enclosed_name()')) {
    throw new Error('extract_zip_to 缺少 enclosed_name() zip-slip 防护');
  }
});

steps.then('the tauri commands share_course and import_course should be registered', function() {
  for (const cmd of ['share_course', 'import_course']) {
    if (!new RegExp(`async fn ${cmd}\\b`).test(this.libSrc)) {
      throw new Error(`lib.rs 缺少命令 ${cmd}`);
    }
  }
  // generate_handler! 注册段里必须出现（命令定义了但没注册 = 前端调不到）
  const handlerIdx = this.libSrc.indexOf('generate_handler!');
  if (handlerIdx < 0) throw new Error('lib.rs 缺少 generate_handler!');
  const handlerBlock = this.libSrc.slice(handlerIdx, handlerIdx + 4000);
  for (const cmd of ['share_course', 'import_course']) {
    if (!handlerBlock.includes(cmd)) {
      throw new Error(`generate_handler! 未注册 ${cmd}`);
    }
  }
});

steps.then('the learning hub should expose the import zip button', function() {
  if (!this.hubSrc.includes('id="learningHubImportZip"')) {
    throw new Error('学习中心缺少「导入课程包」按钮 #learningHubImportZip');
  }
  if (!this.hubSrc.includes("invoke('import_course')")) {
    throw new Error('导入按钮未调用 import_course 命令');
  }
});

steps.then('the learning hub cards should have a visible share button', function() {
  // 显性按钮（与删除并排），而非右键菜单——2026-09-17 用户反馈：右键不可发现
  if (!this.hubSrc.includes('learning-hub-card-share')) {
    throw new Error('项目卡片缺少分享按钮 .learning-hub-card-share');
  }
  if (!this.hubSrc.includes('分享课程')) {
    throw new Error('分享按钮缺少「分享课程」提示文案');
  }
  if (!this.hubSrc.includes("invoke('share_course'")) {
    throw new Error('分享按钮未调用 share_course 命令');
  }
  // 分享按钮与删除按钮一致：hover 卡片才显现
  // （2026-09-18 用户反馈：常驻太吵，与删除统一收进 hover；
  //  取代 09-17「显性表达」决策——发现性由按钮与删除并排的位置承担）
  const cssPath = path.join(ROOT, 'dist/styles/learning.css');
  const css = fs.readFileSync(cssPath, 'utf-8');
  const shareRule = css.match(/\.learning-hub-card-share\s*\{[^}]*\}/);
  if (!shareRule) throw new Error('learning.css 缺少 .learning-hub-card-share 规则');
  if (!/opacity:\s*0/.test(shareRule[0])) {
    throw new Error('分享按钮应与删除按钮一致：opacity: 0，hover 卡片才显现');
  }
  if (!/\.learning-hub-card:hover\s+\.learning-hub-card-share/.test(css)) {
    throw new Error('缺少 .learning-hub-card:hover .learning-hub-card-share 显现规则');
  }
});

steps.then('the hub should detect the course with zero completed chapters', async function() {
  // 用真实 learning-hub.js 的 detectProjectAt 逻辑读净化后的清单，
  // __TAURI__.fs 由 Node fs 兜底（真实文件系统层）
  global.window = {
    __TAURI__: {
      fs: {
        exists: async (p) => fs.existsSync(p),
        readTextFile: async (p) => fs.readFileSync(p, 'utf-8')
      }
    }
  };
  global.document = { createElement: () => ({ set textContent(v) {}, get innerHTML() { return ''; } }) };
  const { detectProjectAt } = require(HUB_PATH);

  const info = await detectProjectAt(this.fixtureDir);
  if (!info) throw new Error('detectProjectAt 未识别出课程项目');
  if (info.name !== '分享的课程') throw new Error(`课程名不对: ${info.name}`);
  if (info.chapters !== 2) throw new Error(`章节数不对: ${info.chapters}`);
  if (info.completed !== 0) {
    throw new Error(`净化后的课程应显示零进度，实际 completed=${info.completed}`);
  }
});

// ============================================
// Cleanup
// ============================================
steps._cleanup = function() {
  // 每个场景的 fixtureDir 挂在各自 context 上，这里兜底清理临时目录
  const tmp = os.tmpdir();
  for (const name of fs.readdirSync(tmp)) {
    if (name.startsWith('course-share-bdd-')) {
      fs.rmSync(path.join(tmp, name), { recursive: true, force: true });
    }
  }
};

module.exports = steps;
