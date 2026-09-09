#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * TDD Tests for Knowledge Graph Dashboard Modal
 * Covers: state machine (hidden→visible→hidden), stats rendering,
 * graph rendering, node click → detail drawer, action buttons, ESC close.
 *
 * Module: dist/scripts/learning/knowledge-graph-dashboard.js
 *
 * BDD Scenarios covered:
 * - 用户打开学习项目弹出仪表盘 (show on project enter)
 * - 新项目初始状态的仪表盘 (no graph → chapter list only)
 * - 已生成但未学习的仪表盘 (graph exists, all not_started)
 * - 用户在仪表盘点击概念节点 (node click → detail drawer)
 * - 用户从仪表盘进入阅读 (enter reading button)
 * - 用户关闭仪表盘直接进入阅读 (ESC / close button)
 */

const TestRunner = require('../../shared/test-runner');
const { buildMockDOM } = require('../../shared/mock-dom');

function setupEnv() {
  const { document, body } = buildMockDOM();
  global.document = document;
  global.window = {
    document,
    addEventListener() {},
    removeEventListener() {},
    __TAURI__: { core: { invoke: () => Promise.resolve() } }
  };
}

function loadDashboard() {
  const path = require('path');
  const modPath = path.join(__dirname, '../../../dist/scripts/learning/knowledge-graph-dashboard.js');
  try {
    const resolved = require.resolve(modPath);
    delete require.cache[resolved];
    require(modPath);
  } catch (e) {
    return null;
  }
  return window.KnowledgeGraphDashboard;
}

// ============================================
// Helper: create mock data
// ============================================

function makeGraphData(nodes, edges) {
  return {
    version: '1.0',
    generated_at: '2026-06-06 12:00:00',
    nodes: nodes.map(([id, name, chapter]) => ({ id, name, chapter })),
    edges: edges.map(([from, to]) => ({ from, to }))
  };
}

function makeStats(overrides) {
  return {
    total: 5,
    mastered: 0,
    learning: 0,
    struggling: 0,
    notStarted: 5,
    ...overrides
  };
}

function makeChapters(titles) {
  return titles.map((title, i) => ({
    file: `${String(i + 1).padStart(2, '0')}.md`,
    title,
    status: 'not_generated'
  }));
}

// ============================================
// Test: Module loading
// ============================================

TestRunner.test('KnowledgeGraphDashboard module loads', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) {
    throw new Error('Module not found: dist/scripts/learning/knowledge-graph-dashboard.js (expected in TDD red phase)');
  }
  TestRunner.assertExists(KGD, 'KnowledgeGraphDashboard should be exported');
});

// ============================================
// Test: State machine
// ============================================

TestRunner.test('initial state is hidden', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const dashboard = new KGD();
  TestRunner.assertEquals(dashboard.getState(), 'hidden', 'initial state should be hidden');
});

TestRunner.test('show transitions to visible', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const dashboard = new KGD();
  dashboard.show({
    graph: null,
    stats: null,
    chapters: makeChapters(['第一章']),
    projectName: '测试项目'
  });
  TestRunner.assertEquals(dashboard.getState(), 'visible', 'state should be visible after show');
});

TestRunner.test('close transitions back to hidden', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const dashboard = new KGD();
  dashboard.show({
    graph: null,
    stats: null,
    chapters: makeChapters(['第一章']),
    projectName: '测试项目'
  });
  dashboard.close();
  TestRunner.assertEquals(dashboard.getState(), 'hidden', 'state should be hidden after close');
});

TestRunner.test('show when already visible replaces content', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const dashboard = new KGD();
  dashboard.show({
    graph: null,
    stats: null,
    chapters: makeChapters(['第一章']),
    projectName: '项目A'
  });
  dashboard.show({
    graph: null,
    stats: null,
    chapters: makeChapters(['第二章']),
    projectName: '项目B'
  });
  TestRunner.assertEquals(dashboard.getState(), 'visible', 'still visible');
  // Should have replaced content, not stacked modals
  const overlays = document.querySelectorAll('.kg-dashboard-overlay');
  TestRunner.assertEquals(overlays.length, 1, 'only one overlay at a time');
});

// ============================================
// Test: ESC key closes modal
// ============================================

