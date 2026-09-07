#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * KaTeX 验收测试 for LaTeX 兼容层（Sprint 25）
 *
 * 不重复实现 Rust sanitize 规则，而是验证「sanitize 的目标形态」
 * 能被真实 vendored KaTeX 无错渲染——规则本身的正确性由
 * crates/docx-export/tests/latex_sanitize_test.rs 覆盖。
 *
 * 若某天 KaTeX 升级改变了接受面，或规则输出形态漂移，这里会红。
 */

const TestRunner = require('../../shared/test-runner');
const path = require('path');

const katex = require(path.join(__dirname, '../../../dist/vendor/katex/katex.min.js'));

function renders(src, displayMode) {
  try {
    katex.renderToString(src, { displayMode, throwOnError: true });
    return null;
  } catch (e) {
    return e.message;
  }
}

// ============================================
// 红区：未 sanitize 的原始病灶必须仍然失败
// （证明测试在测量真东西，而不是永远绿）
// ============================================

TestRunner.test('原始病灶 \\,^ 在 KaTeX 中确实失败（对照组）', () => {
  const err = renders(String.raw`\mathrm{A \xrightarrow{\;100\,^\circ C} B}`, true);
  TestRunner.assert(err !== null, 'expected KaTeX to reject raw \\,^');
});

// ============================================
// 绿区：sanitize 目标形态全部可渲染
// ============================================

const SANITIZED_CASES = [
  ['块级：硅热还原（真实病灶）', String.raw`\mathrm{SiO_2 + 2C \xrightarrow{\;1800\sim2000\,{}^\circ\mathrm{C}\;} Si + 2CO \uparrow}`, true],
  ['块级：HCl 反应（真实病灶）', String.raw`\mathrm{Si + 3HCl \xrightarrow{\;\sim 300\,{}^\circ\mathrm{C},\; Cu\;} SiHCl_3 \uparrow + H_2 \uparrow}`, true],
  ['块级：西门子法（真实病灶）', String.raw`\mathrm{SiHCl_3(g) + H_2(g) \xrightarrow{\;\sim 1100\,{}^\circ\mathrm{C}\;} Si(s)\downarrow + 3HCl(g)}\qquad \Delta H > 0\;(\text{吸热})`, true],
  ['行内：温度标注', String.raw`1800\sim2000\,{}^\circ\mathrm{C}`, false],
  ['四类间距：thin', String.raw`a\,{}^b`, false],
  ['四类间距：thick + 下标', String.raw`a\;{}_i`, false],
  ['四类间距：medium', String.raw`a\:{}^2`, false],
  ['四类间距：negative', String.raw`a\!{}^b`, false],
  ['间距后留白再接上标', String.raw`a\,{} ^b`, false],
];

for (const [name, src, displayMode] of SANITIZED_CASES) {
  TestRunner.test(`sanitize 后可渲染：${name}`, () => {
    const err = renders(src, displayMode);
    TestRunner.assert(err === null, `KaTeX rejected sanitized form: ${err}`);
  });
}

// ============================================
// 不动区：本来就合法的公式保持可渲染
// （sanitize 是恒等映射的区域）
// ============================================

const UNTOUCHED_CASES = [
  ['普通上下标', String.raw`x^2 + y_1`],
  ['控制空格后上标', String.raw`a\ ^b`],
  ['已有空基元', String.raw`a\,{}^b`],
  ['间距后非上下标', String.raw`a\,b\;c`],
];

for (const [name, src] of UNTOUCHED_CASES) {
  TestRunner.test(`不受影响区仍可渲染：${name}`, () => {
    const err = renders(src, false);
    TestRunner.assert(err === null, `KaTeX rejected untouched form: ${err}`);
  });
}

(async () => {
  const { failed } = await TestRunner.run();
  process.exit(failed > 0 ? 1 : 0);
})();
