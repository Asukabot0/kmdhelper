const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const NodeType = {
  ELEMENT_NODE: 1,
  TEXT_NODE: 3
};

const NodeFilterConsts = {
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  FILTER_SKIP: 3,
  SHOW_ELEMENT: 1
};

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

class MiniNode {
  constructor(type) {
    this.nodeType = type;
    this.parentNode = null;
    this.ownerDocument = null;
  }

  get textContent() {
    if (this.nodeType === NodeType.TEXT_NODE) {
      return this.data;
    }
    if (!this.childNodes) return '';
    let out = '';
    for (const child of this.childNodes) {
      if (child.nodeType === NodeType.TEXT_NODE) {
        out += child.data;
      } else if (child.nodeType === NodeType.ELEMENT_NODE) {
        if (child.tagName === 'BR') {
          out += '\n';
        } else {
          out += child.textContent;
        }
      }
    }
    return out;
  }

  set textContent(value) {
    if (this.nodeType === NodeType.TEXT_NODE) {
      this.data = value;
    }
  }
}

class MiniTextNode extends MiniNode {
  constructor(data) {
    super(NodeType.TEXT_NODE);
    this.data = data;
    this.childNodes = [];
  }
}

class MiniElement extends MiniNode {
  constructor(tagName) {
    super(NodeType.ELEMENT_NODE);
    this.tagName = tagName.toUpperCase();
    this.childNodes = [];
    this.attributes = Object.create(null);
    this.classList = new Set();
  }

  appendChild(node) {
    node.parentNode = this;
    node.ownerDocument = this.ownerDocument;
    this.childNodes.push(node);
    return node;
  }

  getAttribute(name) {
    const key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(this.attributes, key)
      ? this.attributes[key]
      : null;
  }

  setAttribute(name, value) {
    const key = name.toLowerCase();
    this.attributes[key] = value;
    if (key === 'class') {
      this.classList = new Set(value.split(/\s+/).filter(Boolean));
    }
    if (key === 'id') {
      this.id = value;
    }
  }

  hasAttribute(name) {
    const key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(this.attributes, key);
  }

  querySelector(selector) {
    const list = this.querySelectorAll(selector);
    return list.length ? list[0] : null;
  }

  querySelectorAll(selector) {
    const selectors = splitSelectors(selector);
    const results = [];
    walk(this, node => {
      if (node === this) return; // skip self for document equivalent search
      if (node.nodeType !== NodeType.ELEMENT_NODE) return;
      for (const sel of selectors) {
        if (matchesSelector(node, sel)) {
          results.push(node);
          break;
        }
      }
    });
    return results;
  }

  closest(selector) {
    const selectors = splitSelectors(selector);
    let current = this;
    while (current && current.nodeType === NodeType.ELEMENT_NODE) {
      for (const sel of selectors) {
        if (matchesSelector(current, sel)) {
          return current;
        }
      }
      current = current.parentNode;
    }
    return null;
  }
}

class MiniDocument extends MiniElement {
  constructor() {
    super('#document');
    this.ownerDocument = this;
    this.documentElement = null;
    this.body = null;
    this.readyState = 'complete';
    this._listeners = Object.create(null);
  }

  appendChild(node) {
    const appended = super.appendChild(node);
    if (node.tagName === 'HTML') {
      this.documentElement = node;
    }
    if (node.tagName === 'BODY') {
      this.body = node;
    }
    return appended;
  }

  addEventListener(type, cb) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(cb);
  }

  removeEventListener(type, cb) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(fn => fn !== cb);
  }

  dispatchEvent(type) {
    if (!this._listeners[type]) return;
    for (const fn of this._listeners[type]) {
      try { fn(); } catch (e) {}
    }
  }

  getElementById(id) {
    let found = null;
    walk(this, node => {
      if (found) return;
      if (node.nodeType === NodeType.ELEMENT_NODE && node.id === id) {
        found = node;
      }
    });
    return found;
  }
}

function walk(root, cb) {
  const stack = [root];
  while (stack.length) {
    const node = stack.shift();
    cb(node);
    if (node.childNodes && node.childNodes.length) {
      for (const child of node.childNodes) {
        stack.push(child);
      }
    }
  }
}

function splitSelectors(selector) {
  const list = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === '[') {
      depth++;
      current += ch;
    } else if (ch === ']') {
      depth = Math.max(0, depth - 1);
      current += ch;
    } else if (ch === ',' && depth === 0) {
      if (current.trim()) list.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) list.push(current.trim());
  return list.length ? list : ['*'];
}

function matchesSelector(node, selector) {
  if (!selector || selector === '*') return true;
  const parts = selector.trim().split(/\s+/);
  let current = node;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (i === parts.length - 1) {
      if (!matchesSimple(current, part)) {
        return false;
      }
    } else {
      current = findAncestorMatching(current.parentNode, part);
      if (!current) return false;
    }
  }
  return true;
}

function findAncestorMatching(startNode, part) {
  let node = startNode;
  while (node && node.nodeType === NodeType.ELEMENT_NODE) {
    if (matchesSimple(node, part)) return node;
    node = node.parentNode;
  }
  return null;
}

