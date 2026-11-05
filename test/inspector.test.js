'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.dataset = {};
    this.className = ''; this.textContent = '';
    this.classList = { toggle: name => {
      const classes = new Set(this.className.split(' '));
      if (classes.has(name)) classes.delete(name); else classes.add(name);
      this.className = [...classes].join(' '); return classes.has(name);
    } };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, fn) { this.listeners[key] = fn; }
  all() { return [this, ...this.children.flatMap(c => c.all())]; }
}

function mount(readPng) {
  const elements = Object.fromEntries(['content', 'status', 'reload'].map(id => [id, new Element('div')]));
  const hooks = {}, copied = [];
  const eagle = {
    item: { getSelected: async () => [{ filePath: 'local-test.png' }] },
    clipboard: { writeText: async text => copied.push(text) }, app: { theme: 'DARK' },
    onPluginCreate: fn => { hooks.create = fn; }, onPluginShow: fn => { hooks.show = fn; }, onThemeChanged: fn => { hooks.theme = fn; }
  };
  const document = { getElementById: id => elements[id], createElement: tag => new Element(tag), documentElement: new Element('html') };
  const modules = { './src/png.js': { readPng }, './src/metadata.js': require('../src/metadata.js') };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/inspector.js'), 'utf8'), {
    document, eagle, require: name => modules[name], localStorage: { getItem: () => null, setItem() {} },
    matchMedia: () => ({ matches: false })
  });
  return { elements, hooks, copied, eagle, document };
}

test('prompt copy uses full unescaped text and expand preserves its content', async () => {
  const positive = '<script>alert(1)</script>\n日本語\\path\n' + 'landscape '.repeat(100);
  const app = mount(async () => ({ texts: { parameters: `${positive}\nSteps: 20, Seed: 0` }, width: 1, height: 1 }));
  await app.hooks.create();
  const all = app.elements.content.all();
  const pre = all.find(e => e.tagName === 'pre');
  assert.equal(pre.textContent, positive);
  const copy = all.find(e => e.attributes['aria-label'] === 'ポジティブプロンプトをコピー');
  await copy.listeners.click();
  assert.equal(app.copied[0], positive);
  const expand = all.find(e => e.textContent === '全文を表示');
  expand.listeners.click();
  assert.equal(expand.attributes['aria-expanded'], 'true');
  assert.equal(pre.textContent, positive);
  app.eagle.clipboard.writeText = async () => { throw new Error('denied'); };
  await copy.listeners.click();
  assert.match(app.elements.status.textContent, /コピーできません/);
  app.hooks.theme('LIGHT');
  assert.equal(app.document.documentElement.dataset.theme, 'light');
});

test('newer image selection wins over an older unfinished read', async () => {
  let complete;
  let count = 0;
  const app = mount(async () => {
    if (++count === 1) return new Promise(resolve => { complete = resolve; });
    return { texts: { parameters: 'new image\nSteps: 1' }, width: 1, height: 1 };
  });
  const old = app.hooks.create();
  while (!complete) await new Promise(resolve => setImmediate(resolve));
  await app.hooks.show();
  complete({ texts: { parameters: 'old image\nSteps: 1' }, width: 1, height: 1 });
  await old;
  assert.equal(app.elements.content.all().find(e => e.tagName === 'pre').textContent, 'new image');
});
