/**
 * Paper Library — 论文库首页（Sprint 30）
 *
 * 重进论文导读时不再恢复上次搜索结果（Sprint 29c 的做法被用户否定），
 * 而是像课程模式 hub 一样，把全局导入索引按领域分组展示，让用户
 * 选择之前保存的论文直接进入阅读。
 *
 * UX state machine: 空库（不渲染）→ 领域卡片列表 → 展开卡片 → 打开/定位论文
 *   - 索引读取失败静默降级为空库，不阻断搜索主流程
 *   - 打开阅读复用 PaperSearch._openImported（单一 tab 打开路径）
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

  const UNCATEGORIZED = '未分类';

  /**
   * Group index entries by domain.
   * @param entries ImportIndexEntry[]（domain 可能缺失 → 未分类）
   * @returns [{domain, papers}] 组内按 cached_at 倒序，组间按最新缓存倒序
   */
  function groupByDomain(entries) {
    const groups = new Map();
    (entries || []).forEach((e) => {
      if (!e || !e.md_path) return;
      const key = (e.domain && String(e.domain).trim()) || UNCATEGORIZED;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    });
    const byCachedAtDesc = (a, b) =>
      String(b.cached_at || '').localeCompare(String(a.cached_at || ''));
    return Array.from(groups.entries())
      .map(([domain, papers]) => {
        papers.sort(byCachedAtDesc);
        return { domain, papers, latest: papers[0] ? papers[0].cached_at : '' };
      })
      .sort((a, b) => String(b.latest || '').localeCompare(String(a.latest || '')));
  }

  const PaperLibrary = {
    _section: null,
    _groups: [],
    _parent: null,

    /**
     * Attach (idempotently) the library section to `container`.
     * Re-loads the index each time: newly cached papers must show up
     * when the user comes back from reading.
     */
    async attach(container) {
      let section = container.querySelector('.paper-library-section');
      if (!section) {
        section = document.createElement('div');
        section.className = 'paper-library-section';
        container.appendChild(section);
      }
      this._section = section;
      this._parent = container;
      let entries = [];
      try {
        entries = (await invoke('list_imported_papers')) || [];
      } catch (e) {
        // 索引不可用时静默降级为空库
        entries = [];
      }
      this._groups = groupByDomain(entries);
      this._render();
      return section;
    },

    getGroups() {
      return this._groups.slice();
    },

    _render() {
      const section = this._section;
      section.innerHTML = '';
      if (this._groups.length === 0) {
        section.style.display = 'none';
        return;
      }
      section.style.display = '';

      const title = document.createElement('div');
      title.className = 'paper-library-title';
      title.textContent = '我的论文库';
      section.appendChild(title);

      this._groups.forEach((group) => section.appendChild(this._renderCard(group)));
    },

    _renderCard(group) {
      const card = document.createElement('div');
      card.className = 'paper-library-card';

      const header = document.createElement('button');
      header.className = 'paper-library-card-header';
      header.setAttribute('aria-expanded', 'false');

      const name = document.createElement('span');
      name.className = 'paper-library-card-name';
      name.textContent = group.domain;
      header.appendChild(name);

      const meta = document.createElement('span');
      meta.className = 'paper-library-card-meta';
      meta.textContent = `${group.papers.length} 篇`;
      header.appendChild(meta);

      const chevron = document.createElement('span');
      chevron.className = 'paper-library-card-chevron';
      chevron.textContent = '›';
      header.appendChild(chevron);

      // Sprint 30c：整个领域（论文集）可删除——真删除，磁盘文件一并清理
      const delBtn = document.createElement('button');
      delBtn.className = 'paper-library-delete-domain-btn';
      delBtn.textContent = '🗑️';
      delBtn.title = '删除该领域及其全部论文';
      delBtn.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        this._deleteDomain(group);
      });
      header.appendChild(delBtn);

      const list = document.createElement('div');
      list.className = 'paper-library-list';
      list.style.display = 'none';
      group.papers.forEach((entry) => list.appendChild(this._renderItem(entry)));

      header.addEventListener('click', () => {
        const expanded = list.style.display !== 'none';
        list.style.display = expanded ? 'none' : '';
        header.setAttribute('aria-expanded', String(!expanded));
        card.classList.toggle('expanded', !expanded);
      });

      card.appendChild(header);
      card.appendChild(list);
      return card;
    },

    _renderItem(entry) {
      const item = document.createElement('div');
      item.className = 'paper-library-item';

      const title = document.createElement('span');
      title.className = 'paper-library-item-title';
      title.textContent = entry.title || entry.md_path;
      item.appendChild(title);

      const openBtn = document.createElement('button');
      openBtn.className = 'paper-library-open-btn';
      openBtn.textContent = '打开';
      openBtn.addEventListener('click', () => this._openPaper(entry));
      item.appendChild(openBtn);

      const folderBtn = document.createElement('button');
      folderBtn.className = 'paper-library-folder-btn';
      folderBtn.textContent = '📂';
      folderBtn.title = '所在文件夹';
      folderBtn.addEventListener('click', () => this._revealPaper(entry));
      item.appendChild(folderBtn);

      // Sprint 30c：论文删除是真删除——磁盘文件 + 索引条目一并清理
      const delBtn = document.createElement('button');
      delBtn.className = 'paper-library-delete-btn';
      delBtn.textContent = '🗑️';
      delBtn.title = '删除论文（含磁盘文件）';
      delBtn.addEventListener('click', () => this._deletePaper(entry));
      item.appendChild(delBtn);

      return item;
    },

    /** 删除单篇：确认后删文件 + 清索引，刷新库视图。 */
    async _deletePaper(entry) {
      if (!entry || !entry.url) return;
      const name = entry.title || entry.md_path;
      if (!confirm(`确定删除「${name}」吗？\n磁盘文件将一并删除，不可恢复。`)) return;
      try {
        await invoke('delete_paper', { url: entry.url });
      } catch (e) {
        alert(`删除失败：${(e && e.message) || e}`);
        return;
      }
      await this._refresh();
    },

    /** 删除整个领域：确认后该领域所有论文文件 + 索引条目一并清理。 */
    async _deleteDomain(group) {
      if (!group) return;
      if (!confirm(`确定删除领域「${group.domain}」及其下 ${group.papers.length} 篇论文吗？\n磁盘文件将一并删除，不可恢复。`)) return;
      // 未分类组的领域键是空串（索引中 domain 为空）
      const domain = group.domain === UNCATEGORIZED ? '' : group.domain;
      try {
        await invoke('delete_paper_domain', { domain });
      } catch (e) {
        alert(`删除失败：${(e && e.message) || e}`);
        return;
      }
      await this._refresh();
    },

    async _refresh() {
      if (this._parent) await this.attach(this._parent);
    },

    /** Open a cached paper for reading — 复用 PaperSearch 的 tab 打开路径。 */
    async _openPaper(entry) {
      if (!entry || !entry.md_path) return;
      const mdContent = await invoke('read_text_file', { filePath: entry.md_path });
      if (global.PaperSearch && typeof global.PaperSearch._openImported === 'function') {
        await global.PaperSearch._openImported({
          md_path: entry.md_path,
          md_content: mdContent,
          title: entry.title,
        });
      }
    },

    /** Reveal the paper file in the system file manager. */
    async _revealPaper(entry) {
      if (!entry || !entry.md_path) return;
      try {
        await invoke('show_in_folder', { path: entry.md_path });
      } catch (e) {
        console.warn('[paper-library] show_in_folder failed:', e);
      }
    }
  };

  global.PaperLibrary = PaperLibrary;
  // DomainPicker 复用分组逻辑取已有领域列表
  PaperLibrary.groupByDomain = groupByDomain;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PaperLibrary, groupByDomain };
  }
})(typeof window !== 'undefined' ? window : global);
