#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * TDD Tests for element-repair 补图分支（Sprint 24 内联 SVG 插图）
 *
 * 覆盖 buildElementRepairPrompt 的 kind 分派：
 * - code-block 违规 → 学科化重写指令（sprint20 行为回归）
 * - missing-svg-figure 违规 → 先读 inline-svg-spec + 补图指令 + 最低要求兜底
 * - 混合违规 → 两类指令同现
 */

const TestRunner = require('../../shared/test-runner');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const bridge = await import(pathToFileURL(path.join(__dirname, '../../../agent-bridge.mjs')).href);

  const CODE_REPAIRS = [
    {
      file: '01-等离子刻蚀.md',
      violations: [
        { kind: 'code-block', lang: 'python', line: 5, detail: 'engineering 禁止编程代码块：`python`（5 行起）' }
      ]
    }
  ];
  const SVG_REPAIRS = [
    {
      file: '02-电解槽结构.md',
      violations: [
        { kind: 'missing-svg-figure', lang: '', line: 0, detail: 'engineering 课程章节缺少内联 SVG 插图：请在最合适的小节插入 1 张符合 inline-svg-spec 的插图（设备/槽型剖面、机理微观示意…）' }
      ]
    }
  ];
  const MIXED_REPAIRS = [
    {
      file: '01-等离子刻蚀.md',
      violations: [
        { kind: 'code-block', lang: 'javascript', line: 9, detail: 'engineering 禁止编程代码块' },
        { kind: 'missing-svg-figure', lang: '', line: 0, detail: '缺少内联 SVG 插图' }
      ]
    }
  ];

  // ============================================
  // 回归：code-block 分支保持 sprint20 行为
  // ============================================

  await TestRunner.test('code-block: 保留学科化重写指令与原样保留约束', async () => {
    const p = bridge.buildElementRepairPrompt('/tmp/proj', CODE_REPAIRS);
    TestRunner.assert(p.includes('真实公式'), 'engineering 重写指令应保留');
    TestRunner.assert(/原样保留，一字不改/.test(p), '应要求其余内容原样保留');
    TestRunner.assert(!p.includes('inline-svg-spec'), '纯代码块违规不应引入 SVG 规范');
  });

  // ============================================
  // 新增：missing-svg-figure 分支
  // ============================================

  await TestRunner.test('missing-svg: 指示先读 inline-svg-spec.md', async () => {
    const p = bridge.buildElementRepairPrompt('/tmp/proj', SVG_REPAIRS);
    TestRunner.assert(
      p.includes('.pi/skills/chapter-generation/references/inline-svg-spec.md'),
      '应指向项目内规范副本'
    );
    TestRunner.assert(p.includes('.claude/skills/'), '应有 legacy fallback 路径');
  });

  await TestRunner.test('missing-svg: 补图指令含最低要求兜底', async () => {
    const p = bridge.buildElementRepairPrompt('/tmp/proj', SVG_REPAIRS);
    TestRunner.assert(p.includes('missing-svg-figure'), '应回显 kind 供分派');
    TestRunner.assert(p.includes('viewBox'), '最低要求应含 viewBox 680 画布');
    TestRunner.assert(p.includes('#F1EFE8'), '最低要求应含浅色底卡');
    TestRunner.assert(p.includes('禁 class/style 块'), '最低要求应列兼容性禁用项');
  });

  await TestRunner.test('missing-svg: 违规 JSON 与 detail 原样透传', async () => {
    const p = bridge.buildElementRepairPrompt('/tmp/proj', SVG_REPAIRS);
    TestRunner.assert(p.includes('02-电解槽结构.md'), '应含违规文件名');
    TestRunner.assert(p.includes('设备/槽型剖面'), 'detail 里的插图方向应透传');
  });

  await TestRunner.test('mixed: 两类指令同现', async () => {
    const p = bridge.buildElementRepairPrompt('/tmp/proj', MIXED_REPAIRS);
    TestRunner.assert(p.includes('真实公式'), 'code-block 指令应在');
    TestRunner.assert(p.includes('inline-svg-spec'), '补图指令应在');
  });

  await TestRunner.test('空 repairs 仍返回空串', async () => {
    TestRunner.assertEquals(bridge.buildElementRepairPrompt('/tmp/proj', []), '');
  });

  const { failed } = await TestRunner.run();
  process.exit(failed > 0 ? 1 : 0);
})();
