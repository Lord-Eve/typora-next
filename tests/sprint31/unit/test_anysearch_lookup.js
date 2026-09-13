#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * TDD Tests for anysearch-lookup.mjs（Sprint 31, paper-rescue skill）
 *
 * AnySearch 脚本化：key 只从 env TYPORA_ANYSEARCH_KEY 读（不进 argv/日志），
 * 端点固定 api.anysearch.com，参数仅 query 字符串。
 */

const TestRunner = require('../../shared/test-runner');
const path = require('path');
const { pathToFileURL } = require('url');

const SCRIPT = path.join(__dirname, '../../../src-tauri/skills/paper-rescue/scripts/anysearch-lookup.mjs');

(async () => {
  const mod = await import(pathToFileURL(SCRIPT).href);
  const { anysearchLookup } = mod;

  const mockResponse = (status, body) => ({ status, ok: status >= 200 && status < 300, text: async () => body });

  TestRunner.test('无 key 返回结构化错误，不发请求', async () => {
    let called = false;
    const r = await anysearchLookup('铁基超导 pdf', {
      apiKey: '',
      fetchImpl: async () => { called = true; return mockResponse(200, '{}'); }
    });
    TestRunner.assert(r.ok === false && /KEY/i.test(r.error), 'key 错误');
    TestRunner.assert(!called, '不应发请求');
  });

  TestRunner.test('成功路径带 Bearer 与 academic.search tag', async () => {
    let seen = null;
    const r = await anysearchLookup('铁基超导 pdf', {
      apiKey: 'as_sk_test',
      fetchImpl: async (url, opts) => {
        seen = { url, opts };
        return mockResponse(200, '{"code":0,"data":{"results":[]}}');
      }
    });
    TestRunner.assert(r.ok === true, 'ok');
    TestRunner.assert(seen.url === 'https://api.anysearch.com/v1/search', `端点固定: ${seen.url}`);
    TestRunner.assert(seen.opts.headers.Authorization === 'Bearer as_sk_test', 'Bearer');
    const payload = JSON.parse(seen.opts.body);
    TestRunner.assert(payload.query === '铁基超导 pdf', 'query');
    TestRunner.assert(payload.tag === 'academic.search', 'tag');
  });

  TestRunner.test('HTTP 错误返回 ok:false + status', async () => {
    const r = await anysearchLookup('q', { apiKey: 'k', fetchImpl: async () => mockResponse(429, 'rate limited') });
    TestRunner.assert(r.ok === false && r.status === 429, '429');
  });

  TestRunner.test('网络异常返回 ok:false，不抛出', async () => {
    const r = await anysearchLookup('q', { apiKey: 'k', fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
    TestRunner.assert(r.ok === false && /ECONNREFUSED/.test(r.error));
  });

  TestRunner.test('空 query 拒绝', async () => {
    const r = await anysearchLookup('  ', { apiKey: 'k', fetchImpl: async () => mockResponse(200, '{}') });
    TestRunner.assert(r.ok === false, '空 query 拒绝');
  });

  const { failed } = await TestRunner.run();
  process.exit(failed > 0 ? 1 : 0);
})();
