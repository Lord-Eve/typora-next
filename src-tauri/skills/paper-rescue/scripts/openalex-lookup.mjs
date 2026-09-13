#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * openalex-lookup — paper-rescue skill 内置的固定端点查询脚本。
 *
 * 用途：Semantic Scholar 429（共享 IP 额度耗尽）时的平替元数据源。
 * OpenAlex 无 key、无共享额度问题，直接给 open_access.oa_url。
 *
 * 硬约束：
 * - 仅 GET、仅 https、端点固定 api.openalex.org/works
 * - 参数只有一个：DOI（裸 DOI 或 doi.org URL）或论文标题
 * - 响应截断 32KB；所有结果（含错误）以结构化 JSON 输出到 stdout
 *
 * 双重角色：CLI（node openalex-lookup.mjs <doi|title>）+ 可 import 模块（测试注入 fetch）。
 */

export const OPENALEX_BASE = 'https://api.openalex.org';
export const MAX_BYTES = 32 * 1024;
const TIMEOUT_MS = 15000;

const DOI_RE = /^10\.\d{4,}\/\S+$/;

/**
 * 构造 OpenAlex 查询 URL。入参为裸 DOI / doi.org URL / 论文标题。
 * 非法输入返回 null。
 */
export function buildOpenalexUrl(arg) {
  if (typeof arg !== 'string') return null;
  let s = arg.trim();
  if (!s) return null;
  // doi.org URL → 裸 DOI
  s = s.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (DOI_RE.test(s)) {
    return `${OPENALEX_BASE}/works/doi:${encodeURIComponent(s)}`;
  }
  // 否则当标题走 search 端点（标题里混入 URL 协议头的一律拒绝）
  if (/[<>]/.test(s)) return null;
  return `${OPENALEX_BASE}/works?search=${encodeURIComponent(s)}&per-page=5`;
}

/**
 * 查询 OpenAlex。fetchImpl 可注入（测试）。返回结构化 JSON 对象。
 */
export async function openalexLookup(arg, fetchImpl = fetch) {
  const url = buildOpenalexUrl(arg);
  if (!url) {
    return { ok: false, error: `invalid argument (expect bare DOI, doi.org URL, or paper title): ${String(arg)}` };
  }
  try {
    const res = await fetchImpl(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'TyporaNext-paper-rescue/0.1 (academic metadata lookup)' },
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

// CLI 入口：node openalex-lookup.mjs <doi|title>
import { pathToFileURL } from 'url';
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const arg = process.argv[2];
  if (!arg) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'usage: node openalex-lookup.mjs <doi|title>' }) + '\n');
    process.exit(2);
  }
  const result = await openalexLookup(arg);
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(result.ok ? 0 : 1);
}
