#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * BDD Acceptance Steps: 划线批注 UX（就近输入 + 备注标志 + hover 可读）
 *
 * main.js 是巨型 IIFE 无法直接 require，本层按仓库先例
 * （tests/sprint7/unit/test_external_open_attention.js）做源码契约断言：
 * 读 main.js / main.css 源码，用花括号配对提取函数体，断言关键契约存在/消失。
 *
 * 防「测试假绿」纪律：每个断言都先在未实现的源码上跑红，再实现到绿。
 */

const fs = require('fs');
const path = require('path');
const { StepRegistry } = require('../shared/runner');

const ROOT = path.join(__dirname, '../..');
const MAIN_JS = path.join(ROOT, 'dist/scripts/main.js');
const MAIN_CSS = path.join(ROOT, 'dist/styles/main.css');

const steps = new StepRegistry();

/** 从源码中提取以 marker 开头的函数体（花括号配对），提取不到返回 '' */
function extractBodyAfterMarker(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const open = source.indexOf('{', start);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return '';
}

// ============================================
// Given
// ============================================
steps.given('the annotation UX source files', function() {
  if (!fs.existsSync(MAIN_JS)) throw new Error(`缺少前端主文件: ${MAIN_JS}`);
  if (!fs.existsSync(MAIN_CSS)) throw new Error(`缺少样式文件: ${MAIN_CSS}`);
  this.mainSrc = fs.readFileSync(MAIN_JS, 'utf-8');
  this.cssSrc = fs.readFileSync(MAIN_CSS, 'utf-8');
});

// ============================================
// Then: 场景一 —— 输入框就近 + 预填 + 多行保存
// ============================================
steps.then('the annotate button should not use the native prompt dialog', function() {
  if (this.mainSrc.includes('prompt(')) {
    throw new Error('批注输入仍在使用原生 prompt()，应改为划线附近的内联浮层');
  }
});

steps.then('the note editor should be positioned near the annotated highlight', function() {
  const body = extractBodyAfterMarker(this.mainSrc, 'function openAnnotationNoteEditor(');
  if (!body) throw new Error('缺少 openAnnotationNoteEditor 函数（批注输入浮层）');
  if (!body.includes('getBoundingClientRect')) {
    throw new Error('openAnnotationNoteEditor 未基于划线元素 getBoundingClientRect 定位');
  }
  if (!body.includes('data-annotation-id')) {
    throw new Error('openAnnotationNoteEditor 未通过 data-annotation-id 找到划线元素');
  }
});

steps.then('the note editor should be clamped inside the viewport', function() {
  const body = extractBodyAfterMarker(this.mainSrc, 'function openAnnotationNoteEditor(');
  if (!body.includes('window.innerWidth') || !body.includes('window.innerHeight')) {
    throw new Error('openAnnotationNoteEditor 缺少视口边界 clamp（innerWidth/innerHeight）');
  }
});

steps.then('the note editor should prefill the existing note and support multiline save', function() {
  const openBody = extractBodyAfterMarker(this.mainSrc, 'function openAnnotationNoteEditor(');
  if (!openBody.includes('dataset.note')) {
    throw new Error('打开编辑器时未从 dataset.note 预填已有备注');
  }
  const ensureBody = extractBodyAfterMarker(this.mainSrc, 'function ensureAnnotationNoteEditor(');
  if (!ensureBody.includes('textarea')) {
    throw new Error('批注编辑器应使用 textarea 支持多行输入');
  }
  if (!/ctrlKey\s*&&\s*e\.key\s*===\s*'Enter'/.test(ensureBody)) {
    throw new Error('缺少 Ctrl+Enter 保存快捷键');
  }
  if (!ensureBody.includes("'Escape'")) {
    throw new Error('缺少 Esc 取消快捷键');
  }
});

// ============================================
// Then: 场景二 —— 保存后标志 + hover 可读
// ============================================
steps.then('saving a note should mark only the last wrapper with the note indicator', function() {
  const body = extractBodyAfterMarker(this.mainSrc, 'function updateNoteMarker(');
  if (!body) throw new Error('缺少 updateNoteMarker 函数（备注标志维护）');
  if (!body.includes('has-note')) throw new Error('updateNoteMarker 未操作 has-note 标志 class');
  // 必须先清所有 wrapper 再加最后一个，否则跨段划线会重复标/残留旧标
  if (!body.includes('classList.remove')) {
    throw new Error('updateNoteMarker 未先清除所有 wrapper 的 has-note');
  }
  if (!/wrappers\[\s*wrappers\.length\s*-\s*1\s*\]/.test(body)) {
    throw new Error('updateNoteMarker 应只给最后一个 wrapper 加 has-note（跨段划线只标一次）');
  }
});

