/**
 * Minimal mock DOM for testing mode-integration.js without jsdom
 * Supports: createElement, getElementById, querySelector, querySelectorAll,
 * innerHTML parsing (simple), classList, dataset, style, addEventListener, click
 */

function buildMockDOM() {
  const allElements = [];

  function createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      _innerHTML: '',
      _textContent: '',
      _classes: [],
      _attrs: {},
      _dataset: {},
      _listeners: {},
      _parent: null,
      _removed: false,
      _children: [],

      style: {
        get cssText() {
          return Object.entries(el.style)
            .filter(([k]) => k !== 'cssText')
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ');
        },
        set cssText(v) {
          // Clear existing styles (except cssText getter/setter)
          Object.keys(el.style).forEach(k => {
            if (k !== 'cssText') delete el.style[k];
          });
          if (!v) return;
          v.split(';').forEach(rule => {
            const idx = rule.indexOf(':');
            if (idx > 0) {
              const key = rule.slice(0, idx).trim();
              const val = rule.slice(idx + 1).trim();
              if (key) el.style[key] = val;
            }
          });
        }
      },

      get classList() {
        const self = el;
        return {
          add(c) { if (!self._classes.includes(c)) self._classes.push(c); },
          remove(c) { self._classes = self._classes.filter(x => x !== c); },
          contains(c) { return self._classes.includes(c); },
          toggle(c, force) {
            const want = force === undefined ? !self.classList.contains(c) : !!force;
            want ? self.classList.add(c) : self.classList.remove(c);
          }
        };
      },

      get className() { return el._classes.join(' '); },
      set className(v) { el._classes = v.split(/\s+/).filter(Boolean); },

      get dataset() {
        const self = el;
        return new Proxy({}, {
          get(_, p) { return self._dataset[p]; },
          set(_, p, v) { self._dataset[p] = v; return true; }
        });
      },

      setAttribute(k, v) { el._attrs[k] = String(v); },
      getAttribute(k) { return el._attrs[k] || null; },
      removeAttribute(k) { delete el._attrs[k]; },

      appendChild(c) {
        if (c._parent) c._parent.removeChild(c);
        c._parent = el;
        el._children.push(c);
        return c;
      },

      insertBefore(node, ref) {
        if (node._parent) node._parent.removeChild(node);
        const pos = ref ? el._children.indexOf(ref) : -1;
        node._parent = el;
        if (pos >= 0) el._children.splice(pos, 0, node);
        else el._children.push(node);
        return node;
      },

      removeChild(c) {
        el._children = el._children.filter(x => x !== c);
        if (c._parent === el) c._parent = null;
      },

      contains(target) {
        if (target === el) return true;
        return el._children.some(c => c.contains(target));
      },

      remove() {
        if (el._parent) el._parent.removeChild(el);
        el._removed = true;
      },

      replaceWith(...nodes) {
        const parent = el._parent;
        if (!parent) return;
        const pos = parent._children.indexOf(el);
        parent._children.splice(pos, 1, ...nodes);
        nodes.forEach(n => { n._parent = parent; });
        el._parent = null;
      },

      get childNodes() { return el._children.slice(); },
      get firstChild() { return el._children[0] || null; },
      get firstElementChild() { return el._children[0] || null; },

      scrollIntoView() { el._scrolledIntoView = (el._scrolledIntoView || 0) + 1; },

      get isConnected() { return el._parent !== null && !el._removed; },

      addEventListener(ev, fn) {
        (el._listeners[ev] = el._listeners[ev] || []).push(fn);
      },

      removeEventListener(ev, fn) {
        if (el._listeners[ev]) {
          el._listeners[ev] = el._listeners[ev].filter(f => f !== fn);
        }
      },

      // Walk up self + ancestors, return first node matching sel (real-DOM closest)
      closest(sel) {
        let node = el;
        while (node) {
          if (matchesSelector(node, sel)) return node;
          node = node._parent;
        }
        return null;
      },

      // Bubble like the real DOM: fire on self, then each ancestor, so
      // event-delegation handlers (listener on a parent) are exercised.
      click() {
        const ev = { target: el };
        let node = el;
        while (node) {
          ev.currentTarget = node;
          (node._listeners.click || []).forEach(fn => fn(ev));
          node = node._parent;
        }
      },

      querySelector(sel) {
        for (const c of el._children) {
          if (matchesSelector(c, sel)) return c;
          const found = c.querySelector(sel);
          if (found) return found;
        }
        return null;
      },

      querySelectorAll(sel) {
        const out = [];
        for (const c of el._children) {
          if (matchesSelector(c, sel)) out.push(c);
          out.push(...c.querySelectorAll(sel));
        }
        return out;
      },

      get innerHTML() { return el._innerHTML; },
      set innerHTML(v) {
        el._innerHTML = v;
        el._children = [];
        parseSimpleHTML(v, el);
      },

      get textContent() { return el._textContent; },
      set textContent(v) { el._textContent = v; }
    };

    allElements.push(el);
    return el;
  }

  function matchesSelector(el, sel) {
    if (!el) return false;

    // Handle :not(...)
    const notMatch = sel.match(/(.*):not\((.+)\)/);
    if (notMatch) {
      return matchesSelector(el, notMatch[1]) && !matchesSelector(el, notMatch[2]);
    }

    // Handle compound .class[attr="v"] (split and match each part)
    const compound = sel.match(/^(\.[a-zA-Z-]+)(\[.+\])$/);
    if (compound) {
      return matchesSelector(el, compound[1]) && matchesSelector(el, compound[2]);
    }

    if (sel.startsWith('#')) return (el._attrs.id || el.id) === sel.slice(1);
    if (sel.startsWith('.')) return el._classes.includes(sel.slice(1));
    if (sel.startsWith('[')) {
      const m = sel.match(/\[(.+?)(?:=(["']?)(.+?)\2)?\]/);
      if (m) {
        const attr = m[1];
        const val = m[3];
        const datasetKey = attr.startsWith('data-') ? attr.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase()) : null;
        if (val !== undefined) {
          return el._attrs[attr] === val || el._dataset[attr] === val || (datasetKey && el._dataset[datasetKey] === val);
        }
        return attr in el._attrs || attr in el._dataset || (datasetKey && datasetKey in el._dataset);
      }
    }
    if (sel.toLowerCase() === el.tagName.toLowerCase()) return true;
    return false;
  }

  const VOID_TAGS = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);

  // Stack-based tokenizer: unlike the previous lazy-regex version, this
  // handles arbitrarily nested same-tag elements (<div><div>..</div>..</div>)
  function parseSimpleHTML(html, parent) {
    const tokenRe = /<(\/)?([a-zA-Z0-9]+)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/g;
    const stack = [{ el: parent }];
    let m;
    while ((m = tokenRe.exec(html)) !== null) {
      const [, closing, tag, attrsStr, text] = m;

      if (text !== undefined) {
        const t = text.replace(/^\s+|\s+$/g, '');
        const cur = stack[stack.length - 1].el;
        if (t && cur._children.length === 0) cur._textContent = t;
        continue;
      }

      const tagName = tag.toLowerCase();

      if (closing) {
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].tag === tagName) { stack.length = i; break; }
        }
        continue;
      }

      const child = createElement(tag);

      const attrRegex = /([a-zA-Z-]+)=(?:"([^"]*)"|'([^']*)')/g;
      let a;
      while ((a = attrRegex.exec(attrsStr)) !== null) {
        const name = a[1];
        const value = a[2] !== undefined ? a[2] : a[3];
        if (name === 'id') child._attrs.id = value;
        else if (name === 'class') child._classes.push(...value.split(/\s+/).filter(Boolean));
        else if (name === 'style') {
          value.split(';').forEach(s => {
            const [k, v] = s.split(':').map(x => x.trim());
            if (k && v) child.style[k] = v;
          });
        }
        else child._attrs[name] = value;
      }

      const dataAttrRegex = /data-([a-zA-Z-]+)=(?:"([^"]*)"|'([^']*)')/g;
      let d;
      while ((d = dataAttrRegex.exec(attrsStr)) !== null) {
        const key = d[1].replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        child._dataset[key] = d[2] !== undefined ? d[2] : d[3];
      }

      stack[stack.length - 1].el.appendChild(child);
      if (!VOID_TAGS.has(tagName)) stack.push({ el: child, tag: tagName });
    }
  }

  const body = createElement('body');
  body._attrs.id = 'body';

  const docListeners = {};

  const doc = {
    createElement,
    createElementNS: createElement,
    body,

    getElementById(id) {
      for (const el of allElements) {
        if ((el._attrs.id || el.id) === id && !el._removed) return el;
      }
      return null;
    },

    querySelector(sel) {
      if (sel.startsWith('#')) return doc.getElementById(sel.slice(1));
      return body.querySelector(sel);
    },

    querySelectorAll(sel) {
      if (sel.startsWith('#')) {
        const el = doc.getElementById(sel.slice(1));
        return el ? [el] : [];
      }
      return body.querySelectorAll(sel);
    },

    addEventListener(ev, fn) {
      (docListeners[ev] = docListeners[ev] || []).push(fn);
    },

    removeEventListener(ev, fn) {
      if (docListeners[ev]) {
        docListeners[ev] = docListeners[ev].filter(f => f !== fn);
      }
    },

    // Test helper: dispatch event to document listeners
    _dispatchDocEvent(ev, data) {
      (docListeners[ev] || []).forEach(fn => fn(data));
    }
  };

  return { document: doc, body, createElement, allElements };
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildMockDOM };
}
