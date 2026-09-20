#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 附加题弹窗——题干所指对象的同屏渲染
 *
 * 事故背景：附加题的题干常常指代该 cue 的划选原文（「关于这段…查询」），
 * 但弹窗里只有题干和选项，没有章节正文。指代对象不在屏幕上，题目无法作答。
 * 修法：后端把划选内容随题带出（QuizQuestion.context），前端渲染在题干上方。
 *
 * 本文件锁住前端这一半，走真实链路：真实 mode-integration.js + 真实 quiz-shuffle.js
 * + mock DOM，从构造题库面板一路点到弹窗渲染完成——
 * 覆盖「选项 shuffle 后 context 仍在」「多行按代码块呈现」「转义」「无 context 不渲染」。
 *
 * Run: node tests/sprint3/unit/test_extra_quiz_context_dom.js
 */

const path = require('path');
const TestRunner = require('../../shared/test-runner');
const { buildMockDOM } = require('../../shared/mock-dom');

const QuizShuffle = require('../../../dist/scripts/quiz-shuffle.js');

const MARKER = 'border-left:3px solid #c4b5fd';

function MockQuizPanel(opts) {
  this._chapterFile = opts.chapterFile;
}
MockQuizPanel.prototype.notifyScrollProgress = function () {};

// ============================================
// Environment
// ============================================

let mockInvoke;

function setupEnv(extraQuestions) {
  const dom = buildMockDOM();
  mockInvoke = (cmd) => Promise.resolve(cmd === 'load_extra_questions' ? extraQuestions : null);

  global.document = dom.document;
  global.window = {
    document: dom.document,
    AppWorkspace: { isIn: () => true },
    QuizPanel: MockQuizPanel,
    QuizShuffle,
    LearningProgress: {},
    __TAURI__: { core: { invoke: mockInvoke } },
    showToast: () => {},
    addEventListener() {},
    removeEventListener() {},
    getSelection() { return { toString: () => '' }; }
  };

  const mdBody = dom.document.createElement('div');
  mdBody._attrs.id = 'markdownBody';
  dom.body.appendChild(mdBody);

  return dom;
}

function loadIntegration() {
  const miPath = path.join(__dirname, '../../../dist/scripts/learning/mode-integration.js');
  delete require.cache[require.resolve(miPath)];
  require(miPath);
  return window.LearningModeIntegration;
}

/** 让 click 处理器里的 await 链跑完 */
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/** 打开弹窗：真实按钮 + 真实 click 监听器 */
async function openModal(extraQuestions) {
  const dom = setupEnv(extraQuestions);
  const LMI = loadIntegration();
  LMI.setupQuizPanel('04-把金价数据灌进本体.md', 'C:/proj/ontology-gold-price');

  const btn = dom.document.getElementById('extraReviewBtn');
  TestRunner.assertExists(btn, '附加题按钮应已注入');

  btn.click();
  await flush();
  return dom;
}

/** 弹窗里所有已渲染的 HTML 片段 */
function renderedHtml(dom) {
  return dom.allElements.map((e) => e._innerHTML || '').join('\n');
}

function singleQuestion(context) {
  return [
    {
      id: 'extra_1',
      qtype: 'single',
      question: '关于下面这段两市金价配对的 SPARQL 查询，下列理解正确的是？',
      options: [
        { label: 'A', text: '把伦敦金价换算成人民币金价' },
        { label: 'B', text: '按日期对齐两个市场的报价' },
        { label: 'C', text: '按重量单位换算金价' },
        { label: 'D', text: '把两个市场的数据拼接成一条时间线' }
      ],
      correct: 'B',
      weak_concepts: ['SPARQL'],
      context
    }
  ];
}

// ============================================
// Tests
// ============================================

TestRunner.test('弹窗把题干指代的划选内容渲染在题干上方', async () => {
  const context = 'SELECT ?d ?usdPerOz ?cnyPerGram WHERE { ?l gp:hasMarket gp:LBMAMarket ; }';
  const dom = await openModal(singleQuestion(context));

  const modal = dom.document.getElementById('extraReviewModal');
  TestRunner.assertExists(modal, '弹窗应已挂载');

  const html = renderedHtml(dom);
  TestRunner.assert(html.includes(context), '弹窗里必须能看到题干所指的那段内容');
  TestRunner.assert(html.includes('关于下面这段两市金价配对'), '题干本身仍要渲染');
});

TestRunner.test('选项 shuffle 之后 context 仍随题走', async () => {
  const context = '?l gp:hasMarket gp:LBMAMarket ;';
  const dom = await openModal(singleQuestion(context));

  const html = renderedHtml(dom);
  // shuffle 会重建 options/correct；只要它顺手丢了 context，这里就抓得到。
  TestRunner.assert(html.includes(context), 'shuffle 重建题目对象时不得丢掉 context');
});

TestRunner.test('多行划选按代码块呈现，保留缩进与内部空格', async () => {
  const context = [
    'SELECT ?d ?cnyPerGram WHERE {',
    '  ?l gp:hasMarket       gp:LBMAMarket ;',
    '       gp:hasUnit        gp:Gram .',
    '}'
  ].join('\n');
  const dom = await openModal(singleQuestion(context));

  const html = renderedHtml(dom);
  TestRunner.assert(html.includes('ui-monospace'), '多行内容应按等宽代码块呈现');
  TestRunner.assert(
    html.includes('?l gp:hasMarket       gp:LBMAMarket'),
    '连续空格必须保留——CSS 靠 pre-wrap 撑住，但换行/缩进不能在渲染期被吃掉'
  );
});

TestRunner.test('划选内容里的 < > & 被转义', async () => {
  const context = 'FILTER(?usdPerOz > 2000 && ?cnyPerGram < 1000)';
  const dom = await openModal(singleQuestion(context));

  const html = renderedHtml(dom);
  TestRunner.assert(
    html.includes('?usdPerOz &gt; 2000 &amp;&amp; ?cnyPerGram &lt; 1000'),
    '划选内容来自用户，原样进 innerHTML 会破坏结构，必须转义'
  );
  TestRunner.assert(
    !html.includes('?usdPerOz > 2000 &&'),
    '不得出现未转义的原文'
  );
});

TestRunner.test('没有 context 的题（章节测验题）不渲染上下文块', async () => {
  const dom = await openModal(singleQuestion(undefined));

  const modal = dom.document.getElementById('extraReviewModal');
  TestRunner.assertExists(modal, '弹窗应已挂载');
  TestRunner.assert(
    !renderedHtml(dom).includes(MARKER),
    'context 为空时不该留一个空引用条'
  );
});

TestRunner.test('题干里没有指代时，上下文块照样只在有 context 时出现', async () => {
  const blank = singleQuestion('   \n  ');
  const dom = await openModal(blank);

  TestRunner.assertExists(dom.document.getElementById('extraReviewModal'), '纯空白 context 不应打断弹窗');
  TestRunner.assert(!renderedHtml(dom).includes(MARKER), '纯空白不应渲染成空块');
});

// ============================================

TestRunner.run();