function matchesSimple(node, selector) {
  if (!selector || selector === '*') return true;
  const parsed = parseSimpleSelector(selector);
  if (parsed.tag && node.tagName.toLowerCase() !== parsed.tag) return false;
  if (parsed.id && node.id !== parsed.id) return false;
  if (parsed.classes.length) {
    for (const cls of parsed.classes) {
      if (!node.classList.has(cls)) return false;
    }
  }
  for (const attr of parsed.attrs) {
    const val = node.getAttribute(attr.name);
    if (val == null) return false;
    if (attr.op === '=') {
      if (val !== attr.value) return false;
    } else if (attr.op === '*=') {
      if (!val.includes(attr.value)) return false;
    }
  }
  return true;
}

function parseSimpleSelector(selector) {
  let rest = selector.trim();
  const tagMatch = rest.match(/^[a-zA-Z0-9_-]+/);
  let tag = null;
  if (tagMatch) {
    tag = tagMatch[0].toLowerCase();
    rest = rest.slice(tagMatch[0].length);
  }
  const classes = [];
  let id = null;
  const attrs = [];
  while (rest.length) {
    const ch = rest[0];
    if (ch === '.') {
      rest = rest.slice(1);
      const m = rest.match(/^[a-zA-Z0-9_-]+/);
      if (m) {
        classes.push(m[0]);
        rest = rest.slice(m[0].length);
      }
    } else if (ch === '#') {
      rest = rest.slice(1);
      const m = rest.match(/^[a-zA-Z0-9_-]+/);
      if (m) {
        id = m[0];
        rest = rest.slice(m[0].length);
      }
    } else if (ch === '[') {
      const end = rest.indexOf(']');
      if (end === -1) {
        rest = '';
        break;
      }
      const content = rest.slice(1, end);
      rest = rest.slice(end + 1);
      const attrMatch = content.match(/^([^\s=~^$!*]+)\s*(\*?=)?\s*(.*)$/);
      if (attrMatch) {
        const name = attrMatch[1].toLowerCase();
        const op = attrMatch[2] || null;
        let value = attrMatch[3] || '';
        value = value.trim().replace(/^['"]|['"]$/g, '');
        attrs.push({ name, op, value });
      }
    } else {
      rest = rest.slice(1);
    }
  }
  return { tag, id, classes, attrs };
}

function parseAttributes(str, element) {
  const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>/=`]+)))?/g;
  let match;
  while ((match = attrRegex.exec(str))) {
    const name = match[1];
    const value = decodeEntities(match[3] || match[4] || match[5] || '');
    element.setAttribute(name, value);
  }
}

function parseHTML(html) {
  const doc = new MiniDocument();
  doc.ownerDocument = doc;
  let current = doc;
  const regex = /<!--([\s\S]*?)-->|<!DOCTYPE[\s\S]*?>|<\/?[^>]+>|[^<]+/gi;
  let match;
  while ((match = regex.exec(html))) {
    const token = match[0];
    if (!token) continue;
    if (token.startsWith('<!--') || token.startsWith('<!DOCTYPE')) {
      continue;
    }
    if (token[0] === '<') {
      if (token[1] === '/') {
        const tagName = token.slice(2, -1).trim().toLowerCase();
        if (!tagName) continue;
        let node = current;
        while (node && node !== doc && node.tagName.toLowerCase() !== tagName) {
          node = node.parentNode;
        }
        if (node && node !== doc) {
          current = node.parentNode || doc;
        }
      } else {
        const parts = token.slice(1, -1).trim();
        const spaceIndex = parts.search(/\s/);
        const tagName = (spaceIndex === -1 ? parts : parts.slice(0, spaceIndex)).toLowerCase();
        const attrPart = spaceIndex === -1 ? '' : parts.slice(spaceIndex + 1);
        const el = new MiniElement(tagName);
        el.ownerDocument = doc;
        parseAttributes(attrPart, el);
        current.appendChild(el);
        if (VOID_TAGS.has(tagName)) {
          continue;
        }
        current = el;
      }
    } else {
      const text = decodeEntities(token);
      if (!text) continue;
      const textNode = new MiniTextNode(text);
      textNode.ownerDocument = doc;
      current.appendChild(textNode);
    }
  }
  return doc;
}

class LocalStorageMock {
  constructor() {
    this._map = new Map();
  }
  getItem(key) {
    return this._map.has(key) ? this._map.get(key) : null;
  }
  setItem(key, value) {
    this._map.set(key, String(value));
  }
  removeItem(key) {
    this._map.delete(key);
  }
  clear() {
    this._map.clear();
  }
}

function createTestWindow(html) {
  const document = parseHTML(html);
  if (!document.body) {
    // ensure body exists for content script expectations
    const body = new MiniElement('body');
    body.ownerDocument = document;
    document.appendChild(body);
    document.body = body;
  }
  const window = {
    document,
    Node: NodeType,
    NodeFilter: NodeFilterConsts,
    navigator: { userAgent: 'mini-dom' },
    localStorage: new LocalStorageMock(),
    alert: function () {},
    __kmdhelperTestMode: false
  };
  document.defaultView = window;
  return { window };
}

module.exports = {
  createTestWindow,
  NodeType,
  NodeFilterConsts
};