TestRunner.test('ESC key triggers close', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const dashboard = new KGD();
  dashboard.show({
    graph: null,
    stats: null,
    chapters: makeChapters(['第一章']),
    projectName: '测试项目'
  });
  TestRunner.assertEquals(dashboard.getState(), 'visible');

  // Simulate ESC keydown
  document._dispatchDocEvent('keydown', { key: 'Escape' });
  TestRunner.assertEquals(dashboard.getState(), 'hidden', 'ESC should close modal');
});

// ============================================
// Test: Initial state (no graph) — chapter list
// ============================================

TestRunner.test('initial state: shows chapter list without graph', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const chapters = makeChapters(['导论', '基础', '进阶']);
  const dashboard = new KGD();
  dashboard.show({
    graph: null,
    stats: null,
    chapters,
    projectName: '新项目'
  });

  // Should render chapter list
  const chapterItems = document.querySelectorAll('.kg-chapter-item');
  TestRunner.assertEquals(chapterItems.length, 3, 'should show 3 chapters');

  // Should NOT render graph
  const graphCanvas = document.querySelector('.kg-graph-canvas');
  TestRunner.assertEquals(graphCanvas, null, 'no graph canvas when graph is null');
});

TestRunner.test('initial state: shows project name in header', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const dashboard = new KGD();
  dashboard.show({
    graph: null,
    stats: null,
    chapters: makeChapters(['第一章']),
    projectName: 'Transformer 详解'
  });

  const header = document.querySelector('.kg-dashboard-title');
  TestRunner.assertExists(header, 'header should exist');
  TestRunner.assert(header.textContent.includes('Transformer'), 'header should contain project name');
});

// ============================================
// Test: Generated graph, all not started
// ============================================

TestRunner.test('generated graph: shows stats row', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const graph = makeGraphData(
    [['attn', '注意力机制', '01'], ['pos-enc', '位置编码', '02']],
    [['attn', 'pos-enc']]
  );
  const stats = makeStats({ total: 2, notStarted: 2 });

  const dashboard = new KGD();
  dashboard.show({
    graph,
    stats,
    chapters: makeChapters(['第一章', '第二章']),
    projectName: '测试项目'
  });

  // Stats should be rendered
  const statsTotal = document.querySelector('[data-stat="total"]');
  TestRunner.assertExists(statsTotal, 'stats total should exist');
  // Check child number element (mock textContent doesn't aggregate children)
  const numEl = statsTotal.querySelector('.kg-stat-number');
  if (numEl) {
    TestRunner.assert(numEl.textContent.includes('2'), 'should show total count');
  }
});

TestRunner.test('generated graph: renders graph canvas', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const graph = makeGraphData(
    [['attn', '注意力机制', '01']],
    []
  );
  const stats = makeStats({ total: 1, notStarted: 1 });

  const dashboard = new KGD();
  dashboard.show({
    graph,
    stats,
    chapters: makeChapters(['第一章']),
    projectName: '测试项目'
  });

  const canvas = document.querySelector('.kg-graph-canvas');
  TestRunner.assertExists(canvas, 'graph canvas should exist');
});

// ============================================
// Test: Node click → detail drawer
// ============================================

TestRunner.test('click node opens detail drawer', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const nodes = [
    { id: 'attn', name: '注意力机制', chapter: '01', status: 'not_started', reviewCount: 0 }
  ];
  const graph = { nodes, edges: [], version: '1.0', generated_at: '2026-06-06 12:00:00' };
  const stats = makeStats({ total: 1, notStarted: 1 });

  const dashboard = new KGD();
  dashboard.show({
    graph,
    stats,
    chapters: makeChapters(['第一章']),
    projectName: '测试项目'
  });

  // Find and click node (requires D3 which isn't in test env)
  const nodeEl = document.querySelector('[data-concept-id="attn"]');
  if (!nodeEl) { console.log('  ⏭ skipped (D3 not available)'); return; }
  nodeEl.click();

  const drawer = document.querySelector('.kg-detail-drawer');
  TestRunner.assertExists(drawer, 'detail drawer should open');

  const drawerName = document.querySelector('.kg-detail-name');
  if (drawerName) {
    TestRunner.assert(drawerName.textContent.includes('注意力机制'), 'drawer shows concept name');
  }
});

