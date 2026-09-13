#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * anysearch-lookup — paper-rescue skill 内置的固定端点学术搜索脚本。
 *
 * 用途：论文无开放获取（OA）时，按标题搜替代来源（预印本 / 机构库 / 会议版）。
 *
 * 硬约束：
 * - 仅 POST、端点固定 https://api.anysearch.com/v1/search
 * - 参数只有一个：query 字符串
 * - API key 只从环境变量 TYPORA_ANYSEARCH_KEY 读（不进 argv / 日志 / 输出）
 * - 响应截断 32KB；所有结果（含错误）以结构化 JSON 输出到 stdout
 *
 * 双重角色：CLI（TYPORA_ANYSEARCH_KEY=... node anysearch-lookup.mjs "<query>"）
 *          + 可 import 模块（测试注入 fetch）。
 */

export const ANYSEARCH_ENDPOINT = 'https://api.anysearch.com/v1/search';
export const MAX_BYTES = 32 * 1024;
const TIMEOUT_MS = 15000;

/**
 * 搜索 AnySearch。opts.apiKey / opts.fetchImpl 可注入（测试）。
 * 返回结构化 JSON 对象。
 */
export async function anysearchLookup(query, opts = {}) {
  const apiKey = opts.apiKey !== undefined ? opts.apiKey : process.env.TYPORA_ANYSEARCH_KEY;
  const fetchImpl = opts.fetchImpl || fetch;
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) {
    return { ok: false, error: 'empty query' };
  }
  if (!apiKey) {
    return { ok: false, error: 'TYPORA_ANYSEARCH_KEY not set — AnySearch lookup unavailable' };
  }
  try {
    const res = await fetchImpl(ANYSEARCH_ENDPOINT, {
      method: 'POST',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query: q, tag: 'academic.search', max_results: 5 }),
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

// CLI 入口：node anysearch-lookup.mjs "<query>"（key 走 env）
import { pathToFileURL } from 'url';
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const query = process.argv[2];
  if (!query) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'usage: TYPORA_ANYSEARCH_KEY=... node anysearch-lookup.mjs "<query>"' }) + '\n');
    process.exit(2);
  }
  const result = await anysearchLookup(query);
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(result.ok ? 0 : 1);
}
