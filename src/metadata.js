'use strict';

function splitFields(text) {
  const result = [];
  let start = 0, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\' && quoted) { escaped = true; continue; }
    if (c === '"') quoted = !quoted;
    if (quoted) continue;
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { result.push(text.slice(start, i).trim()); start = i + 1; }
  }
  result.push(text.slice(start).trim());
  return result;
}

function loraTags(text) {
  return [...text.matchAll(/<lora:([^<>]+):([+-]?(?:\d+(?:\.\d*)?|\.\d+))>/gi)].map(match => ({
    path: match[1], name: match[1].split(/[\\/]/).pop(), weight: match[2], tag: match[0]
  }));
}

function parameters(text, source) {
  if (typeof text !== 'string') return null;
  const matches = [...text.matchAll(/^Steps:\s*/gm)];
  if (!matches.length) return null;
  const start = matches.at(-1).index;
  const fields = Object.fromEntries(splitFields(text.slice(start).trim()).map(field => {
    const colon = field.indexOf(':');
    return colon < 0 ? [field, ''] : [field.slice(0, colon).trim(), field.slice(colon + 1).trim()];
  }));
  const prompts = text.slice(0, start).replace(/\r?\n$/, '');
  const separator = /(?:^|\r?\n)Negative prompt:\s?/g;
  const negativeMarker = [...prompts.matchAll(separator)].at(-1);
  const positive = negativeMarker ? prompts.slice(0, negativeMarker.index) : prompts;
  const negative = negativeMarker ? prompts.slice(negativeMarker.index + negativeMarker[0].length) : '';
  const hashes = Object.fromEntries((fields['Lora hashes'] || '').replace(/^"|"$/g, '').split(',').map(s => {
    const colon = s.lastIndexOf(':');
    return [s.slice(0, colon).trim(), s.slice(colon + 1).trim()];
  }));
  const loras = loraTags(positive).map(lora => ({ ...lora,
    hash: hashes[lora.path] || hashes[lora.name] || hashes[lora.name.replace(/\.safetensors$/i, '')] || ''
  }));
  return {
    label: source, source, positive, negative, loras,
    model: { name: fields.Model || '', hash: fields['Model hash'] || '' },
    settings: Object.entries(fields).filter(([key]) => !['Model', 'Model hash', 'Lora hashes'].includes(key))
      .map(([key, value]) => [key === 'Size' ? '生成サイズ' : key, value]),
    raw: text, notes: []
  };
}

const SAMPLERS = new Set(['KSampler', 'KSamplerAdvanced', 'D2 KSampler']);
const SAVERS = new Set(['SaveImage', 'PreviewImage', 'D2 Save Image Eagle', 'D2 Save Image']);
const LOADERS = new Set(['CheckpointLoaderSimple', 'CheckpointLoader', 'UNETLoader', 'D2 Load Diffusion Model Set']);
const LORA_LOADERS = new Set(['LoraLoader', 'LoraLoaderModelOnly']);