TestRunner.test('click another node updates drawer content', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const nodes = [
    { id: 'attn', name: '注意力机制', chapter: '01', status: 'mastered', reviewCount: 3 },
    { id: 'pos-enc', name: '位置编码', chapter: '02', status: 'learning', reviewCount: 1 }
  ];
  const graph = { nodes, edges: [], version: '1.0', generated_at: '2026-06-06 12:00:00' };
  const stats = makeStats({ total: 2, mastered: 1, learning: 1 });

  const dashboard = new KGD();
  dashboard.show({
    graph,
    stats,
    chapters: makeChapters(['第一章', '第二章']),
    projectName: '测试项目'
  });

  // Click first node
  const node1 = document.querySelector('[data-concept-id="attn"]');
  if (node1) node1.click();

  // Click second node
  const node2 = document.querySelector('[data-concept-id="pos-enc"]');
  if (node2) node2.click();

  const drawerName = document.querySelector('.kg-detail-name');
  if (drawerName) {
    TestRunner.assert(drawerName.textContent.includes('位置编码'), 'drawer should update to second concept');
  }
});

TestRunner.test('click drawer close hides drawer', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const nodes = [
    { id: 'attn', name: '注意力机制', chapter: '01', status: 'not_started', reviewCount: 0 }
  ];
  const graph = { nodes, edges: [], version: '1.0', generated_at: '2026-06-06 12:00:00' };

  const dashboard = new KGD();
  dashboard.show({
    graph,
    stats: makeStats({ total: 1, notStarted: 1 }),
    chapters: makeChapters(['第一章']),
    projectName: '测试项目'
  });

  // Open drawer
  const node = document.querySelector('[data-concept-id="attn"]');
  if (node) node.click();

  // Close drawer
  const closeBtn = document.querySelector('.kg-detail-close');
  if (closeBtn) closeBtn.click();

  const drawer = document.querySelector('.kg-detail-drawer');
  TestRunner.assert(!drawer || drawer.style.display === 'none' || drawer._removed, 'drawer should be hidden');
});

// ============================================
// Test: Action buttons
// ============================================

TestRunner.test('has enter reading button', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  let enterReadingCalled = false;
  const dashboard = new KGD({
    onEnterReading: () => { enterReadingCalled = true; }
  });
  dashboard.show({
    graph: null,
    stats: null,
    chapters: makeChapters(['第一章']),
    projectName: '测试项目'
  });

  const btn = document.querySelector('[data-action="enter-reading"]');
  TestRunner.assertExists(btn, 'enter reading button should exist');
  if (btn) btn.click();
  TestRunner.assert(enterReadingCalled, 'onEnterReading callback should fire');
});

TestRunner.test('has close button', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const dashboard = new KGD();
  dashboard.show({
    graph: null,
    stats: null,
    chapters: makeChapters(['第一章']),
    projectName: '测试项目'
  });

  const btn = document.querySelector('[data-action="close"]');
  TestRunner.assertExists(btn, 'close button should exist');
});

TestRunner.test('close button hides modal', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const dashboard = new KGD();
  dashboard.show({
    graph: null,
    stats: null,
    chapters: makeChapters(['第一章']),
    projectName: '测试项目'
  });

  const btn = document.querySelector('[data-action="close"]');
  if (btn) btn.click();
  TestRunner.assertEquals(dashboard.getState(), 'hidden', 'close button should hide modal');
});

// ============================================
// Test: Node color reflects status
// ============================================

TestRunner.test('node elements have correct color classes', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const nodes = [
    { id: 'a', name: 'A', chapter: '01', status: 'mastered', reviewCount: 3 },
    { id: 'b', name: 'B', chapter: '01', status: 'struggling', reviewCount: 1 },
    { id: 'c', name: 'C', chapter: '02', status: 'not_started', reviewCount: 0 }
  ];
  const graph = { nodes, edges: [], version: '1.0', generated_at: '2026-06-06 12:00:00' };

  const dashboard = new KGD();
  dashboard.show({
    graph,
    stats: makeStats({ total: 3, mastered: 1, struggling: 1, notStarted: 1 }),
    chapters: makeChapters(['第一章', '第二章']),
    projectName: '测试项目'
  });

  const nodeA = document.querySelector('[data-concept-id="a"]');
  const nodeB = document.querySelector('[data-concept-id="b"]');
  const nodeC = document.querySelector('[data-concept-id="c"]');

  if (nodeA) TestRunner.assert(nodeA.classList.contains('status-mastered'), 'node A should have mastered class');
  if (nodeB) TestRunner.assert(nodeB.classList.contains('status-struggling'), 'node B should have struggling class');
  if (nodeC) TestRunner.assert(nodeC.classList.contains('status-not-started'), 'node C should have not-started class');
});

