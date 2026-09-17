/**
 * TDD Tests —— 滑动窗口并行章节生成（Sprint 31）
 *
 * 用户痛点：前 2 章串行生成太慢（t1 + t2）。改造：
 * - 窗口内最低位章节续接项目 session（session 文件单写者）；其余章节走
 *   fresh-session 并发生成，总耗时 ≈ max 而不是 sum。
 * - 并发上限 2（防 API 限流）。
 * - fresh-session 章节的 prompt 必须注入「必读上一章正文/concepts.json」
 *   连贯性指令（弥补缺失的 session 记忆）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import T from '../../shared/test-runner.js';
import * as bridge from '../../../agent-bridge.mjs';

// ============================================
// Helpers
// ============================================

/** Capture stdout JSON lines emitted via emit() during fn(). */
function captureEvents(fn) {
  const events = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    const line = typeof chunk === 'string' ? chunk : chunk.toString();
    for (const l of line.split('\n').filter(Boolean)) {
      try { events.push(JSON.parse(l.trim())); } catch (e) { /* non-JSON stdout */ }
    }
    return true;
  };
  return fn().then(() => {
    process.stdout.write = originalWrite;
    return events;
  }).catch(e => {
    process.stdout.write = originalWrite;
    throw e;
  });
}

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const TWO_CH = { chapters: [
  { title: '一', duration_minutes: 10, concepts: [] },
  { title: '二', duration_minutes: 10, concepts: [] }
] };

/** Mock runner: writes the expected file for chapter idx after `delay` ms. */
function mockRunner(proj, { delay = 30, failIndex = null, track = null } = {}) {
  return async (opts) => {
    const idx = parseInt(opts.prompt.match(/chapter_index:\s*(\d+)/)[1], 10);
    if (track) track(idx, opts);
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
    if (idx === failIndex) throw new Error('boom');
    const title = JSON.parse(opts.prompt.match(/chapter_title:\s*(".*")/m)[1]);
    fs.writeFileSync(path.join(proj, bridge.generateFilename(idx, title)), '# ch');
    return { output: 'chapter files written ok', sessionFile: null, refreshed: false };
  };
}

// ============================================
// 并行调度
// ============================================

T.test('generateChapters: 有 session 时窗口 2 章并发（两 turn 交叠）', async () => {
  const proj = tmpdir('par-overlap-');
  let running = 0, maxRunning = 0;
  bridge.__setRunnerForTests(mockRunner(proj, {
    delay: 50,
    track: () => { running++; maxRunning = Math.max(maxRunning, running); setTimeout(() => running--, 0); }
  }));
  const events = await captureEvents(() => bridge.generateChapters(null, {}, {
    project_path: proj, outline: TWO_CH,
    chapter_indices: [0, 1], session_id: 'unused-path.jsonl'
  }));
  T.assert(maxRunning >= 2, `两章应并发执行（峰值并发=${maxRunning}）`);
  T.assertEquals(events.filter(e => e.type === 'chapter_complete').length, 2);
  bridge.__setRunnerForTests(null);
});

T.test('generateChapters: 有 session 时仅最低位章节续接 session，其余 fresh', async () => {
  const proj = tmpdir('par-session-');
  const sessionCalls = [];
  bridge.__setRunnerForTests(mockRunner(proj, {
    track: (idx, opts) => sessionCalls.push({ idx, sessionId: opts.sessionId || null })
  }));
  await captureEvents(() => bridge.generateChapters(null, {}, {
    project_path: proj, outline: TWO_CH,
    chapter_indices: [1, 0], session_id: 'proj-session.jsonl'
  }));
  const resumed = sessionCalls.filter(c => c.sessionId === 'proj-session.jsonl');
  T.assertEquals(resumed.length, 1, 'session 文件只能有一个并发写者');
  T.assertEquals(resumed[0].idx, 0, '续接 session 的应是最低位章节');
  T.assertEquals(sessionCalls.filter(c => c.sessionId === null).length, 1, '其余章节走 fresh-session');
  bridge.__setRunnerForTests(null);
});

T.test('generateChapters: 无 session 时全部并发且不超上限 2', async () => {
  const proj = tmpdir('par-cap-');
  const THREE = { chapters: [
    { title: '一', duration_minutes: 10, concepts: [] },
    { title: '二', duration_minutes: 10, concepts: [] },
    { title: '三', duration_minutes: 10, concepts: [] }
  ] };
  let running = 0, maxRunning = 0;
  bridge.__setRunnerForTests(mockRunner(proj, {
    delay: 30,
    track: () => { running++; maxRunning = Math.max(maxRunning, running); setTimeout(() => running--, 0); }
  }));
  const events = await captureEvents(() => bridge.generateChapters(null, {}, {
    project_path: proj, outline: THREE
  }));
  T.assert(maxRunning <= 2, `并发不得超过 2（实测=${maxRunning}）`);
  T.assertEquals(events.filter(e => e.type === 'chapter_complete').length, 3);
  bridge.__setRunnerForTests(null);
});

T.test('generateChapters: 单章继续失败不拖垮另一章（错误隔离）', async () => {
  const proj = tmpdir('par-iso-');
  bridge.__setRunnerForTests(mockRunner(proj, { failIndex: 0 }));
  const events = await captureEvents(() => bridge.generateChapters(null, {}, {
    project_path: proj, outline: TWO_CH, chapter_indices: [0, 1]
  }));
  T.assertExists(events.find(e => e.type === 'chapter_failed' && e.data.index === 0), '第 1 章失败');
  T.assertExists(events.find(e => e.type === 'chapter_complete' && e.data.index === 1), '第 2 章不受牵连');
  bridge.__setRunnerForTests(null);
});

// ============================================
// 连贯性：fresh-session 章节 prompt 必读上一章文件
// ============================================

T.test('buildChapterPrompt: 非首章注入必读上一章文件指令', async () => {
  const p = bridge.buildChapterPrompt({
    index: 1, chapter: { title: '二', duration_minutes: 10, concepts: [] },
    projectPath: '/tmp/x', previousChapters: ['一'], courseType: undefined, hasSession: false,
    prevChapter: { title: '一', duration_minutes: 10, concepts: ['a'] }
  });
  const prevMd = bridge.generateFilename(0, '一');
  T.assert(p.includes(prevMd), `prompt 应点名上一章文件名 ${prevMd}`);
  T.assert(p.includes('concepts.json'), '应要求读上一章 concepts.json');
  T.assert(p.includes('术语'), '应强调沿用术语');
});

T.test('buildChapterPrompt: 首章不注入连贯性指令', async () => {
  const p = bridge.buildChapterPrompt({
    index: 0, chapter: { title: '一', duration_minutes: 10, concepts: [] },
    projectPath: '/tmp/x', previousChapters: [], courseType: undefined, hasSession: false
  });
  T.assert(!p.includes('必读上一章'), '首章不应出现连贯性指令');
});

const { failed } = await T.run();
process.exit(failed > 0 ? 1 : 0);
