#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * TDD Tests for bridge 受限 wiki-fetch 执行器（Sprint 26）
 *
 * isWikiFetchCommand 是纯函数：校验 bash 命令行是否只调用
 * wikimedia-commons skill 自带的 wiki-fetch.mjs 脚本。
 * 其他任何命令（curl / rm / 注入拼接）一律拒绝。
 */

const TestRunner = require('../../shared/test-runner');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const bridge = await import(pathToFileURL(path.join(__dirname, '../../../agent-bridge.mjs')).href);
  const { isWikiFetchCommand } = bridge;

  const PROJECT = 'C:\\Users\\me\\course';
  const skillScriptWin = `${PROJECT}\\.pi\\skills\\wikimedia-commons\\scripts\\wiki-fetch.mjs`;
  const skillScriptPosix = '/home/me/course/.pi/skills/wikimedia-commons/scripts/wiki-fetch.mjs';

  // ---------- 放行 ----------

  TestRunner.test('放行：node + skill 脚本 + URL（Windows 路径）', () => {
    TestRunner.assert(isWikiFetchCommand(`node "${skillScriptWin}" "https://commons.wikimedia.org/w/api.php?action=query"`));
  });

  TestRunner.test('放行：POSIX 路径变体', () => {
    TestRunner.assert(isWikiFetchCommand(`node "${skillScriptPosix}" "https://upload.wikimedia.org/x.ogg"`));
  });

  TestRunner.test('放行：路径无引号（无空格时 agent 可能不加）', () => {
    TestRunner.assert(isWikiFetchCommand(`node ${skillScriptPosix} "https://commons.wikimedia.org/w/api.php"`));
  });

  // ---------- 拒绝 ----------

  TestRunner.test('拒绝：curl 等其他命令', () => {
    TestRunner.assert(!isWikiFetchCommand('curl https://commons.wikimedia.org/w/api.php'));
  });

  TestRunner.test('拒绝：node 跑别的脚本', () => {
    TestRunner.assert(!isWikiFetchCommand('node evil.mjs "https://commons.wikimedia.org/"'));
  });

  TestRunner.test('拒绝：命令拼接注入（&&）', () => {
    TestRunner.assert(!isWikiFetchCommand(`node "${skillScriptPosix}" "https://commons.wikimedia.org/" && rm -rf /`));
  });

  TestRunner.test('拒绝：分号拼接注入', () => {
    TestRunner.assert(!isWikiFetchCommand(`node "${skillScriptPosix}" "https://commons.wikimedia.org/"; cat /etc/passwd`));
  });

  TestRunner.test('拒绝：URL 非白名单域名（双保险，脚本内还有一层）', () => {
    TestRunner.assert(!isWikiFetchCommand(`node "${skillScriptPosix}" "https://example.com/"`));
  });

  TestRunner.test('拒绝：管道', () => {
    TestRunner.assert(!isWikiFetchCommand(`node "${skillScriptPosix}" "https://commons.wikimedia.org/" | tee /tmp/x`));
  });

  TestRunner.test('拒绝：空命令', () => {
    TestRunner.assert(!isWikiFetchCommand(''));
  });

  const { failed } = await TestRunner.run();
  process.exit(failed > 0 ? 1 : 0);
})();