steps.then('the stylesheet should render the note indicator on marked annotations', function() {
  if (!/\.annotation-highlight\.has-note::after/.test(this.cssSrc)) {
    throw new Error('main.css 缺少 .annotation-highlight.has-note::after 规则');
  }
  if (!/\.annotation-underline\.has-note::after/.test(this.cssSrc)) {
    throw new Error('main.css 缺少 .annotation-underline.has-note::after 规则');
  }
  const markerRule = extractBodyAfterMarker(this.cssSrc, '.annotation-highlight.has-note::after');
  if (!markerRule.includes('💬')) {
    throw new Error('has-note 标志应为 💬 图标（content 属性）');
  }
});

steps.then('hovering an annotated highlight should reveal its note near the highlight', function() {
  const tipBody = extractBodyAfterMarker(this.mainSrc, 'function ensureAnnotationTooltip(');
  if (!tipBody) throw new Error('缺少 ensureAnnotationTooltip（hover 备注展示）');
  if (!tipBody.includes('dataset.note')) {
    throw new Error('tooltip 未从 dataset.note 读取备注内容');
  }
  if (!tipBody.includes('mouseenter')) {
    throw new Error('tooltip 缺少 mouseenter 悬停触发');
  }
  // 定位防溢出：上下择位 + 左右 clamp
  if (!tipBody.includes('window.innerHeight')) {
    throw new Error('tooltip 定位缺少上下择位（下方空间不足放上方）');
  }
  if (!tipBody.includes('window.innerWidth')) {
    throw new Error('tooltip 定位缺少左右视口 clamp');
  }
});

// ============================================
// Then: 场景三 —— 清空消失 + 恢复重建
// ============================================
steps.then('clearing the note should remove the note indicator from all wrappers', function() {
  const body = extractBodyAfterMarker(this.mainSrc, 'function updateNoteMarker(');
  // 空备注不应加标志：add 必须挂在 note 非空的条件分支里
  if (!/if\s*\(\s*note\s*\)/.test(body)) {
    throw new Error('updateNoteMarker 缺少数 note 非空判断——空备注会残留 💬 标志');
  }
});

steps.then('restoring annotations should rebuild note markers from persisted notes', function() {
  const body = extractBodyAfterMarker(this.mainSrc, 'async function applyAnnotations(');
  if (!body) throw new Error('缺少 applyAnnotations 函数');
  if (!body.includes('updateNoteMarker(')) {
    throw new Error('applyAnnotations 恢复批注后未重建 💬 标志（重开文件标志会丢）');
  }
});

// ============================================
// Then: 场景四 —— 追加模式
// ============================================
steps.then('the note editor should show the existing note read-only when present', function() {
  const ensureBody = extractBodyAfterMarker(this.mainSrc, 'function ensureAnnotationNoteEditor(');
  if (!ensureBody.includes('note-editor-existing')) {
    throw new Error('批注编辑器缺少旧备注只读展示区（.note-editor-existing）');
  }
  const openBody = extractBodyAfterMarker(this.mainSrc, 'function openAnnotationNoteEditor(');
  if (!/_mode\s*=\s*'append'/.test(openBody)) {
    throw new Error('已有备注时打开编辑器应进入 append 模式（_mode = append）');
  }
  if (!openBody.includes('note-editor-existing')) {
    throw new Error('openAnnotationNoteEditor 未在有旧备注时展示只读区');
  }
});

steps.then('saving in append mode should concatenate old note and new input with a date separator', function() {
  const saveBody = extractBodyAfterMarker(this.mainSrc, 'async function saveAnnotationNote(');
  if (!saveBody) throw new Error('缺少 saveAnnotationNote 函数');
  if (!saveBody.includes("'append'")) {
    throw new Error('saveAnnotationNote 未区分 append 模式');
  }
  if (!/existingNote\s*\+/.test(saveBody)) {
    throw new Error('append 保存未拼接旧备注与新输入');
  }
  if (!saveBody.includes('追加')) {
    throw new Error('append 拼接缺少日期分隔标记（追加）');
  }
});

steps.then('an edit toggle should allow switching back to full editing', function() {
  const ensureBody = extractBodyAfterMarker(this.mainSrc, 'function ensureAnnotationNoteEditor(');
  if (!ensureBody.includes('data-action="edit"')) {
    throw new Error('批注编辑器缺少「编辑」切换按钮（data-action="edit"）');
  }
});

