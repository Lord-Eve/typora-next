#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * TDD Tests for openalex-lookup.mjs（Sprint 31, paper-rescue skill）
 *
 * OpenAlex 是 S2 429 的平替：无 key、无共享 IP 额度问题。
 * 契约同 wiki-fetch：固定端点 + 参数仅 DOI/标题 + 注入 fetchImpl +
 * 截断 + 结构化错误 JSON。
 */

const TestRunner = require('../../shared/test-runner');
const path = require('path');
const { pathToFileURL } = require('url');

const SCRIPT = path.join(__dirname, '../../../src-tauri/skills/paper-rescue/scripts/openalex-lookup.mjs');

(async () => {
  const mod = await import(pathToFileURL(SCRIPT).href);
  const { buildOpenalexUrl, openalexLookup } = mod;

  // ---------- buildOpenalexUrl ----------

  TestRunner.test('裸 DOI 走 works/doi 端点', () => {
    const url = buildOpenalexUrl('10.1360/csb2008-53-19-2265');
    TestRunner.assert(url.startsWith('https://api.openalex.org/works/doi:10.1360'), `实际: ${url}`);
  });

  TestRunner.test('doi.org URL 提取 DOI', () => {
    const url = buildOpenalexUrl('https://doi.org/10.1360/csb2008-53-19-2265');
    TestRunner.assert(url.includes('/works/doi:10.1360'), `实际: ${url}`);
  });

  TestRunner.test('标题走 search 端点且编码', () => {
    const url = buildOpenalexUrl('铁基高温超导体 研究进展');
    TestRunner.assert(url.includes('/works?search='), `实际: ${url}`);
    TestRunner.assert(url.includes(encodeURIComponent('铁基高温超导体')), '标题应 URL 编码');
  });

  TestRunner.test('空参数拒绝', () => {
    TestRunner.assert(buildOpenalexUrl('') === null);
    TestRunner.assert(buildOpenalexUrl('   ') === null);
  });

  // ---------- openalexLookup（注入 fetchImpl）----------

  const mockResponse = (status, body) => ({ status, ok: status >= 200 && status < 300, text: async () => body });

  TestRunner.test('成功路径返回 ok:true + body', async () => {
    const r = await openalexLookup('10.1360/csb2008-53-19-2265', async () => mockResponse(200, '{"open_access":{"oa_url":"https://x/pdf"}}'));
    TestRunner.assert(r.ok === true, 'ok');
    TestRunner.assert(r.body.includes('oa_url'), 'body 含 oa_url');
  });

  TestRunner.test('HTTP 错误返回 ok:false + status', async () => {
    const r = await openalexLookup('10.1360/not-found', async () => mockResponse(404, 'not found'));
    TestRunner.assert(r.ok === false && r.status === 404, '404');
  });

  TestRunner.test('网络异常返回 ok:false，不抛出', async () => {
    const r = await openalexLookup('10.1360/x', async () => { throw new Error('ETIMEDOUT'); });
    TestRunner.assert(r.ok === false && /ETIMEDOUT/.test(r.error), 'error');
  });

  TestRunner.test('非法参数不发请求', async () => {
    let called = false;
    const r = await openalexLookup('', async () => { called = true; return mockResponse(200, '{}'); });
    TestRunner.assert(r.ok === false && !called, '不应发请求');
  });

  TestRunner.test('超长响应截断并标记', async () => {
    const big = 'x'.repeat(40 * 1024);
    const r = await openalexLookup('10.1360/x', async () => mockResponse(200, big));
    TestRunner.assert(r.ok === true && r.truncated === true, 'truncated');
    TestRunner.assert(r.body.length <= 32 * 1024, 'body ≤ 32KB');
  });

  const { failed } = await TestRunner.run();
  process.exit(failed > 0 ? 1 : 0);
})();