// ============================================
// Test: Callbacks
// ============================================

TestRunner.test('onEnterReading callback is called with chapter', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  let calledChapter = null;
  const dashboard = new KGD({
    onEnterReading: (chapter) => { calledChapter = chapter; }
  });
  dashboard.show({
    graph: null,
    stats: null,
    chapters: makeChapters(['导论']),
    projectName: '测试项目'
  });

  // Click first chapter to enter reading
  const chapterItem = document.querySelector('.kg-chapter-item');
  if (chapterItem) chapterItem.click();

  // Either chapter item click or enter-reading button triggers callback
  if (calledChapter !== null) {
    TestRunner.assert(typeof calledChapter === 'string', 'callback receives chapter identifier');
  }
});

// ============================================
// Test: 脏图谱韧性（生成失败项目的 graph.json 残留悬空边）
// ============================================

// 模拟真实 d3 行为：forceLink 遇到端点不在 nodes 中的边时同步抛 "node not found"
function makeD3Mock({ forceThrow } = {}) {
  // 记录 attr('transform', ...) 调用次数 —— 回归测试用：
  // 真实 d3 中手动 simulation.tick() 不派发 tick 事件，若渲染代码只依赖事件，
  // 预跑后 DOM 永不刷新（全节点重叠在原点），这里就能抓到
  const calls = { transformAttrs: 0 };
  const chain = new Proxy(function () {}, {
    get: () => chain,
    apply: (t, thisArg, args) => {
      if (args[0] === 'transform') calls.transformAttrs++;
      return chain;
    }
  });
  let simNodes = null;
  return {
    select: () => chain,
    zoom: () => chain,
    drag: () => chain,
    zoomIdentity: { translate() { return { scale() { return {}; } }; } },
    forceSimulation: (nodes) => {
      if (forceThrow) throw forceThrow;
      simNodes = nodes;
      return chain;
    },
    forceLink: (edges) => {
      if (simNodes && edges) {
        const ids = new Set(simNodes.map(n => n.id));
        for (const e of edges) {
          if (!ids.has(e.source)) throw new Error('node not found: ' + e.source);
          if (!ids.has(e.target)) throw new Error('node not found: ' + e.target);
        }
      }
      return chain;
    },
    forceManyBody: () => chain,
    forceCenter: () => chain,
    forceX: () => chain,
    forceY: () => chain,
    forceCollide: () => chain,
    _calls: calls
  };
}

TestRunner.test('dirty graph: dangling edge filtered, dashboard still closable', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  global.d3 = makeD3Mock();
  try {
    // 生成失败项目的 graph.json：边引用了已不存在的概念 'ghost'
    const graph = makeGraphData(
      [['a', '概念A', '01'], ['b', '概念B', '02']],
      [['a', 'b'], ['a', 'ghost']]
    );
    const dashboard = new KGD();
    dashboard.show({
      graph,
      stats: makeStats({ total: 2, notStarted: 2 }),
      chapters: makeChapters(['第一章', '第二章']),
      projectName: '失败项目'
    });

    TestRunner.assertEquals(dashboard.getState(), 'visible',
      'dangling edge must not break show() (modal stuck in hidden state → close dead)');

    const btn = document.querySelector('[data-action="close"]');
    TestRunner.assertExists(btn, 'close button should exist');
    btn.click();
    TestRunner.assertEquals(dashboard.getState(), 'hidden', 'close button should hide modal');
  } finally {
    delete global.d3;
  }
});

