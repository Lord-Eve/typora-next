/**
 * Settings Panel — grouped settings UI (AI / 论文服务 / 外观).
 *
 * Extracted from main.js (refactor):
 *   - groups settings into tabs instead of one flat scrollable list
 *   - save() merges with the current config so UI state fields
 *     (sidebar_collapsed / sidebar_active_tab / last_file) are never
 *     wiped by a full-overwrite save (previous saveSettings bug)
 *   - Word 导出模板 moved from localStorage into the main config
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

  const GROUPS = [
    { id: 'ai', title: 'AI' },
    { id: 'papers', title: '论文服务' },
    { id: 'appearance', title: '外观' },
    { id: 'misc', title: '通用' }
  ];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function labeledItem(labelText, input, hintId) {
    const item = el('div', 'setting-item');
    const label = el('label', 'setting-label', labelText);
    item.appendChild(label);
    item.appendChild(input);
    if (hintId) {
      const hint = el('div', 'setting-hint');
      hint.id = hintId;
      item.appendChild(hint);
    }
    return item;
  }

  function textInput(id, placeholder, password) {
    const input = el('input', 'setting-input');
    input.id = id;
    input.type = password ? 'password' : 'text';
    if (placeholder) input.placeholder = placeholder;
    return input;
  }

  const SettingsPanel = {
    _root: null,
    _mounted: false,
    _resolvedPapersDir: null,

    mount(root) {
      if (this._mounted && this._root === root) return;
      this._root = root;
      this._mounted = true;
      root.innerHTML = '';

      const tabBar = el('div', 'settings-tabs');
      GROUPS.forEach((group) => {
        const tab = el('button', 'settings-tab', group.title);
        tab.setAttribute('data-group', group.id);
        tab.addEventListener('click', () => this._activate(group.id));
        tabBar.appendChild(tab);
      });
      root.appendChild(tabBar);

      root.appendChild(this._buildAiGroup());
      root.appendChild(this._buildPapersGroup());
      root.appendChild(this._buildAppearanceGroup());
      root.appendChild(this._buildMiscGroup());

      const footer = el('div', 'settings-actions');
      const saveBtn = el('button', 'settings-save-btn', '保存');
      saveBtn.id = 'settingsSaveBtn';
      saveBtn.addEventListener('click', () => this.save());
      footer.appendChild(saveBtn);
      root.appendChild(footer);

      this._activate('ai');
    },

    _activate(groupId) {
      const tabs = this._root.querySelectorAll('.settings-tab');
      tabs.forEach((tab) => {
        const active = tab.getAttribute('data-group') === groupId;
        tab.classList.toggle('active', active);
      });
      GROUPS.forEach((group) => {
        const section = this._root.querySelector(`#group-${group.id}`);
        if (section) section.style.display = group.id === groupId ? '' : 'none';
      });
    },

    _buildGroup(id, title) {
      const group = el('div', 'settings-group');
      group.id = `group-${id}`;
      group.appendChild(el('div', 'settings-group-title', title));
      return group;
    },

    _buildAiGroup() {
      const group = this._buildGroup('ai', 'AI');

      const provider = el('select', 'setting-select');
      provider.id = 'settingApiProvider';
      [['anthropic', 'Anthropic'], ['openai', 'OpenAI']].forEach(([value, text]) => {
        const opt = el('option', '', text);
        opt.setAttribute('value', value);
        provider.appendChild(opt);
      });
      group.appendChild(labeledItem('API 格式', provider));

      group.appendChild(labeledItem('Base URL', textInput('settingAiBaseUrl', '留空使用默认地址')));

      group.appendChild(labeledItem('模型名称', textInput('settingModel', 'claude-3-5-haiku-20241022')));

      const apiKey = textInput('settingApiKey', '', true);
      group.appendChild(labeledItem('API Key', apiKey, 'settingApiKeyHint'));
      const hint = group.querySelector('#settingApiKeyHint');
      hint.textContent = '用于 AI 功能（Mermaid 修复、论文导读、章节生成等）';

      const testRow = el('div', 'setting-item');
      const testBtn = el('button', 'settings-test-btn', '测试连接');
      testBtn.id = 'settingsTestBtn';
      testBtn.addEventListener('click', () => this.testConnection());
      testRow.appendChild(testBtn);
      const testResult = el('span', 'settings-test-result', '');
      testResult.id = 'testResult';
      testRow.appendChild(testResult);
      group.appendChild(testRow);

      return group;
    },

    _buildPapersGroup() {
      const group = this._buildGroup('papers', '论文服务');

      group.appendChild(labeledItem('minerU API Token', textInput('settingMineruToken', '', true)));
      group.appendChild(labeledItem('minerU Base URL', textInput('settingMineruBaseUrl', 'https://mineru.net')));

      const model = el('select', 'setting-select');
      model.id = 'settingMineruModel';
      [['vlm', 'vlm'], ['pipeline', 'pipeline']].forEach(([value, text]) => {
        const opt = el('option', '', text);
        opt.setAttribute('value', value);
        model.appendChild(opt);
      });
      group.appendChild(labeledItem('minerU 模型版本', model));

      group.appendChild(labeledItem('AnySearch API Key', textInput('settingAnysearchKey', '', true)));
      const hint = el('div', 'setting-hint', '论文搜索用，留空则匿名搜索（限额较低）');
      group.appendChild(hint);

      // 论文库根目录：只读输入框 + 系统目录选择对话框 + 打开所在文件夹
      const dirInput = textInput('settingPapersDir', '默认（应用数据目录）');
      dirInput.readOnly = true;
      const pickBtn = el('button', 'setting-pick-btn', '选择…');
      pickBtn.id = 'settingPapersDirPick';
      pickBtn.addEventListener('click', async () => {
        try {
          const picked = await invoke('pick_papers_dir');
          if (picked) dirInput.value = picked;
        } catch (e) {
          // 用户取消或对话框失败：保持原值
        }
      });
      const openBtn = el('button', 'setting-pick-btn', '📂 打开');
      openBtn.id = 'settingPapersDirOpen';
      openBtn.addEventListener('click', async () => {
        // 优先打开输入框里（未保存的）新选择，否则打开生效中的目录
        const target = (dirInput.value || '').trim() || this._resolvedPapersDir;
        if (!target) return;
        try {
          await invoke('open_folder', { path: target });
        } catch (e) {
          const hint = this._root.querySelector('#settingPapersDirHint');
          if (hint) hint.textContent = `打开失败：${(e && e.message) || e}`;
        }
      });
      const resetBtn = el('button', 'setting-pick-btn', '恢复默认');
      resetBtn.id = 'settingPapersDirReset';
      resetBtn.addEventListener('click', () => {
        dirInput.value = '';
      });
      const dirRow = el('div', 'setting-dir-row');
      dirRow.appendChild(dirInput);
      dirRow.appendChild(pickBtn);
      dirRow.appendChild(openBtn);
      dirRow.appendChild(resetBtn);
      group.appendChild(labeledItem('论文库根目录', dirRow));
      // hint 动态化——显示解析后的实际目录，默认位置不再是谜
      const dirHint = el('div', 'setting-hint', '缓存的论文按搜索领域自动分目录存放（根目录/领域/年月），留空用默认位置');
      dirHint.id = 'settingPapersDirHint';
      group.appendChild(dirHint);

      return group;
    },

    /** 拉取后端解析出的生效论文目录，更新提示（load/save 后都要刷新）。 */
    async _refreshPapersDirHint() {
      try {
        this._resolvedPapersDir = await invoke('get_papers_dir');
        const hint = this._root && this._root.querySelector('#settingPapersDirHint');
        if (hint && this._resolvedPapersDir) {
          hint.textContent = `当前目录：${this._resolvedPapersDir}（缓存按搜索领域分目录：领域/年月）`;
        }
      } catch (e) {
        // 解析失败静默降级为静态提示
      }
    },

    _buildAppearanceGroup() {
      const group = this._buildGroup('appearance', '外观');

      const theme = el('select', 'setting-select');
      theme.id = 'settingTheme';
      [['', '跟随系统'], ['light', '浅色'], ['dark', '深色']].forEach(([value, text]) => {
        const opt = el('option', '', text);
        opt.setAttribute('value', value);
        theme.appendChild(opt);
      });
      group.appendChild(labeledItem('主题', theme));

      const cursors = [
        ['', '系统默认'], ['pencil', '铅笔'], ['highlighter', '荧光笔'], ['pen', '圆珠笔'],
        ['cat', '猫咪'], ['microphone', '麦克风'], ['rocket', '火箭'], ['falcon9', '猎鹰九号'],
        ['wand', '魔法棒'], ['leaf', '叶子'], ['star', '星星'], ['coffee', '咖啡杯'],
        ['bulb', '灯泡']
      ];
      const cursor = el('select', 'setting-select');
      cursor.id = 'settingCustomCursor';
      cursors.forEach(([value, text]) => {
        const opt = el('option', '', text);
        opt.setAttribute('value', value);
        cursor.appendChild(opt);
      });
      group.appendChild(labeledItem('鼠标光标', cursor));

      return group;
    },

    _buildMiscGroup() {
      const group = this._buildGroup('misc', '通用');

      const onboardingRow = el('div', 'setting-item');
      const onboardingBtn = el('button', 'settings-test-btn', '重新显示引导');
      onboardingBtn.id = 'restartOnboardingBtn';
      onboardingBtn.addEventListener('click', () => {
        if (global.TyporaNext && typeof global.TyporaNext.restartOnboarding === 'function') {
          global.TyporaNext.restartOnboarding();
        }
      });
      onboardingRow.appendChild(onboardingBtn);
      onboardingRow.appendChild(el('span', 'setting-hint', '再次显示工具栏功能介绍'));
      group.appendChild(onboardingRow);

      const wordTpl = el('input', 'setting-checkbox');
      wordTpl.id = 'settingWordTemplate';
      wordTpl.type = 'checkbox';
      group.appendChild(labeledItem('Word 导出模板', wordTpl));
      group.appendChild(el('span', 'setting-hint', '启用后每次导出 Word 时可选择模板 .docx 文件控制输出样式'));

      const aboutRow = el('div', 'settings-about-link');
      const aboutBtn = el('span', 'about-link-text', '关于 Typora Next');
      aboutBtn.id = 'settingsAboutBtn';
      aboutBtn.addEventListener('click', () => {
        if (global.TyporaNext && typeof global.TyporaNext.openAbout === 'function') {
          global.TyporaNext.openAbout();
        }
      });
      aboutRow.appendChild(aboutBtn);
      group.appendChild(aboutRow);

      return group;
    },

    async load(config) {
      const cfg = config || {};
      const set = (id, value) => {
        const input = this._root.querySelector(`#${id}`);
        if (input) input.value = value || '';
      };
      set('settingApiProvider', cfg.ai_provider || 'anthropic');
      set('settingAiBaseUrl', cfg.ai_base_url);
      set('settingModel', cfg.model);
      set('settingApiKey', cfg.api_key);
      set('settingMineruToken', cfg.mineru_api_token);
      set('settingMineruBaseUrl', cfg.mineru_base_url);
      set('settingMineruModel', cfg.mineru_model_version || 'vlm');
      set('settingAnysearchKey', cfg.anysearch_api_key);
      set('settingPapersDir', cfg.papers_root || '');
      set('settingTheme', cfg.theme);
      set('settingCustomCursor', cfg.custom_cursor);
      await this._refreshPapersDirHint();

      const wordTpl = this._root.querySelector('#settingWordTemplate');
      if (wordTpl) {
        let value = cfg.word_export_use_template;
        // 旧版本存 localStorage，迁移一次
        if (value === undefined || value === null) {
          try {
            const legacy = global.localStorage && global.localStorage.getItem('wordExportUseTemplate');
            value = legacy === 'true';
          } catch (e) {
            value = false;
          }
        }
        wordTpl.checked = !!value;
      }
    },

    collect() {
      const val = (id) => {
        const input = this._root.querySelector(`#${id}`);
        return input ? input.value.trim() : '';
      };
      const wordTpl = this._root.querySelector('#settingWordTemplate');
      return {
        api_key: val('settingApiKey') || null,
        ai_provider: val('settingApiProvider') || 'anthropic',
        ai_base_url: val('settingAiBaseUrl') || null,
        model: val('settingModel') || null,
        mineru_api_token: val('settingMineruToken') || null,
        mineru_base_url: val('settingMineruBaseUrl') || null,
        mineru_model_version: val('settingMineruModel') || null,
        anysearch_api_key: val('settingAnysearchKey') || null,
        papers_root: val('settingPapersDir') || null,
        theme: val('settingTheme') || null,
        custom_cursor: val('settingCustomCursor') || null,
        word_export_use_template: !!(wordTpl && wordTpl.checked)
      };
    },

    /**
     * Merge-then-save: fetch current config first so UI state fields
     * (sidebar_collapsed / sidebar_active_tab / last_file) survive the
     * full-overwrite set_config.
     */
    async save() {
      const current = await invoke('get_config') || {};
      const config = Object.assign({}, current, this.collect());
      await invoke('set_config', { config });
      await this._refreshPapersDirHint();
      if (global.TyporaNext && typeof global.TyporaNext.onSettingsSaved === 'function') {
        global.TyporaNext.onSettingsSaved(config);
      }
      return config;
    },

    async testConnection() {
      const result = this._root.querySelector('#testResult');
      try {
        const cfg = this.collect();
        await invoke('test_llm_config', {
          config: {
            api_key: cfg.api_key,
            ai_provider: cfg.ai_provider,
            ai_base_url: cfg.ai_base_url,
            model: cfg.model
          }
        });
        if (result) result.textContent = '连接成功';
      } catch (err) {
        if (result) result.textContent = `连接失败：${(err && err.message) || err}`;
      }
    }
  };

  global.SettingsPanel = SettingsPanel;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SettingsPanel };
  }
})(typeof window !== 'undefined' ? window : global);
