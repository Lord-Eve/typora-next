#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * BDD Acceptance Steps for LaTeX 兼容层（Sprint 25）
 *
 * 仿 sprint24 模式：直接读真实源码断言接线存在，缺失即 throw。
 *
 * 行为层（sanitize_latex 规则）由：
 * - cargo test --test latex_sanitize_test（crates/docx-export）
 * - node tests/sprint25/unit/test_latex_sanitize_katex.js（真实 KaTeX 渲染验收）
 * 覆盖。
 */

const fs = require('fs');
const path = require('path');
const { StepRegistry } = require('../shared/runner');

const steps = new StepRegistry();

const CRATE_SRC = path.join(__dirname, '../../src-tauri/crates/docx-export/src/lib.rs');
const CRATE_TESTS = path.join(__dirname, '../../src-tauri/crates/docx-export/tests');
const MAIN_LIB = path.join(__dirname, '../../src-tauri/src/lib.rs');
const JS_TEST = path.join(__dirname, '../sprint25/unit/test_latex_sanitize_katex.js');

function read(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`source file missing on disk: ${p}`);
  }
  return fs.readFileSync(p, 'utf-8');
}

function mustInclude(haystack, needle, what) {
  if (!haystack.includes(needle)) {
    throw new Error(`missing expected content: ${what} (${JSON.stringify(needle.slice(0, 60))})`);
  }
}

// ============================================
// Given
// ============================================

steps.given('the real docx-export crate source', function () {
  this.crateSrc = read(CRATE_SRC);
});

// ============================================
// Then — sanitize 规则与导出
// ============================================

steps.then('the crate should expose a public sanitize_latex function', function () {
  mustInclude(this.crateSrc, 'pub fn sanitize_latex', 'sanitize_latex 导出');
});

steps.then('sanitize_latex should cover all four spacing commands', function () {
  // 四类间距命令：\, \; \: \!（KaTeX 对 internal 类节点后裸上下标全部报错）
  mustInclude(this.crateSrc, '"\\\\,"', 'thin space \\,');
  mustInclude(this.crateSrc, '"\\\\;"', 'thick space \\;');
  mustInclude(this.crateSrc, '"\\\\:"', 'medium space \\:');
  mustInclude(this.crateSrc, '"\\\\!"', 'negative space \\!');
});

steps.then('sanitize_latex should handle both superscript and subscript', function () {
  // 规则必须同时命中 ^ 与 _（probe 实测两者同样炸）
  mustInclude(this.crateSrc, "'^'", 'superscript ^');
  mustInclude(this.crateSrc, "'_'", 'subscript _');
});

// ============================================
// Then — 提取链路接线
// ============================================

steps.then('extract_math_blocks should sanitize inline math content', function () {
  // 行内与块级公式共享 extract_math_blocks 出口；sanitize 必须在返回内容前调用
  const extractFn = this.crateSrc.split('pub fn extract_math_blocks')[1] || '';
  mustInclude(extractFn, 'sanitize_latex', 'extract_math_blocks 内调用 sanitize');
});

steps.then('extract_math_blocks should sanitize block math content', function () {
  const extractFn = this.crateSrc.split('pub fn extract_math_blocks')[1] || '';
  const blockArm = extractFn.split('MathBlock::Block')[1] || '';
  mustInclude(blockArm, 'sanitize_latex', 'Block 分支调用 sanitize');
  const inlineArm = extractFn.split('MathBlock::Inline')[1] || '';
  mustInclude(inlineArm, 'sanitize_latex', 'Inline 分支调用 sanitize');
});

steps.then('the main render path should share the same extraction', function () {
  // 主渲染（WebView/KaTeX）与 DOCX 导出共用 docx_export::preprocess_math
  const mainLib = read(MAIN_LIB);
  mustInclude(mainLib, 'docx_export::{', '主 lib 引用 docx_export crate');
  mustInclude(mainLib, 'preprocess_math', '主渲染链路使用 preprocess_math');
});

// ============================================
// Then — 测试资产
// ============================================

steps.then('the rust latex_sanitize test file should exist', function () {
  const p = path.join(CRATE_TESTS, 'latex_sanitize_test.rs');
  if (!fs.existsSync(p)) {
    throw new Error(`rust test file missing: ${p}`);
  }
});

steps.then('the JS KaTeX acceptance test file should exist', function () {
  if (!fs.existsSync(JS_TEST)) {
    throw new Error(`JS KaTeX acceptance test missing: ${JS_TEST}`);
  }
});

module.exports = steps;