function comfyRoutes(graph) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return [];
  const nodes = Object.entries(graph).filter(([, n]) => n && typeof n.class_type === 'string' && n.inputs);
  if (nodes.length > 5000) throw new Error('Too many ComfyUI nodes');
  function node(link) {
    return Array.isArray(link) && link.length === 2 && Number.isInteger(link[1])
      ? graph[String(link[0])] : null;
  }
  function ancestors(start, stop, modelOnly = false) {
    const queue = [String(start)], seen = new Set(), found = [];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      const n = graph[id];
      if (!n || seen.has(id)) continue;
      seen.add(id);
      if (stop(n)) { found.push(id); continue; }
      for (const [key, v] of Object.entries(n.inputs || {})) {
        if (modelOnly && !/^model(?:[12]|_[ab])?$/.test(key)) continue;
        if (node(v)) queue.push(String(v[0]));
      }
    }
    return found;
  }
  const saves = nodes.filter(([, n]) => SAVERS.has(n.class_type));
  const ids = saves.length ? [...new Set(saves.flatMap(([id]) => ancestors(id, n => SAMPLERS.has(n.class_type))))]
    : nodes.filter(([, n]) => SAMPLERS.has(n.class_type)).map(([id]) => id);
  return ids.map(id => {
    const sampler = graph[id];
    const inputs = sampler.inputs;
    const notes = [];
    function scalar(value, key, seen = new Set()) {
      if (key === 'seed' && typeof value === 'number' && !Number.isSafeInteger(value)) {
        notes.push('Seedが整数の精度上限を超えているため、コピー対象から除外しました。');
        return undefined;
      }
      if (typeof value === 'string' || typeof value === 'number') return value;
      const n = node(value);
      if (!n || seen.has(n) || seen.size > 100) return undefined;
      seen.add(n);
      if (n.class_type === 'Seed (rgthree)' && key === 'seed') return scalar(n.inputs.seed, key, seen);
      if (['PrimitiveNode', 'PrimitiveInt', 'PrimitiveFloat', 'PrimitiveString'].includes(n.class_type)) {
        return scalar(n.inputs.value, key, seen);
      }
      return undefined;
    }
    function text(value, seen = new Set()) {
      if (typeof value === 'string') return value;
      const n = node(value);
      if (!n || seen.has(n) || seen.size > 100) return undefined;
      const next = new Set(seen).add(n);
      if (n.class_type === 'CLIPTextEncode') return text(n.inputs.text, next);
      if (n.class_type === 'D2 Prompt') return text(n.inputs.prompt, next);
      if (n.class_type === 'Text Concatenate') {
        const parts = ['text_a', 'text_b', 'text_c', 'text_d'].filter(k => k in n.inputs).map(k => text(n.inputs[k], next));
        if (parts.some(p => p === undefined) || typeof n.inputs.delimiter !== 'string' ||
            (n.inputs.clean_whitespace !== 'false' && n.inputs.clean_whitespace !== false)) return undefined;
        return parts.join(n.inputs.delimiter);
      }
      return undefined;
    }
    const positive = text(inputs.positive);
    const negative = text(inputs.negative);
    if (positive === undefined) notes.push('ポジティブは未対応ノードを経由しているため、確定できません。');
    if (negative === undefined) notes.push('ネガティブは未対応ノードを経由しているため、確定できません。');
    const modelIds = node(inputs.model) ? ancestors(inputs.model[0], n => LOADERS.has(n.class_type), true) : [];
    const model = modelIds.length === 1 ? graph[modelIds[0]].inputs : {};
    if (modelIds.length > 1) notes.push('複数のモデルが接続されているため、モデル名を確定できません。');
    const loraIds = node(inputs.model) ? ancestors(inputs.model[0], n => LORA_LOADERS.has(n.class_type), true) : [];
    const loras = loraTags(positive || '');
    // Walk each model connection so chained LoRA loaders are all included.
    const pending = [...loraIds], seenLoras = new Set();
    while (pending.length) {
      const lid = pending.shift();
      if (seenLoras.has(lid)) continue;
      seenLoras.add(lid);
      const n = graph[lid], li = n.inputs;
      const path = scalar(li.lora_name, 'lora_name');
      const weight = scalar(li.strength_model, 'strength_model');
      const clipWeight = scalar(li.strength_clip, 'strength_clip');
      if (typeof path === 'string' && weight !== undefined) {
        const knownClip = n.class_type === 'LoraLoaderModelOnly' || clipWeight !== undefined;
        const tag = knownClip && (n.class_type === 'LoraLoaderModelOnly' || Number(clipWeight) === Number(weight))
          ? `<lora:${path}:${weight}>` : '';
        if (!knownClip) notes.push('LoRAのCLIP強度が確定できないため、該当LoRAのタグコピーはできません。');
        else if (!tag) notes.push('モデルとCLIPのLoRA強度が異なるため、該当LoRAのタグコピーはできません。');
        loras.push({ path, name: path.split(/[\\/]/).pop(), weight: String(weight), tag,
          clipWeight: clipWeight === undefined ? '' : String(clipWeight) });
      }
      if (node(li.model)) pending.push(...ancestors(li.model[0], a => LORA_LOADERS.has(a.class_type), true));
    }
    const settings = [];
    for (const [key, label] of [['seed', 'Seed'], ['noise_seed', 'Seed'], ['steps', 'Steps'], ['cfg', 'CFG'],
      ['sampler_name', 'Sampler'], ['scheduler', 'Scheduler'], ['denoise', 'Denoise']]) {
      const value = scalar(inputs[key], key === 'noise_seed' ? 'seed' : key);
      if (value !== undefined) settings.push([label, String(value)]);
    }
    return {
      label: `${sampler._meta?.title || sampler.class_type} #${id}`,
      source: 'ComfyUI', positive, negative,
      model: { name: model.ckpt_name || model.unet_name || '', hash: '' },
      loras: loras.filter((lora, i, all) => all.findIndex(other => other.path === lora.path && other.weight === lora.weight) === i),
      settings, notes, raw: ''
    };
  });
}

function extractMetadata(png) {
  const hasGraph = typeof png.texts.prompt === 'string';
  const formatted = parameters(png.texts.parameters, hasGraph ? 'ComfyUI · parameters' : 'WebUI');
  let routes = formatted ? [formatted] : [];
  const notes = [...(png.warnings || [])];
  if (!routes.length && hasGraph) {
    try { routes = comfyRoutes(JSON.parse(png.texts.prompt)); }
    catch { notes.push('ComfyUIの生成情報を解析できませんでした。'); }
  }
  for (const route of routes) {
    route.settings.push(['画像サイズ', `${png.width}×${png.height}`]);
    if (!route.raw) route.raw = [
      route.positive === undefined ? '' : route.positive,
      route.negative === undefined ? '' : `Negative prompt: ${route.negative}`,
      route.model.name ? `Model: ${route.model.name}` : '',
      ...route.settings.map(([key, value]) => `${key}: ${value}`),
      ...route.loras.map(lora => lora.tag || lora.path)
    ].filter(Boolean).join('\n');
  }
  return { routes, notes };
}

module.exports = { extractMetadata, parameters, loraTags, comfyRoutes };