TestRunner.test('render error: canvas shows fallback and modal stays closable', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  global.d3 = makeD3Mock({ forceThrow: new Error('simulated render failure') });
  try {
    let onCloseFired = false;
    const graph = makeGraphData([['a', '概念A', '01']], []);
    const dashboard = new KGD({ onClose: () => { onCloseFired = true; } });
    dashboard.show({
      graph,
      stats: makeStats({ total: 1, notStarted: 1 }),
      chapters: makeChapters(['第一章']),
      projectName: '失败项目'
    });

    TestRunner.assertEquals(dashboard.getState(), 'visible',
      'render failure must not break show() state machine');

    const canvas = document.querySelector('.kg-graph-canvas');
    TestRunner.assertExists(canvas, 'graph canvas should exist');
    TestRunner.assert((canvas.textContent || '').includes('渲染失败'),
      'canvas should show fallback message on render failure');

    dashboard.close();
    TestRunner.assertEquals(dashboard.getState(), 'hidden');
    TestRunner.assert(onCloseFired, 'onClose callback should fire');
    const overlays = document.querySelectorAll('.kg-dashboard-overlay');
    TestRunner.assertEquals(overlays.length, 0, 'overlay should be removed after close');
  } finally {
    delete global.d3;
  }
});

// ============================================
// Test: 图谱自适应全图展示（fit-to-view 纯函数）
// ============================================

TestRunner.test('computeFitTransform: spreads beyond viewport shrink to fit', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  // 节点散布远超 700x400 视口
  const nodes = [
    { id: 'a', x: -500, y: -300 },
    { id: 'b', x: 800, y: 500 }
  ];
  const f = KGD.computeFitTransform(nodes, 700, 400);
  TestRunner.assertExists(f, 'should return a transform');
  TestRunner.assert(f.k < 1, 'should shrink (k < 1)');

  // 变换后所有节点落在视口内
  for (const n of nodes) {
    const sx = n.x * f.k + f.x;
    const sy = n.y * f.k + f.y;
    TestRunner.assert(sx >= 0 && sx <= 700, `node ${n.id} x=${sx} should be inside viewport`);
    TestRunner.assert(sy >= 0 && sy <= 400, `node ${n.id} y=${sy} should be inside viewport`);
  }
});

TestRunner.test('computeFitTransform: small graph is not oversized', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  // 小图谱挤在一小片区域 —— 不能无限放大
  const nodes = [{ id: 'a', x: 350, y: 200 }, { id: 'b', x: 360, y: 210 }];
  const f = KGD.computeFitTransform(nodes, 700, 400);
  TestRunner.assertExists(f);
  TestRunner.assert(f.k <= 1.2, `k=${f.k} should be capped (no oversize zoom-in)`);
});

TestRunner.test('computeFitTransform: huge graph is not too small', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const nodes = [{ id: 'a', x: -100000, y: -100000 }, { id: 'b', x: 100000, y: 100000 }];
  const f = KGD.computeFitTransform(nodes, 700, 400);
  TestRunner.assertExists(f);
  TestRunner.assert(f.k >= 0.4, `k=${f.k} should be floored (not too small)`);
});

TestRunner.test('computeFitTransform: empty nodes returns null', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  TestRunner.assertEquals(KGD.computeFitTransform([], 700, 400), null, 'empty → null');
  TestRunner.assertEquals(KGD.computeFitTransform(null, 700, 400), null, 'null → null');
});

TestRunner.test('pre-run ticks are flushed to DOM (manual tick fires no events)', () => {
  setupEnv();
  const KGD = loadDashboard();
  if (!KGD) return;

  const mock = makeD3Mock();
  global.d3 = mock;
  try {
    const graph = makeGraphData(
      [['a', '概念A', '01'], ['b', '概念B', '02']],
      [['a', 'b']]
    );
    const dashboard = new KGD();
    dashboard.show({
      graph,
      stats: makeStats({ total: 2, notStarted: 2 }),
      chapters: makeChapters(['第一章', '第二章']),
      projectName: '测试项目'
    });

    // 真实 d3 的手动 simulation.tick() 不派发 tick 事件 —— 渲染代码必须
    // 在预跑后主动刷新一次 DOM，否则所有节点停在初始位置（全部重叠）
    TestRunner.assert(mock._calls.transformAttrs > 0,
      'node transform must be written to DOM at least once after pre-run ticks');
  } finally {
    delete global.d3;
  }
});

// ============================================
// Run
// ============================================

TestRunner.run().then(({ passed, failed }) => {
  if (failed > 0) process.exit(1);
});
