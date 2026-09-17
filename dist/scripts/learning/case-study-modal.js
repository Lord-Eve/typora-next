/**
 * Case Study Modal - 案例研习
 *
 * 划词选概念 → AI 生成三段式教学案例（情境/分析/回扣）→ 自由追问。
 * UI 复用 NotebookModal 外壳（与苏格拉底同款笔记本对话框）；
 * 对话链路复用 pi session 续聊（case_study_chat 命令）。
 *
 * 与苏格拉底的分工：苏格拉底是「AI 考你」（概念簇提问），
 * 案例研习是「AI 讲案例 + 你追问」（围绕选中概念）。无 done 状态，
 * 用户手动关闭（二次确认），会话落盘 .learning/case-studies/。
 *
 * 续聊模式：传入 savedSession 即从历史列表接着聊——回放已存轮次、输入可用、
 * 结束落盘时覆盖原会话文件（身份取自 savedSession.file）。打开时只回放，
 * 不自动发起 LLM 调用（避免“看一眼历史就烧一次 token”）。
 */

(function() {
  'use strict';

  if (typeof window === 'undefined') global.window = {};
  if (typeof document === 'undefined') {
    global.document = {
      createElement: () => ({
        style: {}, innerHTML: '', textContent: '', value: '',
        appendChild() {}, remove() {}, addEventListener() {},
        querySelector: () => null, querySelectorAll: () => [], setAttribute() {}
      }),
      body: { appendChild() {}, removeChild() {} },
      getElementById: () => null,
      addEventListener() {}, removeEventListener() {}
    };
  }

  // 外壳依赖（浏览器 index.html 已加载；Node 测试兜底引入）
  if (!window.NotebookModal && typeof require !== 'undefined') {
    try {
      window.NotebookModal = require('./notebook-modal.js').NotebookModal;
    } catch (_) { /* browser path */ }
  }

  function escapeHtml(text) {
    if (window.NotebookModal && window.NotebookModal.escapeHtml) {
      return window.NotebookModal.escapeHtml(text);
    }
    return String(text || '');
  }

  class CaseStudyModal {
    /**
     * @param {object} opts
     * @param {string} opts.projectPath
     * @param {string} opts.selectedText - 划词选中的概念
     * @param {object|null} opts.context - {chapterTitle, chapterGoal, surroundingText}
     * @param {string} [opts.chapterFile] - 当前章节文件名（落盘用）
     * @param {object} [opts.savedSession] - 传入则进入只读回看模式
     */
    constructor(opts) {
      this.projectPath = opts.projectPath;
      this.selectedText = opts.selectedText || (opts.savedSession && opts.savedSession.selected_text) || '';
      this.context = opts.context || null;
      this.chapterFile = opts.chapterFile || (opts.savedSession && opts.savedSession.chapter_file) || '';
      this.savedSession = opts.savedSession || null;

      this.sessionId = (this.savedSession && this.savedSession.session_id) || null;
      // 续聊必须先把已存轮次灌进 turns：否则再次落盘写出的会话只剩新增轮次，
      // 原对话被截断（turns 是落盘时的单一数据源）
      this.turns = (this.savedSession && Array.isArray(this.savedSession.turns))
        ? this.savedSession.turns.slice()
        : [];
      // 原会话文件名（list_sessions 注入）：续聊落盘靠它覆盖原文件，
      // 否则每续聊一次就在历史里多出一条重复记录
      // 续聊落盘基线：只有新增了轮次才重写文件。否则“翻开历史看一眼就又关掉”
      // 会把 ended_at 改写成当下时间（历史列表按它排序，条目会莫名跳到顶部）
      this._resumedTurnCount = this.turns.length;
      this._sessionFile = (this.savedSession && this.savedSession.file) || null;
      this.opened = false;
      this._sessionSaved = false;
      // 续聊时沿用原会话开始时间，不重置为本次打开时间
      this._startedAt = (this.savedSession && this.savedSession.started_at) || null;
      this._shell = null;
      this._resumed = !!this.savedSession;
    }

    async open() {
      if (!this._resumed) this._startedAt = new Date().toISOString();
      this.opened = true;

      const esc = escapeHtml(this.selectedText);
      const chipsHtml = this.chapterFile
        ? `<span class="socratic-chip">📖 ${escapeHtml(this.chapterFile)}</span>`
        : '';

      this._shell = new window.NotebookModal({
        prefix: 'casestudy',
        icon: '📋',
        title: '案例研习',
        subtitle: `概念: ${esc}`,
        chipsHtml,
        placeholder: this._resumed ? '📋 已恢复历史会话，可继续追问' : '📋 正在生成案例...',
        tutorAvatar: '📋'
      });
      this._shell.render();
      this._shell.bindEvents({
        onSend: () => this._handleSend(),
        onEndClick: () => this._handleEndClick()
      });

      if (this._resumed) {
        // 只回放，不发起 LLM 调用（打开历史 ≠ 续聊）
        for (const t of this.turns) {
          if (t.role === 'user') this._shell.appendUserBubble(t.content);
          else this._shell.appendTutorBubble(t.content);
        }
        // 输入框保持可用：用户就是来接着聊的；结束时覆盖落盘
        return;
      }

      await this._sendCaseTurn(null);
    }

    async _sendCaseTurn(userAnswer) {
      // 流式输出：监听 Rust 转发的 case_study_delta 事件，
      // 首个 delta 到达后撤掉 loading、改为流式气泡实时渲染；
      // 无事件能力（Node 测试/mock）走原 loading + 一次性渲染兜底。
      let stream = null;
      let accumulated = '';
      let unlisten = null;
      if (window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.listen) {
        try {
          unlisten = await window.__TAURI__.event.listen('case-study-event', (ev) => {
            const payload = ev && ev.payload;
            if (!payload || payload.type !== 'case_study_delta') return;
            const delta = payload.data && payload.data.delta;
            if (!delta) return;
            if (!stream) {
              loadingEl.remove();
              stream = this._shell.startTutorStream();
            }
            accumulated += delta;
            stream.update(accumulated);
          });
        } catch (e) {
          console.warn('[CaseStudyModal] event listen unavailable, non-stream fallback:', e);
        }
      }

      const loadingEl = this._shell.appendLoadingBubble();
      try {
        const resp = await window.__TAURI__.core.invoke('case_study_chat', {
          projectPath: this.projectPath,
          selectedText: this.selectedText,
          context: this.context ? JSON.stringify(this.context) : null,
          userAnswer: userAnswer,
          sessionId: this.sessionId
        });
        if (unlisten) unlisten();
        if (resp.session_id) this.sessionId = resp.session_id;
        this.turns.push({ role: 'tutor', content: resp.content });
        if (stream) {
          // 以最终结果为准（authoritative）：delta 累积可能与最终输出有出入
          stream.finalize(resp.content);
        } else {
          loadingEl.remove();
          this._shell.appendTutorBubble(resp.content);
        }
      } catch (e) {
        if (unlisten) unlisten();
        if (stream) stream.remove();
        else loadingEl.remove();
        const friendlyError = '暂时无法生成：' + (e?.message || (typeof e === 'string' ? e : '') || '未知错误') + '。请稍后重试。';
        this.turns.push({ role: 'tutor', content: friendlyError });
        this._shell.appendTutorBubble(friendlyError);
      }
    }

    async _handleSend() {
      const text = this._shell.takeInput();
      if (!text) return;
      this._shell.appendUserBubble(text);
      this.turns.push({ role: 'user', content: text });
      await this._sendCaseTurn(text);
    }

    _handleEndClick() {
      if (this._sessionSaved) {
        this._close();
        return;
      }
      const confirmText = '确定结束案例研习？对话仍会保存';
      if (window.confirm(confirmText)) {
        this.confirmEnd();
      }
    }

    async confirmEnd() {
      const ok = await this._persistSession('user_ended');
      if (ok) this._close();
    }

    async _persistSession(reason) {
      if (this._sessionSaved) return true;

      // 续聊但没有任何新增轮次 → 不动盘（内容与已有文件逐字相同，重写只会污染
      // ended_at 并让历史条目无端置顶）
      if (this._resumed && this.turns.length === this._resumedTurnCount) {
        this._sessionSaved = true;
        return true;
      }

      this._sessionSaved = true;

      if (!window.__TAURI__) return true;

      const session = {
        version: '1.0',
        selected_text: this.selectedText,
        chapter_file: this.chapterFile,
        session_id: this.sessionId,
        turns: this.turns,
        started_at: this._startedAt || new Date().toISOString(),
        ended_at: new Date().toISOString(),
        end_reason: reason
      };

      try {
        const savedPath = await window.__TAURI__.core.invoke('case_study_save_session', {
          projectPath: this.projectPath,
          session,
          // 续聊：覆盖原会话文件（身份来自 list_sessions 注入的 file）
          overwriteFile: this._sessionFile
        });
        if (savedPath) {
          this._sessionFile = String(savedPath).split(/[\\/]/).pop();
        }
        return true;
      } catch (e) {
        console.error('[CaseStudyModal] save_session failed:', e);
        this._sessionSaved = false; // 允许重试
        this._shell.appendTutorBubble('保存失败：' + (e.message || '磁盘写入错误') + '。对话内容仍保留在内存中，可尝试再次结束。');
        return false;
      }
    }

    _close() {
      this._shell.close();
      this.opened = false;
    }

    /**
     * 历史入口（无划词时）：列出 .learning/case-studies/ 会话，
     * 点击条目**继续对话**（回放已存轮次 + 输入可用，落盘覆盖原会话）。
     */
    static async openHistory(projectPath) {
      if (!window.__TAURI__) return;
      let sessions;
      try {
        sessions = await window.__TAURI__.core.invoke('case_study_list_sessions', { projectPath });
      } catch (e) {
        console.error('[CaseStudyModal] list_sessions failed:', e);
        if (window.showToast) window.showToast('读取案例记录失败', 'error');
        return;
      }
      if (!sessions || sessions.length === 0) {
        if (window.showToast) window.showToast('还没有案例研习记录，先在正文划词生成一个吧', 'info');
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'socratic-modal-overlay';
      overlay.id = 'casestudyHistoryOverlay';

      const card = document.createElement('div');
      card.className = 'socratic-modal-card';
      card.innerHTML = `
        <div class="socratic-modal-header">
          <div class="socratic-modal-header-top">
            <div class="socratic-modal-header-left">
              <div class="socratic-modal-icon">📋</div>
              <div>
                <div class="socratic-modal-title">案例研习记录</div>
                <div class="socratic-modal-subtitle">${sessions.length} 场会话 · 点击继续对话</div>
              </div>
            </div>
            <button id="casestudyHistoryCloseBtn" class="socratic-modal-end-btn">关闭</button>
          </div>
        </div>
      `;

      const list = document.createElement('div');
      list.className = 'casestudy-history-list';
      for (const s of sessions) {
        const item = document.createElement('div');
        item.className = 'casestudy-history-item';
        const turnCount = (s.turns || []).length;
        const date = String(s.ended_at || '').slice(0, 10);
        item.innerHTML = `
          <div class="casestudy-history-concept">${escapeHtml(s.selected_text || '(无概念)')}</div>
          <div class="casestudy-history-meta">${escapeHtml(s.chapter_file || '')} · ${turnCount} 轮 · ${date}</div>
        `;
        item.addEventListener('click', () => {
          overlay.remove();
          new CaseStudyModal({ projectPath, savedSession: s }).open();
        });
        list.appendChild(item);
      }
      card.appendChild(list);

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      card.querySelector('#casestudyHistoryCloseBtn').addEventListener('click', () => overlay.remove());
    }
  }

  window.CaseStudyModal = CaseStudyModal;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CaseStudyModal };
  }
})();
