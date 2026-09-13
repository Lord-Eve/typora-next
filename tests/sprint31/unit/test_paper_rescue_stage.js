#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * TDD Tests for agent-bridge paper-rescue stage（Sprint 31）
 *
 * 核心契约（用户原则）：**全部**失败条目的 url/title/error 全文一次性进
 * prompt（批量视角，不是一篇一调），输出契约指向 scratch JSON 文件。
 */

const TestRunner = require('../../shared/test-runner');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const bridge = await import(pathToFileURL(path.join(__dirname, '../../../agent-bridge.mjs')).href);

  const FAILURES = [
    { url: 'https://doi.org/10.1360/csb2008-53-19-2265', title: '铁基高温超导体的研究进展及展望', error: '解析论文链接失败: Semantic Scholar 请求失败: status code 429；重试仍失败' },
    { url: 'http://www.jproeng.com/EN/10.12034/j.issn.1009-606X.217140', title: '第三代半导体器件应用', error: 'URL 不支持: 未找到开放获取 PDF' }
  ];
  const OUT = 'D:/work/.learning/.paper-rescue-result.json';

  TestRunner.test('buildPaperRescuePrompt 携带全部失败条目', () => {
    const p = bridge.buildPaperRescuePrompt(FAILURES, OUT);
    for (const f of FAILURES) {
      TestRunner.assert(p.includes(f.url), `缺 url: ${f.url}`);
      TestRunner.assert(p.includes(f.title), `缺 title: ${f.title}`);
      TestRunner.assert(p.includes(f.error), `缺 error 全文: ${f.title}`);
    }
  });

  TestRunner.test('buildPaperRescuePrompt 含输出契约与候选上限', () => {
    const p = bridge.buildPaperRescuePrompt(FAILURES, OUT);
    TestRunner.assert(p.includes(OUT), '应含输出文件路径');
    TestRunner.assert(p.includes('attempts'), '应含 attempts 契约');
    TestRunner.assert(p.includes('candidates'), '应含 candidates 契约');
  });

  TestRunner.test('buildPaperRescuePrompt 指导批量规划（先看共性再逐篇）', () => {
    const p = bridge.buildPaperRescuePrompt(FAILURES, OUT);
    TestRunner.assert(/共性|系统性|统一/.test(p), '应指导先找错误共性');
    TestRunner.assert(/openalex/i.test(p), '应提及 OpenAlex 换源');
    TestRunner.assert(/anysearch/i.test(p), '应提及 AnySearch 搜索');
  });

  TestRunner.test('buildPaperRescuePrompt 空失败列表返回空串', () => {
    TestRunner.assert(bridge.buildPaperRescuePrompt([], OUT) === '');
    TestRunner.assert(bridge.buildPaperRescuePrompt(null, OUT) === '');
  });

  TestRunner.test('rescuePapers stage 存在且走 runPiTurn（注入 runner）', async () => {
    TestRunner.assert(typeof bridge.rescuePapers === 'function', 'rescuePapers 导出');
    let seen = null;
    bridge.__setRunnerForTests(async (opts) => { seen = opts; return { output: 'done', sessionFile: null, refreshed: false }; });
    try {
      await bridge.rescuePapers(null, { api_key: 'k' }, { failures: FAILURES, work_dir: 'D:/work', output_file: OUT, anysearch_api_key: 'as_sk_x' });
    } finally {
      bridge.__setRunnerForTests(null);
    }
    TestRunner.assert(seen, 'runPiTurn 应被调用');
    TestRunner.assert(seen.prompt.includes(FAILURES[0].url), 'prompt 携带失败条目');
    TestRunner.assert(seen.cwd === 'D:/work', 'cwd = work_dir');
    TestRunner.assert(seen.tools.includes('read') && seen.tools.includes('write'), 'read/write 工具');
    TestRunner.assert(seen.paperRescue && seen.paperRescue.anysearchKey === 'as_sk_x', 'anysearch key 透传沙箱');
  });

  TestRunner.test('rescuePapers 空失败列表不调 agent', async () => {
    let called = false;
    bridge.__setRunnerForTests(async () => { called = true; return { output: '', sessionFile: null, refreshed: false }; });
    try {
      await bridge.rescuePapers(null, {}, { failures: [], work_dir: 'D:/work', output_file: OUT });
    } finally {
      bridge.__setRunnerForTests(null);
    }
    TestRunner.assert(!called, '空列表不应调 agent');
  });

  const { failed } = await TestRunner.run();
  process.exit(failed > 0 ? 1 : 0);
})();
