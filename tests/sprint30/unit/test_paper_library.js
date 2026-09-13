#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * TDD Tests for paper-library.js groupByDomain（Sprint 30）
 *
 * 论文库首页把全局导入索引按领域分组（课程模式 hub 的交互语言）：
 * - domain 字段分组，缺失/空白 → 未分类
 * - 组内按 cached_at 倒序（最近缓存在前）
 * - 组间按最新缓存时间倒序
 * - 无 md_path 的坏条目被丢弃
 */

const TestRunner = require('../../shared/test-runner');
const path = require('path');

const LIB = path.join(__dirname, '../../../dist/scripts/learning/paper-library.js');

(async () => {
  delete require.cache[require.resolve(LIB)];
  const { groupByDomain } = require(LIB);

  const mk = (domain, title, day) => ({
    url: `https://arxiv.org/abs/2401.${title}`,
    md_path: `D:\\papers\\${domain || ''}\\2026-09\\${title}.md`,
    title,
    cached_at: `2026-09-${String(day).padStart(2, '0')}T10:00:00+08:00`,
    domain: domain === undefined ? undefined : domain
  });

  TestRunner.test('按 domain 分组', () => {
    const groups = groupByDomain([
      mk('铝电解', 'a', 10), mk('本体论', 'b', 11), mk('铝电解', 'c', 12)
    ]);
    TestRunner.assert(groups.length === 2, '应有 2 组');
    const ly = groups.find((g) => g.domain === '铝电解');
    const bt = groups.find((g) => g.domain === '本体论');
    TestRunner.assert(ly && ly.papers.length === 2, '铝电解 2 篇');
    TestRunner.assert(bt && bt.papers.length === 1, '本体论 1 篇');
  });

  TestRunner.test('缺失 domain 归入未分类', () => {
    const e = mk(undefined, 'x', 10);
    delete e.domain;
    const groups = groupByDomain([e, mk('  ', 'y', 11)]);
    TestRunner.assert(groups.length === 1, '空白 domain 应合并');
    TestRunner.assert(groups[0].domain === '未分类', '归入未分类');
    TestRunner.assert(groups[0].papers.length === 2, '未分类 2 篇');
  });

  TestRunner.test('空输入返回空数组', () => {
    TestRunner.assert(groupByDomain([]).length === 0, '空数组');
    TestRunner.assert(groupByDomain(null).length === 0, 'null');
    TestRunner.assert(groupByDomain(undefined).length === 0, 'undefined');
  });

  TestRunner.test('组内按 cached_at 倒序', () => {
    const groups = groupByDomain([mk('铝电解', 'old', 9), mk('铝电解', 'new', 12)]);
    TestRunner.assert(groups[0].papers[0].title === 'new', '最新在前');
    TestRunner.assert(groups[0].papers[1].title === 'old', '最旧在后');
  });

  TestRunner.test('组间按最新缓存时间倒序', () => {
    const groups = groupByDomain([
      mk('本体论', 'b', 9), mk('铝电解', 'a', 12)
    ]);
    TestRunner.assert(groups[0].domain === '铝电解', '最近活跃的领域在前');
    TestRunner.assert(groups[1].domain === '本体论');
  });

  TestRunner.test('无 md_path 的坏条目被丢弃', () => {
    const bad = { url: 'https://x', title: 'bad', cached_at: '2026-09-10T00:00:00+08:00', domain: '铝电解' };
    const groups = groupByDomain([bad, mk('铝电解', 'good', 11)]);
    TestRunner.assert(groups.length === 1 && groups[0].papers.length === 1, '坏条目应丢弃');
    TestRunner.assert(groups[0].papers[0].title === 'good');
  });

  TestRunner.test('条目为 null 时不抛异常', () => {
    const groups = groupByDomain([null, mk('铝电解', 'ok', 10)]);
    TestRunner.assert(groups.length === 1 && groups[0].papers.length === 1);
  });

  const { failed } = await TestRunner.run();
  process.exit(failed > 0 ? 1 : 0);
})();
