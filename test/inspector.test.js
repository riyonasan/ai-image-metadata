'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.dataset = {};
    this.className = ''; this.textContent = '';
    this.clientWidth = 280; this.scrollHeight = 0;
    this.classList = { toggle: name => {
      const classes = new Set(this.className.split(' '));
      if (classes.has(name)) classes.delete(name); else classes.add(name);
      this.className = [...classes].join(' '); return classes.has(name);
    } };
  }
  append(...children) { for (const child of children) child.parentElement = this; this.children.push(...children); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  get nextElementSibling() { return this.parentElement.children[this.parentElement.children.indexOf(this) + 1]; }
  querySelectorAll(selector) { return this.all().filter(e => e.className.split(' ').includes(selector.slice(1))); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, fn) { this.listeners[key] = fn; }
  all() { return [this, ...this.children.flatMap(c => c.all())]; }
}

function mount(readPng) {
  const elements = Object.fromEntries(['content', 'status', 'reload'].map(id => [id, new Element('div')]));
  const hooks = {}, copied = [];
  const frames = [];
  const eagle = {
    item: { getSelected: async () => [{ filePath: 'local-test.png' }] },
    clipboard: { writeText: async text => copied.push(text) }, app: { theme: 'DARK' },
    onPluginCreate: fn => { hooks.create = fn; }, onPluginShow: fn => { hooks.show = fn; }, onThemeChanged: fn => { hooks.theme = fn; }
  };
  const document = { getElementById: id => elements[id], createElement: tag => new Element(tag), documentElement: new Element('html') };
  const modules = { './src/png.js': { readPng }, './src/metadata.js': require('../src/metadata.js') };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/inspector.js'), 'utf8'), {
    document, eagle, require: name => modules[name], localStorage: { getItem: () => null, setItem() {} },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: fn => { frames.push(fn); },
    ResizeObserver: class { constructor(fn) { hooks.resize = fn; } observe() {} },
    getComputedStyle: () => ({ lineHeight: '20px', paddingTop: '7px', paddingBottom: '7px' })
  });
  return { elements, hooks, copied, eagle, document, measure: () => frames.splice(0).forEach(fn => fn()) };
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

test('only overflowing prompts get an expand control, including after width changes', async () => {
  const app = mount(async () => ({ texts: { parameters: 'long prompt\nNegative prompt: short\nSteps: 20' }, width: 1, height: 1 }));
  await app.hooks.create();
  const [positive, negative] = app.elements.content.querySelectorAll('.prompt-text');
  positive.scrollHeight = 114; negative.scrollHeight = 34;
  positive.clientWidth = 0;
  app.measure();
  assert.equal(positive.nextElementSibling.hidden, true);
  positive.clientWidth = 280;
  app.hooks.resize(); app.measure();
  assert.equal(positive.nextElementSibling.hidden, false);
  assert.equal(negative.nextElementSibling.hidden, true);
  positive.nextElementSibling.listeners.click();
  assert.equal(positive.nextElementSibling.attributes['aria-expanded'], 'true');
  positive.scrollHeight = 74;
  app.hooks.resize(); app.measure();
  assert.equal(positive.nextElementSibling.hidden, true);
  positive.scrollHeight = 114;
  app.hooks.resize(); app.measure();
  assert.equal(positive.nextElementSibling.hidden, false);
});

test('icon copies keep accessible labels and full values, while LoRA display omits its extension', async () => {
  const tag = '<lora:styles\\ink.safetensors:0.8>';
  const app = mount(async () => ({ texts: { parameters: `${tag}\nSteps: 20, Seed: 0, Model: example.safetensors, Model hash: abc123` }, width: 1, height: 1 }));
  await app.hooks.create();
  const all = app.elements.content.all();
  const icons = all.filter(e => e.className === 'copy-button');
  assert.ok(icons.length >= 5);
  for (const icon of icons) {
    assert.equal(icon.textContent, '');
    assert.ok(icon.title);
    assert.equal(icon.attributes['aria-label'], icon.title);
    assert.equal(icon.children[0].src, 'assets/copy.svg');
    assert.equal(icon.children[0].alt, '');
  }
  const lora = all.find(e => e.className === 'lora');
  assert.equal(lora.all().find(e => e.className === 'value').textContent, 'ink:0.8');
  assert.equal(lora.all().some(e => e.className === 'tag' || e.className === 'weight'), false);
  await all.find(e => e.attributes['aria-label'] === 'inkのLoRAタグをコピー').listeners.click();
  await all.find(e => e.attributes['aria-label'] === 'モデル名をコピー').listeners.click();
  const seed = all.find(e => e.attributes['aria-label'] === 'Seedをコピー');
  assert.equal(seed.textContent, '0');
  await seed.listeners.click();
  assert.deepEqual(app.copied, [tag, 'example.safetensors', '0']);
});

test('different LoRA CLIP weight remains visible without enabling tag copy', async () => {
  const data = {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
    2: { class_type: 'LoraLoader', inputs: { model: ['1', 0], lora_name: 'ink.safetensors', strength_model: 0.8, strength_clip: 0.4 } },
    3: { class_type: 'CLIPTextEncode', inputs: { text: 'scene' } },
    4: { class_type: 'KSampler', inputs: { model: ['2', 0], positive: ['3', 0], negative: ['3', 0] } }
  };
  const app = mount(async () => ({ texts: { prompt: JSON.stringify(data) }, width: 1, height: 1 }));
  await app.hooks.create();
  const lora = app.elements.content.all().find(e => e.className === 'lora');
  assert.equal(lora.all().find(e => e.className === 'value').textContent, 'ink:0.8 / CLIP 0.4');
  assert.equal(lora.all().some(e => e.className === 'copy-button'), false);
});
