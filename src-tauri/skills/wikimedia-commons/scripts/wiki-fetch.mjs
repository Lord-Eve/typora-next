#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * wiki-fetch — wikimedia-commons skill 内置的白名单 HTTP GET 脚本。
 *
 * 硬约束（设计文档 docs/plans/2026-09-07-humanities-media-embed-design.md）：
 * - 仅 GET、仅 https、域名白名单 commons.wikimedia.org / upload.wikimedia.org
 * - 响应截断 32KB
 * - 所有结果（含错误）以结构化 JSON 输出到 stdout，供 agent 读取
 *
 * 双重角色：CLI（node wiki-fetch.mjs <url>）+ 可 import 的模块（测试注入 fetch）。
 */

export const ALLOWED_HOSTS = ['commons.wikimedia.org', 'upload.wikimedia.org'];
export const MAX_BYTES = 32 * 1024;
const TIMEOUT_MS = 15000;

export function isAllowedUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  // 精确域名匹配：commons.wikimedia.org.evil.com 不过
  return u.protocol === 'https:' && ALLOWED_HOSTS.includes(u.hostname);
}

export async function wikiFetch(url, fetchImpl = fetch) {
  if (!isAllowedUrl(url)) {
    return { ok: false, error: `URL not in whitelist (only ${ALLOWED_HOSTS.join(' / ')} over https): ${url}` };
  }
  try {
    const res = await fetchImpl(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'TyporaNext-course-media/0.1 (educational course embed)' },
    });
    const text = await res.text();
    const truncated = text.length > MAX_BYTES;
    const body = truncated ? text.slice(0, MAX_BYTES) : text;
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}`, body };
    }
    return { ok: true, status: res.status, body, ...(truncated ? { truncated: true } : {}) };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

// CLI 入口：node wiki-fetch.mjs <url>
import { pathToFileURL } from 'url';
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const url = process.argv[2];
  if (!url) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'usage: node wiki-fetch.mjs <url>' }) + '\n');
    process.exit(2);
  }
  const result = await wikiFetch(url);
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(result.ok ? 0 : 1);
}
