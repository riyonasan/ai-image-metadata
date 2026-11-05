'use strict';

const { readPng } = require('./src/png.js');
const { extractMetadata } = require('./src/metadata.js');
const root = document.getElementById('content');
const status = document.getElementById('status');
let request = 0;

function el(tag, text, className) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (className) result.className = className;
  return result;
}

function copyButton(value, title, label) {
  const result = el('button', label, label === undefined ? 'copy-button' : undefined);
  result.type = 'button';
  result.title = title;
  result.setAttribute('aria-label', title);
  if (label === undefined) {
    const icon = el('img');
    icon.src = 'assets/copy.svg';
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    result.append(icon);
  }
  result.addEventListener('click', async () => {
    try {
      await eagle.clipboard.writeText(value);
      status.textContent = `${title}：コピーしました`;
    } catch {
      status.textContent = 'コピーできませんでした。本文を選択してコピーしてください。';
    }
  });
  return result;
}

function section(label, copy) {
  const result = el('section');
  const heading = el('div', undefined, 'heading');
  heading.append(el('h2', label));
  if (copy !== undefined) heading.append(copyButton(copy, `${label}をコピー`));
  result.append(heading);
  return result;
}

function prompt(label, value) {
  const result = section(label, value);
  if (value === undefined) result.append(el('p', '未対応のノード構成です。', 'note'));
  else if (!value) result.append(el('p', '空のプロンプト', 'note'));
  else {
    const pre = el('pre', value, 'prompt-text clamped');
    const expand = el('button', '全文を表示', 'expand');
    expand.type = 'button';
    expand.hidden = true;
    expand.setAttribute('aria-expanded', 'false');
    expand.addEventListener('click', () => {
      const collapsed = pre.classList.toggle('clamped');
      expand.textContent = collapsed ? '全文を表示' : '短く表示';
      expand.setAttribute('aria-expanded', String(!collapsed));
    });
    result.append(pre, expand);
  }
  return result;
}

function updatePromptButtons() {
  for (const pre of root.querySelectorAll('.prompt-text')) {
    if (!pre.clientWidth) continue;
    const style = getComputedStyle(pre);
    const threeLines = 3 * parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    pre.nextElementSibling.hidden = pre.scrollHeight <= threeLines + 1;
  }
}

function details(label, key) {
  const result = el('details');
  result.append(el('summary', label));
  try { result.open = localStorage.getItem(key) === 'true'; } catch { /* Storage is optional. */ }
  result.addEventListener('toggle', () => {
    try { localStorage.setItem(key, String(result.open)); } catch { /* Keep the current session usable. */ }
  });
  return result;
}

function renderRoute(route, body) {
  body.replaceChildren();
  const model = section('モデル');
  const modelRow = el('div', undefined, 'value-row');
  modelRow.append(el('span', route.model.name || '記録なし', 'value'));
  if (route.model.name) modelRow.append(copyButton(route.model.name, 'モデル名をコピー'));
  model.append(modelRow);
  if (route.model.hash) {
    const row = el('div', undefined, 'value-row');
    row.append(el('span', route.model.hash, 'hash'), copyButton(route.model.hash, 'モデルハッシュをコピー'));
    model.append(row);
  }
  body.append(model, prompt('ポジティブプロンプト', route.positive), prompt('ネガティブプロンプト', route.negative));
  const loras = details(`LoRA（${route.loras.length}）`, 'ai-image-metadata:loras');
  for (const lora of route.loras) {
    const item = el('div', undefined, 'lora');
    const row = el('div', undefined, 'value-row');
    const name = lora.name.replace(/\.safetensors$/i, '');
    const clipWeight = lora.clipWeight && Number(lora.clipWeight) !== Number(lora.weight) ? ` / CLIP ${lora.clipWeight}` : '';
    const label = el('span', `${name}:${lora.weight}${clipWeight}`, 'value');
    label.title = lora.tag || lora.path;
    row.append(label);
    if (lora.tag) row.append(copyButton(lora.tag, `${name}のLoRAタグをコピー`));
    item.append(row);
    if (lora.hash) {
      const hash = el('div', undefined, 'value-row');
      hash.append(el('span', lora.hash, 'hash'), copyButton(lora.hash, `${name}のハッシュをコピー`));
      item.append(hash);
    }
    loras.append(item);
  }
  if (!route.loras.length) loras.append(el('p', '読み取れるLoRA情報はありません。', 'note'));
  const settings = details('生成設定', 'ai-image-metadata:settings');
  const list = el('dl');
  for (const [key, value] of route.settings) {
    const row = el('div', undefined, 'setting');
    const dd = el('dd');
    dd.append(copyButton(value, `${key}をコピー`, value));
    row.append(el('dt', key), dd);
    list.append(row);
  }
  settings.append(list);
  body.append(loras, settings);
  for (const note of route.notes) body.append(el('p', note, 'note'));
  const footer = el('div', undefined, 'footer');
  footer.append(el('span', route.source, 'muted'), copyButton(route.raw, '生成情報をまとめてコピー'));
  body.append(footer);
  requestAnimationFrame(updatePromptButtons);
}

async function refresh() {
  const current = ++request;
  status.textContent = '';
  root.setAttribute('aria-busy', 'true');
  root.replaceChildren(el('p', '読み込み中…', 'message'));
  try {
    const selected = await eagle.item.getSelected();
    if (current !== request) return;
    if (selected.length !== 1 || !selected[0].filePath) {
      root.replaceChildren(el('p', 'PNG画像を1枚選択してください。', 'message'));
      return;
    }
    const result = extractMetadata(await readPng(selected[0].filePath));
    if (current !== request) return;
    root.replaceChildren();
    for (const note of result.notes) root.append(el('p', note, 'note'));
    if (!result.routes.length) {
      root.append(el('p', '対応する生成情報が見つかりません。PNGのparameters、または対応するComfyUIノード情報が必要です。', 'message'));
      return;
    }
    const body = el('div');
    if (result.routes.length > 1) {
      const label = el('label', '生成経路');
      label.htmlFor = 'route';
      const select = el('select', undefined, 'route-select');
      select.id = 'route';
      result.routes.forEach((route, index) => {
        const option = el('option', route.label);
        option.value = String(index);
        select.append(option);
      });
      select.addEventListener('change', () => renderRoute(result.routes[Number(select.value)], body));
      root.append(label, select);
    }
    root.append(body);
    renderRoute(result.routes[0], body);
  } catch {
    if (current === request) root.replaceChildren(el('p', '画像を読み取れませんでした。PNG形式とファイルへのアクセスを確認し、再読み込みしてください。', 'message'));
  } finally {
    if (current === request) root.setAttribute('aria-busy', 'false');
  }
}

function theme(value) {
  const light = ['LIGHT', 'LIGHTGRAY'].includes(value) ||
    (String(value).toLowerCase() === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
}

document.getElementById('reload').addEventListener('click', refresh);
new ResizeObserver(() => requestAnimationFrame(updatePromptButtons)).observe(root);
eagle.onPluginCreate(async () => { theme(await eagle.app.theme); await refresh(); });
eagle.onPluginShow(refresh);
eagle.onThemeChanged(theme);
