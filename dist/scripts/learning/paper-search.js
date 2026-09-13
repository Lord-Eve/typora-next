/**
 * Paper Search — search papers by keyword via AnySearch (academic domain).
 *
 * UX state machine: form → searching → results / empty / error
 *   - import from a result reuses the existing MinerU import pipeline
 *   - "缓存" imports WITHOUT navigating; the button then becomes "打开"
 *     (reading is an explicit second step, so the search page is never lost)
 *   - batch cache: checkboxes + one button, sequential import, failures
 *     collected and surfaced without aborting the batch
 *   - cached papers show a 已缓存 badge + 打开/📂 buttons
 *   - re-entering the welcome page does NOT restore the last
 *     search — PaperLibrary shows the cached papers grouped by domain
 *     instead (course-hub interaction language); the search form always
 *     starts a fresh search
 *   - caching shows an unmissable busy state: progress slot sits ABOVE
 *     the results list and the item's button becomes a disabled 缓存中…
 *   - missing API key falls back to anonymous search, never a dead end
 */

(function (global) {
  'use strict';

  function invoke(cmd, args) {
    if (global.TyporaNext && typeof global.TyporaNext.invoke === 'function') {
      return global.TyporaNext.invoke(cmd, args);
    }
    if (global.__TAURI__ && global.__TAURI__.core) {
      return global.__TAURI__.core.invoke(cmd, args);
    }
    return Promise.reject(new Error('Tauri 未就绪'));
  }

  const PaperSearch = {
    _section: null,
    _state: 'form',
    _results: [],
    _hasKey: false,
    // url → ImportIndexEntry；已缓存论文的标记集合
    _importedMap: {},
    // 上次搜索关键词（仅作本次会话缓存时的领域标签；起不再用于恢复结果）
    _lastQuery: null,
    // url → true：正在缓存中的论文（按钮忙态，防重复点击）
    _busyUrls: {},

    /**
     * Attach (idempotently) a search section to `container`.
     * Re-probes config each time: settings may change between visits.
     * 不再恢复上次搜索结果——重进欢迎页由 PaperLibrary
     * 按领域展示已缓存论文（课程选择的交互语言），搜索框始终是新搜索。
     */
    async attach(container) {
      let section = container.querySelector('.paper-search-section');
      if (!section) {
        section = document.createElement('div');
        section.className = 'paper-search-section';
        container.appendChild(section);
      }
      this._section = section;
      this._hasKey = await this._probeKey();
      this._renderForm();
      return section;
    },

    async _probeKey() {
      try {
        const config = await invoke('get_config');
        return !!(config && config.anysearch_api_key);
      } catch (e) {
        return false;
      }
    },

    getState() {
      return this._state;
    },

    getResults() {
      return this._results.slice();
    },

    _renderForm() {
      const section = this._section;
      section.innerHTML = '';
      this._state = 'form';
      // 注意：不重置 this._results —— attach 依赖它恢复上次搜索

      const form = document.createElement('div');
      form.className = 'paper-search-form';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'paper-search-input';
      input.placeholder = '输入领域关键词搜索论文';

      const btn = document.createElement('button');
      btn.className = 'paper-search-btn';
      btn.textContent = '搜索';
      btn.addEventListener('click', () => this.search(input.value));

      form.appendChild(input);
      form.appendChild(btn);
      section.appendChild(form);

      if (!this._hasKey) {
        const hint = document.createElement('div');
        hint.className = 'paper-search-anon-hint';
        hint.textContent = '未配置 AnySearch API key，使用匿名搜索（限额较低）。';
        const guide = document.createElement('button');
        guide.className = 'paper-search-settings-btn';
        guide.textContent = '前往设置';
        guide.addEventListener('click', () => {
          if (global.TyporaNext && typeof global.TyporaNext.openSettings === 'function') {
            global.TyporaNext.openSettings();
          }
        });
        hint.appendChild(guide);
        section.appendChild(hint);
      }

      const status = document.createElement('div');
      status.className = 'paper-search-status';
      status.style.display = 'none';
      section.appendChild(status);

      const error = document.createElement('div');
      error.className = 'paper-search-error';
      error.style.display = 'none';
      section.appendChild(error);

      const empty = document.createElement('div');
      empty.className = 'paper-search-empty';
      empty.style.display = 'none';
      section.appendChild(empty);

      // 进度条专用槽位：PaperImport.showProgress 会 innerHTML 覆盖容器，
      // 必须隔离，否则导入时结果列表被清空。
      // 槽位置于结果列表**之前**——之前在列表之后，
      // 结果一多进度就在视口外，用户点了缓存毫无感知。
      const slot = document.createElement('div');
      slot.className = 'paper-search-progress-slot';
      section.appendChild(slot);

      // 批量缓存操作条（有未缓存结果时才填充）
      const batch = document.createElement('div');
      batch.className = 'paper-search-batch';
      batch.style.display = 'none';
      section.appendChild(batch);

      const results = document.createElement('div');
      results.className = 'paper-search-results';
      section.appendChild(results);
    },

    _setVisible(el, visible) {
      el.style.display = visible ? '' : 'none';
    },

    /** Refresh the imported-paper index from the backend. */
    async _loadImportedMarks() {
      try {
        const list = await invoke('list_imported_papers');
        const map = {};
        (list || []).forEach((e) => {
          if (e && e.url) map[e.url] = e;
        });
        this._importedMap = map;
      } catch (e) {
        // 索引不可用时静默降级为"全部未缓存"，不阻断搜索
        this._importedMap = {};
      }
    },

    async search(keyword) {
      const query = (keyword || '').trim();
      const section = this._section;
      const status = section.querySelector('.paper-search-status');
      const error = section.querySelector('.paper-search-error');
      const empty = section.querySelector('.paper-search-empty');
      const resultsBox = section.querySelector('.paper-search-results');

      if (!query) {
        this._state = 'error';
        error.textContent = '请输入搜索关键词';
        this._setVisible(error, true);
        this._setVisible(status, false);
        return;
      }

      this._state = 'searching';
      status.textContent = '正在搜索…';
      this._setVisible(status, true);
      this._setVisible(error, false);
      this._setVisible(empty, false);
      resultsBox.innerHTML = '';
      this._results = [];

      try {
        const res = await invoke('search_papers', { query });
        const items = (res && res.results) || [];
        this._results = items;
        this._lastQuery = query;

        this._setVisible(status, false);
        if (items.length === 0) {
          this._state = 'empty';
          empty.textContent = '未找到相关论文，换个关键词试试';
          this._setVisible(empty, true);
          return;
        }

        await this._loadImportedMarks();
        this._renderResults();
      } catch (err) {
        this._state = 'error';
        this._setVisible(status, false);
        error.textContent = `搜索失败：${(err && err.message) || err}`;
        this._setVisible(error, true);
      }
    },

    /** (Re)render the results box + batch bar from this._results. */
    _renderResults() {
      const section = this._section;
      const resultsBox = section.querySelector('.paper-search-results');
      const batch = section.querySelector('.paper-search-batch');
      resultsBox.innerHTML = '';
      this._results.forEach((item) => resultsBox.appendChild(this._renderItem(item)));
      this._renderBatchBar(batch);
      this._state = 'results';
    },

    _renderBatchBar(batch) {
      batch.innerHTML = '';
      const uncached = this._results.filter((i) => i.url && !this._importedMap[i.url]);
      if (uncached.length === 0) {
        this._setVisible(batch, false);
        return;
      }
      this._setVisible(batch, true);

      const checkAll = document.createElement('input');
      checkAll.type = 'checkbox';
      checkAll.className = 'paper-search-check-all';
      checkAll.addEventListener('change', () => {
        this._section.querySelectorAll('.paper-search-check').forEach((c) => {
          c.checked = checkAll.checked;
        });
        this._updateBatchButton();
      });
      batch.appendChild(checkAll);

      const label = document.createElement('span');
      label.className = 'paper-search-batch-label';
      label.textContent = '全选';
      batch.appendChild(label);

      const btn = document.createElement('button');
      btn.className = 'paper-search-batch-btn';
      btn.addEventListener('click', () => this._batchCache());
      batch.appendChild(btn);
      this._updateBatchButton();
    },

    _updateBatchButton() {
      const btn = this._section.querySelector('.paper-search-batch-btn');
      if (!btn) return;
      const n = Array.from(this._section.querySelectorAll('.paper-search-check'))
        .filter((c) => c.checked).length;
      btn.textContent = n > 0 ? `缓存选中（${n}）` : '缓存选中';
      btn.disabled = n === 0;
    },

    _renderItem(item) {
      const el = document.createElement('div');
      el.className = 'paper-search-item';
      const cached = item.url ? this._importedMap[item.url] : null;

      if (item.url && !cached) {
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'paper-search-check';
        check._paperUrl = item.url;
        check.addEventListener('change', () => this._updateBatchButton());
        el.appendChild(check);
      }

      const body = document.createElement('div');
      body.className = 'paper-search-item-body';

      const title = document.createElement('div');
      title.className = 'paper-search-title';
      title.textContent = item.title || '(无标题)';
      body.appendChild(title);

      if (cached) {
        const badge = document.createElement('span');
        badge.className = 'paper-search-cached-badge';
        badge.textContent = '已缓存';
        body.appendChild(badge);
      }

      if (item.url) {
        const link = document.createElement('a');
        link.className = 'paper-search-link';
        link.href = item.url;
        link.textContent = item.url;
        link.target = '_blank';
        body.appendChild(link);
      }

      if (item.year) {
        const meta = document.createElement('span');
        meta.className = 'paper-search-meta';
        meta.textContent = String(item.year);
        body.appendChild(meta);
      }

      el.appendChild(body);

      const importBtn = document.createElement('button');
      importBtn._paperUrl = item.url || null;
      if (cached) {
        importBtn.className = 'paper-search-open-paper-btn';
        importBtn.textContent = '打开';
        importBtn.addEventListener('click', () => this._openCached(cached));
        el.appendChild(importBtn);

        // 已缓存论文可直达所在文件夹（用户找不到文件的反馈）
        const folderBtn = document.createElement('button');
        folderBtn.className = 'paper-search-folder-btn';
        folderBtn.textContent = '📂';
        folderBtn.title = '所在文件夹';
        folderBtn.addEventListener('click', () => {
          invoke('show_in_folder', { path: cached.md_path }).catch((e) => {
            console.warn('[paper-search] show_in_folder failed:', e);
          });
        });
        el.appendChild(folderBtn);
      } else if (item.url && this._busyUrls[item.url]) {
        // 缓存进行中：按钮忙态（缓存无 loading 感知的修复）
        importBtn.className = 'paper-search-import-btn paper-search-btn-busy';
        importBtn.textContent = '缓存中…';
        importBtn.disabled = true;
        el.appendChild(importBtn);
      } else {
        importBtn.className = 'paper-search-import-btn';
        importBtn.textContent = '缓存';
        importBtn.addEventListener('click', () => this._importItem(item));
        el.appendChild(importBtn);
      }

      return el;
    },

    /** 把某条结果的缓存按钮切换为忙态（不重渲染，保住勾选状态）。 */
    _setItemBusy(url, busy) {
      // 真实 DOM 的 querySelectorAll 返回 NodeList（无 .find），先转数组
      const btns = Array.from(this._section.querySelectorAll('.paper-search-import-btn'));
      const btn = btns.find((b) => b._paperUrl === url);
      if (!btn) return;
      if (busy) {
        btn.textContent = '缓存中…';
        btn.disabled = true;
        btn.classList.add('paper-search-btn-busy');
      } else {
        btn.textContent = '缓存';
        btn.disabled = false;
        btn.classList.remove('paper-search-btn-busy');
      }
    },

    /** Cache one paper: import only, no navigation. */
    async _importItem(item) {
      const section = this._section;
      const status = section.querySelector('.paper-search-status');
      const error = section.querySelector('.paper-search-error');
      const slot = section.querySelector('.paper-search-progress-slot');
      const PaperImport = global.PaperImport;

      if (item.url && this._busyUrls[item.url]) return; // 防重复点击
      if (item.url) {
        this._busyUrls[item.url] = true;
        this._setItemBusy(item.url, true);
      }

      if (PaperImport && typeof PaperImport.showProgress === 'function') {
        PaperImport.showProgress(slot, 'submit', '正在缓存论文…');
      }
      try {
        const result = await invoke('import_paper_from_url', { url: item.url, domain: this._lastQuery });
        if (PaperImport && typeof PaperImport.hideProgress === 'function') {
          PaperImport.hideProgress(slot);
        }
        this._setVisible(error, false);
        // 只缓存不跳阅读：搜索页保持可用（UX 修正）
        this._importedMap[item.url] = {
          url: item.url,
          md_path: result.md_path,
          title: result.title || item.title,
          domain: this._lastQuery || null,
        };
        status.textContent = `已缓存：${result.title || item.title || item.url}`;
        this._setVisible(status, true);
        this._renderResults();
      } catch (err) {
        // 错误不是终点——失败（含错误全文）交给 agent 批量补救。
        // 无 AI 配置 / 补救本身失败时回退到旧错误路径，透出原始错误。
        const message = String((err && err.message) || err);
        const rescue = await this._rescueFailures(
          [{ title: item.title || item.url, url: item.url, message }], slot);
        if (PaperImport && typeof PaperImport.hideProgress === 'function') {
          PaperImport.hideProgress(slot);
        }
        if (rescue && rescue.stillFailed.length === 0) {
          // 补救成功：标记已缓存，按钮变「打开」
          this._setVisible(error, false);
          const entry = this._importedMap[item.url];
          status.textContent = `已缓存（agent 补救成功）：${(entry && entry.title) || item.title || item.url}`;
          this._setVisible(status, true);
          this._renderResults();
        } else {
          const finalMessage = rescue ? rescue.stillFailed[0].message : message;
          // 结果列表保持不动，透出具体原因（教训：失败要有恢复路径）
          error.textContent = `缓存失败：${finalMessage}`;
          error.appendChild(document.createElement('br'));
          // 无开放获取 PDF 时给出浏览器打开的逃生门（下载后走本地 PDF 导入）
          if (item.url && /URL 不支持|未找到开放获取|解析论文链接失败/.test(finalMessage)) {
            error.appendChild(this._makeEscapeHatch(item.url, error));
          }
          this._setVisible(error, true);
        }
      } finally {
        if (item.url) {
          delete this._busyUrls[item.url];
          // 失败：按钮恢复可点（不重渲染，保住勾选状态）；
          // 成功：按钮已被 _renderResults 重建为「打开」，此处为 no-op
          this._setItemBusy(item.url, false);
        }
      }
    },

    /** 「在浏览器打开原文」逃生门按钮（单篇失败与批量失败共用）。 */
    _makeEscapeHatch(url, errorEl) {
      const openBtn = document.createElement('button');
      openBtn.className = 'paper-search-open-btn';
      openBtn.textContent = '在浏览器打开原文';
      openBtn.addEventListener('click', () => {
        invoke('open_external', { url }).catch((openErr) => {
          errorEl.textContent = `打开浏览器失败：${(openErr && openErr.message) || openErr}`;
          this._setVisible(errorEl, true);
        });
      });
      return openBtn;
    },

    /**
     * 把全部失败一次性交给 agent 批量补救（不是一篇一调）。
     * failures: [{title, url, message}]（message 为错误全文，agent 的上下文）。
     * 返回 { stillFailed: [...] }；补救成功的篇目直接登记进 _importedMap。
     * 无 AI 配置 / 补救失败 → 返回 null（调用方回退旧错误路径）。
     */
    async _rescueFailures(failures, slot) {
      if (!failures || failures.length === 0) return { stillFailed: [] };
      const valid = failures.filter((f) => f && f.url);
      if (valid.length === 0) return { stillFailed: failures.slice() };

      const PaperImport = global.PaperImport;
      if (PaperImport && typeof PaperImport.showProgress === 'function') {
        PaperImport.showProgress(slot, 'submit', `${valid.length} 篇解析失败，agent 正在批量补救…`);
      }

      let outcomes;
      try {
        outcomes = await invoke('rescue_paper_imports', {
          failures: valid.map((f) => ({ url: f.url, title: f.title, error: f.message })),
          domain: this._lastQuery,
        });
      } catch (e) {
        // 未配置 AI / 桥接失败：回退旧错误路径（透出原始错误，不吞）
        console.warn('[paper-search] rescue unavailable:', e);
        return null;
      }

      const byUrl = {};
      (outcomes || []).forEach((o) => { if (o && o.url) byUrl[o.url] = o; });
      const stillFailed = [];
      valid.forEach((f) => {
        const o = byUrl[f.url];
        if (o && o.ok && o.md_path) {
          this._importedMap[f.url] = {
            url: f.url,
            md_path: o.md_path,
            title: o.title || f.title,
            domain: this._lastQuery || null,
          };
        } else {
          stillFailed.push({
            title: f.title,
            url: f.url,
            // 补救仍失败的透出组合错误（原始错误 + agent 尝试记录）
            message: (o && o.error) || f.message,
          });
        }
      });
      return { stillFailed };
    },

    /** Cache all checked papers sequentially; failures don't abort the batch. */
    async _batchCache() {
      const section = this._section;
      const status = section.querySelector('.paper-search-status');
      const error = section.querySelector('.paper-search-error');
      const slot = section.querySelector('.paper-search-progress-slot');
      const PaperImport = global.PaperImport;

      const checkboxes = Array.from(section.querySelectorAll('.paper-search-check'));
      const checked = checkboxes
        .filter((c) => c.checked)
        .map((c) => c._paperUrl)
        .filter(Boolean);

      if (checked.length === 0) return;

      // 批量进行中：禁用批量按钮 + 全部勾选框 + 各条目缓存按钮（忙态）
      const batchBtn = section.querySelector('.paper-search-batch-btn');
      const checkAll = section.querySelector('.paper-search-check-all');
      if (batchBtn) batchBtn.disabled = true;
      if (checkAll) checkAll.disabled = true;
      checkboxes.forEach((c) => { c.disabled = true; });
      checked.forEach((url) => {
        this._busyUrls[url] = true;
        this._setItemBusy(url, true);
      });

      let ok = 0;
      let failures = [];
      for (let i = 0; i < checked.length; i++) {
        const url = checked[i];
        const item = this._results.find((r) => r.url === url) || { url };
        if (PaperImport && typeof PaperImport.showProgress === 'function') {
          PaperImport.showProgress(slot, 'submit', `正在缓存（${i + 1}/${checked.length}）…`);
        }
        try {
          const result = await invoke('import_paper_from_url', { url, domain: this._lastQuery });
          ok++;
          this._importedMap[url] = {
            url,
            md_path: result.md_path,
            title: result.title || item.title,
            domain: this._lastQuery || null,
          };
        } catch (err) {
          failures.push({
            title: item.title || url,
            url,
            message: String((err && err.message) || err),
          });
        }
      }

      // 循环内只收集失败不展示；全部失败一次性交给 agent 批量补救
      // （用户原则：重试对象是所有失败一起，由 agent 判断规划）。
      // ok 计数在补救成功后补齐；仍失败的透出组合错误。
      if (failures.length > 0) {
        const failedBefore = failures.length;
        const rescue = await this._rescueFailures(failures, slot);
        if (rescue) {
          ok += failedBefore - rescue.stillFailed.length;
          failures = rescue.stillFailed;
        }
      }

      if (PaperImport && typeof PaperImport.hideProgress === 'function') {
        PaperImport.hideProgress(slot);
      }
      checked.forEach((url) => { delete this._busyUrls[url]; });

      this._renderResults();
      if (failures.length === 0) {
        status.textContent = `批量缓存完成：${ok} 篇已入库`;
        this._setVisible(status, true);
        this._setVisible(error, false);
      } else {
        // 逐条列出失败原因；可解析性失败各自带浏览器逃生门（// 之前只显示第一条原因，其余失败用户无法处置）
        error.textContent = `批量缓存完成：成功 ${ok}，失败 ${failures.length}`;
        failures.forEach((f) => {
          const row = document.createElement('div');
          row.className = 'paper-search-fail-item';
          const text = document.createElement('span');
          text.className = 'paper-search-fail-text';
          text.textContent = `${f.title}: ${f.message}`;
          row.appendChild(text);
          if (f.url && /URL 不支持|未找到开放获取|解析论文链接失败/.test(f.message)) {
            row.appendChild(this._makeEscapeHatch(f.url, error));
          }
          error.appendChild(row);
        });
        this._setVisible(error, true);
        this._setVisible(status, false);
      }
    },

    /** Open a cached paper for reading (explicit user action). */
    async _openCached(entry) {
      if (!entry || !entry.md_path) return;
      const mdContent = await invoke('read_text_file', { filePath: entry.md_path });
      await this._openImported({
        md_path: entry.md_path,
        md_content: mdContent,
        title: entry.title,
      });
    },

    async _openImported(result) {
      if (!result || !result.md_path) return;
      if (!global.TyporaNext || typeof global.TyporaNext.addTab !== 'function') return;
      const baseDir = result.md_path.replace(/[^\\/]+$/, '');
      await global.TyporaNext.addTab(result.md_path, result.md_content, baseDir, {
        mode: 'paper',
        workspaceContext: { activePaperPath: result.md_path, paperProjectPath: baseDir }
      });
    }
  };

  global.PaperSearch = PaperSearch;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PaperSearch };
  }
})(typeof window !== 'undefined' ? window : global);
