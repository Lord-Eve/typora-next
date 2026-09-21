/**
 * Typora-style UI layer (pairs with styles/typora-ui.css)
 *
 * - Adds a Typora-like status bar at the bottom of the content area
 *   and moves the existing sidebar / source-mode toggles into it
 *   (DOM nodes are moved, not cloned, so main.js listeners keep working).
 * - Shows a live word count (CJK characters + latin words).
 * - Renames the sidebar "目录" tab to "大纲" as in Typora.
 *
 * The data-ui attribute itself is set by an inline script in <head>
 * (to avoid a flash of the old style). Toggle with Ctrl+Shift+U.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ui-style';

  function isTypora() {
    return document.documentElement.getAttribute('data-ui') === 'typora';
  }

  function setStyle(style) {
    if (style === 'typora') document.documentElement.setAttribute('data-ui', 'typora');
    else document.documentElement.removeAttribute('data-ui');
    try { localStorage.setItem(STORAGE_KEY, style); } catch (e) { /* ignore */ }
    placeControls();
  }

  // ---------- Word count ----------
  function countText(text) {
    var cjk = (text.match(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g) || []).length;
    var latin = (text
      .replace(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g, ' ')
      .match(/[A-Za-z0-9À-ɏ]+(?:['’-][A-Za-z0-9À-ɏ]+)*/g) || []).length;
    return { cjk: cjk, latin: latin, total: cjk + latin, chars: text.replace(/\s/g, '').length };
  }

  function visibleText(root) {
    if (!root) return '';
    var clone = root.cloneNode(true);
    // Drop KaTeX's hidden MathML copy and UI-only bits so formulas aren't double counted
    clone.querySelectorAll('.katex-mathml, .welcome-message, .copy-btn, .code-copy-btn, script, style')
      .forEach(function (n) { n.remove(); });
    return clone.textContent || '';
  }

  var countEl = null;
  var pending = null;

  function updateCount() {
    pending = null;
    if (!countEl) return;
    var source = document.getElementById('sourceView');
    var body = document.getElementById('markdownBody');
    var inSource = source && source.style.display !== 'none';
    var text = inSource ? (document.getElementById('sourceCode') || {}).textContent || '' : visibleText(body);
    var hasDoc = body && !body.querySelector('.welcome-message');
    if (!hasDoc && !inSource) {
      countEl.textContent = '';
      countEl.removeAttribute('title');
      return;
    }
    var c = countText(text);
    countEl.textContent = c.total.toLocaleString() + ' 字';
    countEl.title = '中日韩文字 ' + c.cjk + '\n英文单词 ' + c.latin + '\n字符（不含空白） ' + c.chars;
  }

  function scheduleCount() {
    if (pending) return;
    pending = setTimeout(updateCount, 250);
  }

  // ---------- Status bar ----------
  var bar = null;
  var homes = {}; // original parents, so the old layout can be restored

  function buildBar() {
    var area = document.getElementById('contentArea');
    if (!area || bar) return;
    bar = document.createElement('footer');
    bar.className = 'ty-statusbar';
    bar.id = 'tyStatusbar';
    bar.innerHTML =
      '<div class="ty-statusbar-left"></div>' +
      '<div class="ty-statusbar-right"><span class="ty-wordcount" id="tyWordCount"></span></div>';
    area.appendChild(bar);
    countEl = bar.querySelector('#tyWordCount');
  }

  function remember(el) {
    if (el && !homes[el.id]) homes[el.id] = { parent: el.parentNode, next: el.nextSibling };
  }

  function placeControls() {
    buildBar();
    var sidebarToggle = document.getElementById('sidebarToggle');
    var sourceToggle = document.getElementById('sourceToggle');
    [sidebarToggle, sourceToggle].forEach(remember);
    var left = bar.querySelector('.ty-statusbar-left');
    var right = bar.querySelector('.ty-statusbar-right');

    if (isTypora()) {
      if (sidebarToggle) left.appendChild(sidebarToggle);
      if (sourceToggle) {
        right.insertBefore(sourceToggle, right.firstChild);
        sourceToggle.setAttribute('data-tooltip', '源代码模式');
      }
    } else {
      [sidebarToggle, sourceToggle].forEach(function (el) {
        var h = el && homes[el.id];
        if (h) h.parent.insertBefore(el, h.next && h.next.parentNode === h.parent ? h.next : null);
      });
    }
    updateCount();
  }

  function init() {
    var tocTab = document.getElementById('tabToc');
    if (tocTab && tocTab.textContent.trim() === '目录') tocTab.textContent = '大纲';

    placeControls();

    var watch = ['markdownBody', 'sourceCode', 'sourceView'];
    var mo = new MutationObserver(scheduleCount);
    watch.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) mo.observe(el, { childList: true, subtree: true, characterData: true, attributes: id === 'sourceView' });
    });

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
        setStyle(isTypora() ? 'classic' : 'typora');
      }
    });
  }

  window.TyporaUI = { setStyle: setStyle, countText: countText };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
