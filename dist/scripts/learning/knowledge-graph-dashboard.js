/**
 * Knowledge Graph Dashboard Modal
 * Shows project stats + concept dependency graph + action buttons.
 * Pops up every time user enters a learning project.
 *
 * 知识图谱仪表盘
 */

(function() {
  'use strict';

  if (typeof window === 'undefined') return;

  // Shared constants (from knowledge-graph-manager.js)

  const CONSTANTS = window.KNOWLEDGE_GRAPH_CONSTANTS || {};
  const STATUS_LABELS = CONSTANTS.STATUS_LABELS || {
    mastered: '已掌握', learning: '学习中', struggling: '困难', not_started: '未开始'
  };
  const STATUS_COLORS = CONSTANTS.STATUS_COLORS || {
    mastered: '#10b981', learning: '#f59e0b', struggling: '#ef4444', not_started: '#6b7280'
  };

  // 图谱自适应缩放上下限：小图谱不放大 oversize，大图谱不缩得过小
  const FIT_MIN_SCALE = 0.4;
  const FIT_MAX_SCALE = 1.2;
  const FIT_PADDING = 48;

  /**
   * 纯函数：按节点包围盒计算 fit-to-view 变换，使全图在任何屏幕上完整展示。
   * @param {Array} nodes - 已定位节点（需有数值 x/y）
   * @returns {{x: number, y: number, k: number} | null} 平移 + 缩放，无节点返回 null
   */
  function computeFitTransform(nodes, width, height) {
    const positioned = (nodes || []).filter(n => typeof n.x === 'number' && typeof n.y === 'number');
    if (!positioned.length) return null;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of positioned) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }

    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const k = Math.max(
      FIT_MIN_SCALE,
      Math.min((width - FIT_PADDING * 2) / w, (height - FIT_PADDING * 2) / h, FIT_MAX_SCALE)
    );
    return {
      x: width / 2 - ((minX + maxX) / 2) * k,
      y: height / 2 - ((minY + maxY) / 2) * k,
      k
    };
  }

  class KnowledgeGraphDashboard {
    constructor(options) {
      this.state = 'hidden';
      this.onEnterReading = (options && options.onEnterReading) || (() => {});
      this.onClose = (options && options.onClose) || (() => {});
      this.onReview = (options && options.onReview) || (() => {});
      this._overlay = null;
      this._drawer = null;
      this._data = null;
      this._escHandler = null;
    }

    getState() { return this.state; }

    /**
     * Show dashboard modal
     * @param {Object} data - { graph, stats, chapters, projectName }
     */
    show(data) {
      if (this.state === 'visible') {
        this.close();
      }
      this._data = data;
      try {
        this._createDOM(data);
      } catch (e) {
        // 清理已上屏的 overlay：state 尚未置 visible，不清理会留下
        // close() 无法移除的僵尸弹窗（close 在 hidden 态 early-return）
        this._removeDOM();
        throw e;
      }
      this.state = 'visible';
      this._bindESC();
    }

    close() {
      if (this.state === 'hidden') return;
      this._unbindESC();
      this._removeDOM();
      this.state = 'hidden';
      this.onClose();
    }

    // --- DOM construction ---

    _createDOM(data) {
      const overlay = document.createElement('div');
      overlay.className = 'kg-dashboard-overlay';

      const modal = document.createElement('div');
      modal.className = 'kg-dashboard-modal';

      // Header
      const header = this._createHeader(data.projectName, !!data.courseCompleted);
      modal.appendChild(header);

      // Stats row (only if graph exists)
      if (data.stats) {
        const stats = this._createStats(data.stats);
        modal.appendChild(stats);
      }

      // Content area: graph or chapter list
      // 图谱模式：modal 固定 88vh flex 列布局，canvas 吃掉剩余高度（一眼看完，无滚轮）
      let graphCanvas = null;
      if (data.graph) {
        modal.classList.add('kg-dashboard-modal--has-graph');
        graphCanvas = this._createGraphCanvas(data.graph);
        modal.appendChild(graphCanvas);
      } else if (data.chapters) {
        const list = this._createChapterList(data.chapters);
        modal.appendChild(list);
      }

      // 📍 下一站 roadmap（仅完结课程；卡片点击 → 关闭仪表盘并预填创建对话框）
      if (data.courseCompleted && data.projectPath && window.CourseRoadmap && window.__TAURI__) {
        const section = window.CourseRoadmap.createRoadmapSection({
          projectPath: data.projectPath,
          invoke: window.__TAURI__.core.invoke,
          onSelectDirection: (direction) => {
            this.close();
            if (window.LearningProject && window.LearningProject.openWithPrefill) {
              window.LearningProject.openWithPrefill(direction);
            }
          }
        });
        modal.appendChild(section);
        // roadmap 移到图谱左侧（下方挤压图谱且小屏截断）—— CSS grid 双列布局
        modal.classList.add('kg-dashboard-modal--has-roadmap');
      }

      // Action buttons
      const actions = this._createActions(data);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      this._overlay = overlay;

      // D3 渲染推迟到 DOM 插入后：此时 flex 布局已算出 canvas 真实宽高，
      // svg 按 clientHeight 绘制，图谱始终完整落在可视区域内
      if (graphCanvas && typeof d3 !== 'undefined') {
        try {
          this._renderD3Graph(graphCanvas, data.graph);
        } catch (e) {
          // 渲染失败（如脏 graph.json）不应卡死整个弹窗 —— 降级为提示文案
          console.warn('[KnowledgeGraphDashboard] graph render failed:', e);
          graphCanvas.textContent = '图谱渲染失败：' + (e.message || String(e));
        }
      }
    }

    _createHeader(projectName, courseCompleted) {
      const header = document.createElement('div');
      header.className = 'kg-dashboard-header';

      const title = document.createElement('h2');
      title.className = 'kg-dashboard-title';
      title.textContent = projectName || '学习项目';
      header.appendChild(title);

      // 课程完结终态标识（用户能感知当前所处状态）
      if (courseCompleted) {
        const badge = document.createElement('span');
        badge.className = 'kg-course-completed-badge';
        badge.textContent = '🎉 课程已完结';
        header.appendChild(badge);
      }

      return header;
    }

    _createStats(stats) {
      const row = document.createElement('div');
      row.className = 'kg-stats-row';

      const items = [
        { key: 'total', label: '总概念', value: stats.total, color: '#a3a0fb' },
        { key: 'mastered', label: '已掌握', value: stats.mastered, color: '#047857' },
        { key: 'learning', label: '学习中', value: stats.learning, color: '#b45309' },
        { key: 'struggling', label: '困难', value: stats.struggling, color: '#b91c1c' },
        { key: 'not-started', label: '未开始', value: stats.notStarted, color: '#7c3aed' }
      ];

      for (const item of items) {
        const el = document.createElement('div');
        el.className = 'kg-stat-item';
        el.setAttribute('data-stat', item.key);

        const num = document.createElement('span');
        num.className = 'kg-stat-number';
        num.textContent = String(item.value);
        num.style.color = item.color;
        num.style.textShadow = `0 0 20px ${item.color}33`;

        const label = document.createElement('span');
        label.className = 'kg-stat-label';
        label.textContent = item.label;

        el.appendChild(num);
        el.appendChild(label);
        row.appendChild(el);
      }

      return row;
    }

    _createGraphCanvas(graph) {
      const canvas = document.createElement('div');
      canvas.className = 'kg-graph-canvas';

      if (typeof d3 === 'undefined') {
        canvas.textContent = 'D3 未加载，无法渲染图谱';
        return canvas;
      }

      // 渲染在 _createDOM 完成 DOM 插入后进行（需要真实 clientHeight）
      return canvas;
    }

    _renderD3Graph(container, graph) {
      const width = container.clientWidth || 700;
      // 高度取 flex 布局后的真实高度，兜底 400（jsdom/旧调用路径）
      const height = container.clientHeight || 400;
      const nodes = (graph.nodes || []).map(n => ({ ...n }));
      // 生成失败/部分再生成的项目，graph.json 可能残留悬空边（端点概念已不存在），
      // d3.forceLink 遇到会同步抛 "node not found" —— 渲染前过滤
      const nodeIds = new Set(nodes.map(n => n.id));
      const edges = (graph.edges || [])
        .map(e => ({ source: e.from, target: e.to }))
        .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

      // Build adjacency for hover highlight
      const connected = {};
      for (const node of nodes) connected[node.id] = new Set();
      for (const e of edges) {
        connected[e.source]?.add(e.target);
        connected[e.target]?.add(e.source);
      }

      // Use shared STATUS_COLORS from outer scope
      const STATUS_BG = {
        mastered: '#a7f3d0',
        learning: '#fde68a',
        struggling: '#fecaca',
        not_started: '#a3a0fb'
      };

      // Create SVG with zoom/pan
      const svg = d3.select(container)
        .append('svg')
        .attr('width', '100%')
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`);

      // Zoom behavior（留存引用：布局稳定后用于 fit-to-view）
      const zoomGroup = svg.append('g');
      const zoomBehavior = d3.zoom()
        .scaleExtent([0.3, 3])
        .on('zoom', (e) => zoomGroup.attr('transform', e.transform));
      svg.call(zoomBehavior);

      // Arrow marker for directed edges
      svg.append('defs').append('marker')
        .attr('id', 'kg-arrow')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4L10,0L0,4')
        .attr('fill', '#94a3b8');

      // Force simulation — tuned for readable spacing
      const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(edges).id(d => d.id).distance(140).strength(0.3))
        .force('charge', d3.forceManyBody().strength(-500))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('x', d3.forceX(width / 2).strength(0.04))
        .force('y', d3.forceY(height / 2).strength(0.04))
        .force('collision', d3.forceCollide().radius(50))
        .alphaDecay(0.03);

      // Edge lines
      const link = zoomGroup.append('g')
        .selectAll('line')
        .data(edges)
        .join('line')
        .attr('stroke', '#475569')
        .attr('stroke-width', 1.5)
        .attr('marker-end', 'url(#kg-arrow)');

      // Node groups
      const nodeGroup = zoomGroup.append('g')
        .selectAll('g')
        .data(nodes)
        .join('g')
        .attr('cursor', 'pointer')
        .call(d3.drag()
          .on('start', (e, d) => {
            if (!e.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on('end', (e, d) => {
            if (!e.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
        );

      // Node circles
      nodeGroup.append('circle')
        .attr('r', 8)
        .attr('fill', d => STATUS_BG[d.node_status] || STATUS_BG.not_started)
        .attr('stroke', d => STATUS_COLORS[d.node_status] || STATUS_COLORS.not_started)
        .attr('stroke-width', 2);

      // Node labels (color matches status)
      nodeGroup.append('text')
        .text(d => d.name)
        .attr('dx', 12)
        .attr('dy', 4)
        .attr('font-size', '12px')
        .attr('font-weight', 500)
        .attr('fill', d => STATUS_COLORS[d.node_status] || STATUS_COLORS.not_started)
        .attr('font-family', '-apple-system, BlinkMacSystemFont, sans-serif');

      // Hover highlight
      nodeGroup
        .on('mouseenter', (e, d) => {
          const adj = connected[d.id] || new Set();
          nodeGroup.select('circle')
            .attr('opacity', n => (n.id === d.id || adj.has(n.id)) ? 1 : 0.15)
            .attr('r', n => n.id === d.id ? 10 : 8);
          nodeGroup.select('text')
            .attr('opacity', n => (n.id === d.id || adj.has(n.id)) ? 1 : 0.15)
            .attr('font-weight', n => n.id === d.id ? 700 : 500);
          link.attr('opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.08)
            .attr('stroke-width', l => (l.source.id === d.id || l.target.id === d.id) ? 2 : 1.5);
        })
        .on('mouseleave', () => {
          nodeGroup.select('circle').attr('opacity', 1).attr('r', 8);
          nodeGroup.select('text').attr('opacity', 1).attr('font-weight', 500);
          link.attr('opacity', 1).attr('stroke-width', 1.5);
        });

      // Click → open drawer
      nodeGroup.on('click', (e, d) => {
        this._openDrawer(d);
      });

      // Tick update
      const ticked = () => {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);
        nodeGroup.attr('transform', d => `translate(${d.x},${d.y})`);
      };
      simulation.on('tick', ticked);

      // 自适应全图：同步预跑布局（不等 alpha 自然冷却 ~4s），立即 fit 全图。
      // 注意：手动 simulation.tick() 不派发 tick 事件（d3 只在内部 timer 里派发），
      // 预跑后必须手动调一次 ticked() 刷新 DOM，否则画面停在初始位置（全部重叠）。
      // 预跑后停掉 simulation，图谱静止稳定；拖拽时 drag start 会自行 restart
      const INITIAL_TICKS = 150;
      for (let i = 0; i < INITIAL_TICKS; i++) simulation.tick();
      ticked();
      simulation.stop();
      const fit = computeFitTransform(nodes, width, height);
      if (fit) {
        svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(fit.x, fit.y).scale(fit.k));
      }
    }

    _createChapterList(chapters) {
      const list = document.createElement('div');
      list.className = 'kg-chapter-list';

      for (const chapter of chapters) {
        const item = document.createElement('div');
        item.className = 'kg-chapter-item';
        item.textContent = chapter.title || chapter.file;

        item.addEventListener('click', () => {
          this.onEnterReading(chapter.file || chapter);
        });

        list.appendChild(item);
      }

      return list;
    }

    _createActions(data) {
      const actions = document.createElement('div');
      actions.className = 'kg-actions';

      // Review button (project-level entry)
      // 完结课程入口常驻、不带计数徽标（不再催复习）；决策纯函数在 course-completion.js
      const dueCount = (data && data.dueCount) || 0;
      const spec = (window.CourseCompletion && window.CourseCompletion.getReviewEntrySpec)
        ? window.CourseCompletion.getReviewEntrySpec(!!(data && data.courseCompleted), dueCount)
        : { visible: dueCount > 0, showCount: dueCount > 0, count: dueCount, urgent: dueCount > 0 };
      if (spec.visible) {
        const reviewBtn = document.createElement('button');
        // 非提醒态（完结课程）用中性样式：橙红渐变 = 「今日有到期复习项」的视觉催促
        reviewBtn.className = spec.urgent
          ? 'kg-action-btn kg-action-review'
          : 'kg-action-btn kg-action-review kg-action-review-calm';
        reviewBtn.setAttribute('data-action', 'review');
        reviewBtn.innerHTML = spec.showCount
          ? `🧠 今日复习 <span class="kg-review-count">${spec.count}</span>`
          : '🧠 复习回顾';
        reviewBtn.addEventListener('click', () => {
          this.onReview();
        });
        actions.appendChild(reviewBtn);
      }

      // Enter reading button
      const enterBtn = document.createElement('button');
      enterBtn.className = 'kg-action-btn kg-action-primary';
      enterBtn.setAttribute('data-action', 'enter-reading');
      enterBtn.textContent = '进入阅读';
      enterBtn.addEventListener('click', () => {
        this.onEnterReading();
      });
      actions.appendChild(enterBtn);

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.className = 'kg-action-btn';
      closeBtn.setAttribute('data-action', 'close');
      closeBtn.textContent = '关闭';
      closeBtn.addEventListener('click', () => {
        this.close();
      });
      actions.appendChild(closeBtn);

      return actions;
    }

    // --- Detail drawer ---

    _openDrawer(node) {
      this._closeDrawer();

      const drawer = document.createElement('div');
      drawer.className = 'kg-detail-drawer';

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.className = 'kg-detail-close';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', () => this._closeDrawer());
      drawer.appendChild(closeBtn);

      // Concept name
      const name = document.createElement('h3');
      name.className = 'kg-detail-name';
      name.textContent = node.name;
      drawer.appendChild(name);

      // Status
      const status = document.createElement('div');
      status.className = 'kg-detail-status';
      status.textContent = STATUS_LABELS[node.node_status] || '未开始';
      drawer.appendChild(status);

      // Chapter
      const chapter = document.createElement('div');
      chapter.className = 'kg-detail-chapter';
      chapter.textContent = '章节: ' + (node.chapter || '未知');
      drawer.appendChild(chapter);

      // Append to modal
      const modal = this._overlay && this._overlay.querySelector('.kg-dashboard-modal');
      if (modal) modal.appendChild(drawer);
      this._drawer = drawer;
    }

    _closeDrawer() {
      if (this._drawer) {
        this._drawer.remove();
        this._drawer = null;
      }
    }

    // --- DOM teardown ---

    _removeDOM() {
      this._closeDrawer();
      if (this._overlay) {
        this._overlay.remove();
        this._overlay = null;
      }
    }

    // --- ESC key handling ---

    _bindESC() {
      this._escHandler = (e) => {
        if (e.key === 'Escape') this.close();
      };
      document.addEventListener('keydown', this._escHandler);
    }

    _unbindESC() {
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
      }
    }
  }

  window.KnowledgeGraphDashboard = KnowledgeGraphDashboard;
  // 纯函数导出（fit-to-view 单测）
  KnowledgeGraphDashboard.computeFitTransform = computeFitTransform;
})();
