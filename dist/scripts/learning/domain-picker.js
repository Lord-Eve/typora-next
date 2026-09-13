/**
 * Domain Picker — 导入论文前的领域选择弹窗
 *
 * 背景：论文分类（domain）此前只能由搜索关键词隐式携带——粘贴 URL /
 * 本地 PDF 导入的论文永远落在「未分类」。用户拍板：导入时问一次。
 *
 * pick() 的 Promise 语义（调用方靠这三态区分）：
 *   - 已有领域 / 新领域 → resolve(string)   照常导入，domain 随命令下发
 *   - 「暂不分类」       → resolve(null)     照常导入，domain = null
 *   - 「取消」/ 点遮罩   → resolve(undefined) 中止导入
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

  const DomainPicker = {
    /**
     * 弹出领域选择。已有领域来自论文库索引（未分类不列为选项）。
     * @returns Promise<string|null|undefined>
     */
    async pick() {
      let domains = [];
      try {
        const entries = (await invoke('list_imported_papers')) || [];
        const groupByDomain = global.PaperLibrary && global.PaperLibrary.groupByDomain;
        const groups = groupByDomain ? groupByDomain(entries) : [];
        domains = groups.map((g) => g.domain).filter((d) => d && d !== '未分类');
      } catch (e) {
        // 索引不可用时退化为只有新领域输入，不阻断导入
        domains = [];
      }

      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'domain-picker-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'domain-picker';

        const title = document.createElement('div');
        title.className = 'domain-picker-title';
        title.textContent = '选择论文领域';
        dialog.appendChild(title);

        const hint = document.createElement('div');
        hint.className = 'domain-picker-hint';
        hint.textContent = '论文将保存到 根目录/领域/年月 下';
        dialog.appendChild(hint);

        const chips = document.createElement('div');
        chips.className = 'domain-picker-chips';
        dialog.appendChild(chips);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'domain-picker-input';
        input.placeholder = '或输入新领域…';
        dialog.appendChild(input);

        const actions = document.createElement('div');
        actions.className = 'domain-picker-actions';

        const okBtn = document.createElement('button');
        okBtn.className = 'domain-picker-ok';
        okBtn.textContent = '确定';
        okBtn.disabled = true;

        const skipBtn = document.createElement('button');
        skipBtn.className = 'domain-picker-skip';
        skipBtn.textContent = '暂不分类';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'domain-picker-cancel';
        cancelBtn.textContent = '取消';

        actions.appendChild(okBtn);
        actions.appendChild(skipBtn);
        actions.appendChild(cancelBtn);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);

        let selected = null;
        const done = (value) => {
          overlay.remove();
          resolve(value);
        };
        const refreshOk = () => {
          okBtn.disabled = !(input.value.trim() || selected);
        };

        domains.forEach((name) => {
          const chip = document.createElement('button');
          chip.className = 'domain-picker-chip';
          chip.textContent = name;
          chip.addEventListener('click', () => {
            selected = name;
            input.value = '';
            chips.querySelectorAll('.domain-picker-chip').forEach((c) => {
              c.classList.toggle('selected', c === chip);
            });
            refreshOk();
          });
          chips.appendChild(chip);
        });

        // 输入新领域时已有领域选择失效（输入优先）
        input.addEventListener('input', () => {
          if (input.value.trim()) {
            selected = null;
            chips.querySelectorAll('.domain-picker-chip').forEach((c) => {
              c.classList.remove('selected');
            });
          }
          refreshOk();
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && input.value.trim()) done(input.value.trim());
        });

        okBtn.addEventListener('click', () => {
          const value = input.value.trim() || selected;
          if (value) done(value);
        });
        skipBtn.addEventListener('click', () => done(null));
        cancelBtn.addEventListener('click', () => done(undefined));
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) done(undefined);
        });

        document.body.appendChild(overlay);
      });
    }
  };

  global.DomainPicker = DomainPicker;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DomainPicker };
  }
})(typeof window !== 'undefined' ? window : global);
