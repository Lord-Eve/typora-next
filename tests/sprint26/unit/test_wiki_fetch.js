#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * TDD Tests for wiki-fetch.mjs（Sprint 26）
 *
 * skill 内置白名单 GET 脚本的行为契约：
 * - isAllowedUrl：仅 https + 精确域名白名单（防 evil-upload.wikimedia.org.evil.com）
 * - wikiFetch：可注入 fetchImpl，成功/HTTP 错误/网络异常全部结构化 JSON
 * - 截断：> 32KB 响应截断并标记
 * - CLI：拒绝非白名单 URL 时非零退出 + stdout 输出错误 JSON
 */

const TestRunner = require('../../shared/test-runner');
const { execFileSync } = require('child_process');
const path = require('path');
const { pathToFileURL } = require('url');

const SCRIPT = path.join(__dirname, '../../../src-tauri/skills/wikimedia-commons/scripts/wiki-fetch.mjs');

(async () => {
  const mod = await import(pathToFileURL(SCRIPT).href);
  const { isAllowedUrl, wikiFetch, MAX_BYTES } = mod;

  // ---------- isAllowedUrl ----------

  TestRunner.test('放行 Commons API URL', () => {
    TestRunner.assert(isAllowedUrl('https://commons.wikimedia.org/w/api.php?action=query'));
  });

  TestRunner.test('放行 upload.wikimedia.org 直链', () => {
    TestRunner.assert(isAllowedUrl('https://upload.wikimedia.org/wikipedia/commons/a/b9/x.ogg'));
  });

  TestRunner.test('拒绝其他域名', () => {
    TestRunner.assert(!isAllowedUrl('https://example.com/api'));
  });

  TestRunner.test('拒绝伪装子域（evil.com 结尾）', () => {
    TestRunner.assert(!isAllowedUrl('https://commons.wikimedia.org.evil.com/w/api.php'));
  });

  TestRunner.test('拒绝 http（仅 https）', () => {
    TestRunner.assert(!isAllowedUrl('http://commons.wikimedia.org/w/api.php'));
  });

  TestRunner.test('拒绝非 URL 输入', () => {
    TestRunner.assert(!isAllowedUrl('not-a-url'));
    TestRunner.assert(!isAllowedUrl(''));
  });

  // ---------- wikiFetch（注入 mock fetch）----------

  const mockResponse = (status, body) => ({ status, ok: status >= 200 && status < 300, text: async () => body });

  TestRunner.test('成功路径返回 ok:true + body', async () => {
    const r = await wikiFetch('https://commons.wikimedia.org/w/api.php', async () => mockResponse(200, '{"a":1}'));
    TestRunner.assert(r.ok === true, 'ok');
    TestRunner.assert(r.status === 200, 'status');
    TestRunner.assert(r.body === '{"a":1}', 'body');
  });

  TestRunner.test('HTTP 错误返回 ok:false + status', async () => {
    const r = await wikiFetch('https://commons.wikimedia.org/w/api.php', async () => mockResponse(404, 'not found'));
    TestRunner.assert(r.ok === false, 'ok false');
    TestRunner.assert(r.status === 404, 'status 404');
  });

  TestRunner.test('网络异常返回 ok:false + error，不抛出', async () => {
    const r = await wikiFetch('https://commons.wikimedia.org/w/api.php', async () => { throw new Error('ETIMEDOUT'); });
    TestRunner.assert(r.ok === false, 'ok false');
    TestRunner.assert(r.error.includes('ETIMEDOUT'), 'error message');
  });

  TestRunner.test('非白名单 URL 直接拒绝（不发请求）', async () => {
    let called = false;
    const r = await wikiFetch('https://example.com/', async () => { called = true; return mockResponse(200, ''); });
    TestRunner.assert(r.ok === false, 'ok false');
    TestRunner.assert(!called, 'fetch 未被调用');
  });

  TestRunner.test('超过 32KB 的响应被截断并标记', async () => {
    const big = 'x'.repeat(MAX_BYTES + 1000);
    const r = await wikiFetch('https://commons.wikimedia.org/w/api.php', async () => mockResponse(200, big));
    TestRunner.assert(r.ok === true, 'ok');
    TestRunner.assert(r.body.length === MAX_BYTES, 'body 截断到 MAX_BYTES');
    TestRunner.assert(r.truncated === true, 'truncated 标记');
  });

  // ---------- CLI 形态 ----------

  TestRunner.test('CLI 拒绝非白名单 URL：非零退出 + stdout 错误 JSON', () => {
    let code = 0, stdout = '';
    try {
      stdout = execFileSync('node', [SCRIPT, 'https://example.com/'], { encoding: 'utf-8' });
    } catch (e) {
      code = e.status;
      stdout = e.stdout || '';
    }
    TestRunner.assert(code !== 0, '非零退出');
    const parsed = JSON.parse(stdout.trim());
    TestRunner.assert(parsed.ok === false, 'stdout 是结构化错误 JSON');
  });

  const { failed } = await TestRunner.run();
  process.exit(failed > 0 ? 1 : 0);
})();