// ============================================
// Then: 场景五 —— 编辑器内点击不丢批注（实机回归）
// ============================================
steps.then('global mouse handlers should ignore clicks inside the note editor', function() {
  const body = extractBodyAfterMarker(this.mainSrc, 'function initTranslation(');
  if (!body) throw new Error('缺少 initTranslation 函数');
  // 全局 mouseup/mousedown 会把编辑器内的点击误判为「点击外部」→ hideSelectionToolbar()
  // 清空 lastAnnotationId → 保存被静默丢弃。两个处理器都必须对编辑器豁免。
  const guards = body.match(/annotationNoteEditor\s*&&\s*annotationNoteEditor\.contains\(e\.target\)/g) || [];
  if (guards.length < 2) {
    throw new Error(
      `initTranslation 的 mouseup/mousedown 缺少批注编辑器豁免守卫（找到 ${guards.length} 处，需 2 处）` +
      '——点击编辑器会触发 hideSelectionToolbar 清空 lastAnnotationId，保存被静默丢弃'
    );
  }
});

steps.then('saving should use the annotation id captured when the editor opened', function() {
  const openBody = extractBodyAfterMarker(this.mainSrc, 'function openAnnotationNoteEditor(');
  if (!/\._annotationId\s*=\s*annotationId/.test(openBody)) {
    throw new Error('打开编辑器时未把 annotationId 固化到编辑器（_annotationId）——依赖易变的 lastAnnotationId');
  }
  const saveBody = extractBodyAfterMarker(this.mainSrc, 'async function saveAnnotationNote(');
  if (!saveBody.includes('_annotationId')) {
    throw new Error('saveAnnotationNote 未使用打开时固化的 _annotationId');
  }
});

// ============================================
// Then: 场景六 —— 一步标注
// ============================================
steps.then('the annotate button should create a highlight on the fly when none exists', function() {
  const body = extractBodyAfterMarker(this.mainSrc, "querySelector('#annotateBtn')");
  if (!body) throw new Error('缺少 annotateBtn 点击处理器');
  if (!body.includes('highlightRange(') || !body.includes('add_annotation')) {
    throw new Error('annotateBtn 缺少一步标注路径——选中文字直接点 💬 时应自动划线（highlightRange + add_annotation）');
  }
});

// ============================================
// Then: 场景七 —— 条目单元格渲染
// ============================================
steps.then('notes should be rendered as separate entry cells instead of one raw text blob', function() {
  const renderBody = extractBodyAfterMarker(this.mainSrc, 'function renderNoteEntries(');
  if (!renderBody) throw new Error('缺少 renderNoteEntries 函数（批注条目单元格渲染）');
  if (!renderBody.includes('追加')) {
    throw new Error('renderNoteEntries 未按「—— MM-DD 追加 ——」分隔符拆分条目');
  }
  if (!renderBody.includes('note-entry')) {
    throw new Error('renderNoteEntries 未生成 .note-entry 单元格元素');
  }
  const tipBody = extractBodyAfterMarker(this.mainSrc, 'function ensureAnnotationTooltip(');
  if (!tipBody.includes('renderNoteEntries(')) {
    throw new Error('hover tooltip 未使用 renderNoteEntries——整段文本会塌成一行');
  }
  if (tipBody.includes('.textContent = note')) {
    throw new Error('hover tooltip 仍在用 textContent 渲染整段备注（换行会被 HTML 折叠）');
  }
  const openBody = extractBodyAfterMarker(this.mainSrc, 'function openAnnotationNoteEditor(');
  if (!openBody.includes('renderNoteEntries(')) {
    throw new Error('编辑器旧备注只读区未使用 renderNoteEntries 单元格渲染');
  }
});

steps.then('the stylesheet should style note entries as stacked cells with date badges', function() {
  if (!/\.note-entry\b/.test(this.cssSrc)) {
    throw new Error('main.css 缺少 .note-entry 单元格样式');
  }
  if (!/\.note-entry-date\b/.test(this.cssSrc)) {
    throw new Error('main.css 缺少 .note-entry-date 日期角标样式');
  }
  if (!/\.note-entry-text\b/.test(this.cssSrc)) {
    throw new Error('main.css 缺少 .note-entry-text 样式（需 pre-wrap 保留条目内换行）');
  }
});

// ============================================
// Then: 场景八 —— 跨行划线不包空白节点
// ============================================
steps.then('multi-block highlighting should skip whitespace-only text nodes', function() {
  const body = extractBodyAfterMarker(this.mainSrc, 'function highlightRange(');
  if (!body) throw new Error('缺少 highlightRange 函数');
  if (!/textNode\.textContent\.trim\(\)/.test(body)) {
    throw new Error('highlightRange 跨块包裹未跳过纯空白文本节点——换行处会留下高亮残片');
  }
});

module.exports = steps;
