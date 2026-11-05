'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractMetadata, parameters, comfyRoutes } = require('../src/metadata.js');

function node(class_type, inputs, title) { return { class_type, inputs, _meta: { title } }; }
function graph() {
  return {
    1: node('CheckpointLoaderSimple', { ckpt_name: 'test-model.safetensors' }),
    2: node('CLIPTextEncode', { text: 'a landscape, 日本語, \\path, <lora:styles\\ink.safetensors:0.8>' }),
    3: node('CLIPTextEncode', { text: 'low quality' }),
    4: node('KSampler', { model: ['6', 0], positive: ['2', 0], negative: ['3', 0], seed: ['5', 0],
      steps: 20, cfg: 0, sampler_name: 'euler', scheduler: 'normal', denoise: 1 }),
    5: node('Seed (rgthree)', { seed: 1234567890 }),
    6: node('LoraLoader', { model: ['7', 0], clip: ['1', 1], lora_name: 'styles\\ink.safetensors', strength_model: 0.8, strength_clip: 0.8 }),
    7: node('LoraLoaderModelOnly', { model: ['1', 0], lora_name: 'details.safetensors', strength_model: 1.2 }),
    8: node('VAEDecode', { samples: ['4', 0], vae: ['1', 2] }),
    9: node('SaveImage', { images: ['8', 0] })
  };
}

test('formatted parameters preserve Unicode, backslashes and complete LoRA tags', () => {
  const positive = 'a landscape, 日本語\n<lora:styles\\ink.safetensors:0.8>\n';
  const raw = positive + '\nNegative prompt: low quality\nSteps: 30, Sampler: euler, CFG scale: 4.0, Seed: 9999999999999999999, Size: 832x1216, Model: sample.safetensors, Model hash: abc123, Lora hashes: "ink: def456, second: 987654", Extra: "a,b:c"';
  const route = parameters(raw, 'ComfyUI');
  assert.equal(route.positive, positive);
  assert.equal(route.negative, 'low quality');
  assert.equal(route.loras[0].tag, '<lora:styles\\ink.safetensors:0.8>');
  assert.equal(route.loras[0].hash, 'def456');
  assert.equal(route.model.hash, 'abc123');
  assert.equal(route.settings.find(([key]) => key === 'Seed')[1], '9999999999999999999');
  assert.equal(route.settings.find(([key]) => key === 'Extra')[1], '"a,b:c"');
  assert.equal(route.raw, raw);
});

test('formatted metadata works without a negative prompt and with CRLF', () => {
  assert.equal(parameters('scene\r\nSteps: 1, Seed: 0', 'WebUI').positive, 'scene');
  assert.equal(parameters('Negative prompt: bad\r\nSteps: 1', 'WebUI').positive, '');
  assert.equal(parameters('scene\nSteps: 1', 'WebUI').negative, '');
  assert.equal(parameters('not generation info', 'WebUI'), null);
});

test('ComfyUI resolves connected prompts, external seed, model and chained LoRAs', () => {
  const [route] = comfyRoutes(graph());
  assert.match(route.positive, /日本語/);
  assert.equal(route.negative, 'low quality');
  assert.equal(route.model.name, 'test-model.safetensors');
  assert.equal(route.loras.length, 2);
  assert.equal(route.loras[1].tag, '<lora:details.safetensors:1.2>');
  assert.equal(route.settings.find(([key]) => key === 'Seed')[1], '1234567890');
  assert.equal(route.settings.find(([key]) => key === 'CFG')[1], '0');
  assert.deepEqual(route.notes, []);
});

test('only samplers connected to output are used, and distinct outputs remain selectable', () => {
  const g = graph();
  g[99] = node('KSampler', { positive: ['2', 0], negative: ['3', 0], model: ['1', 0] });
  assert.equal(comfyRoutes(g).length, 1);
  g[100] = node('SaveImage', { images: ['99', 0] });
  assert.equal(comfyRoutes(g).length, 2);
});

test('unknown transforms and cyclic prompt links do not produce guessed prompts', () => {
  const g = graph();
  g[2] = node('D2 Prompt Sanitizer', { prompt: ['3', 0] });
  g[3] = node('CLIPTextEncode', { text: ['3', 0] });
  const [route] = comfyRoutes(g);
  assert.equal(route.positive, undefined);
  assert.equal(route.negative, undefined);
  assert.equal(route.notes.length, 2);
});

test('different model and CLIP weights never become a misleading single-weight tag', () => {
  const g = graph();
  g[2].inputs.text = 'a landscape';
  g[6].inputs.strength_clip = 0.4;
  const [route] = comfyRoutes(g);
  assert.equal(route.loras[0].tag, '');
  assert.match(route.notes[0], /強度が異なる/);
});

test('formatted parameters take priority over unsupported D2 sanitizers', () => {
  const g = graph();
  g[2] = node('D2 Prompt Sanitizer', { prompt: ['3', 0] });
  const result = extractMetadata({ texts: { prompt: JSON.stringify(g), parameters: 'final text\nSteps: 30, Size: 8x8' }, width: 16, height: 16 });
  assert.equal(result.routes[0].positive, 'final text');
  assert.deepEqual(result.routes[0].settings.slice(-2), [['生成サイズ', '8x8'], ['画像サイズ', '16×16']]);
});

test('malformed ComfyUI JSON and workflow-only metadata have clear empty results', () => {
  assert.equal(extractMetadata({ texts: { prompt: '{bad' } }).notes.length, 1);
  assert.deepEqual(extractMetadata({ texts: { workflow: '{}' } }), { routes: [], notes: [] });
});

test('D2 model sets and direct D2 prompts support model and seed extraction', () => {
  const g = graph();
  g[1] = node('D2 Load Diffusion Model Set', { unet_name: 'example.safetensors' });
  g[2] = node('D2 Prompt', { prompt: 'a landscape' });
  g[4].class_type = 'D2 KSampler';
  assert.equal(comfyRoutes(g)[0].model.name, 'example.safetensors');
  assert.equal(comfyRoutes(g)[0].positive, 'a landscape');
});

test('unsafe numeric graph seeds are not copied with silently rounded digits', () => {
  const g = graph();
  g[5].inputs.seed = Number.MAX_SAFE_INTEGER + 1;
  const [route] = comfyRoutes(g);
  assert.equal(route.settings.some(([key]) => key === 'Seed'), false);
  assert.match(route.notes[0], /精度上限/);
});

test('a separate CLIP checkpoint never becomes the source of the diffusion model', () => {
  const g = graph();
  g[10] = node('CheckpointLoaderSimple', { ckpt_name: 'clip-source.safetensors' });
  g[6].inputs.clip = ['10', 1];
  const [route] = comfyRoutes(g);
  assert.equal(route.model.name, 'test-model.safetensors');
  assert.equal(route.loras.length, 2);
  assert.deepEqual(route.notes, []);
});

test('unknown CLIP strength cannot be represented as a known-weight LoRA tag', () => {
  const g = graph();
  g[2].inputs.text = 'a landscape';
  g[10] = node('UnknownFloatTransform', { value: 0.4 });
  g[6].inputs.strength_clip = ['10', 0];
  const [route] = comfyRoutes(g);
  assert.equal(route.loras[0].tag, '');
  assert.match(route.notes[0], /CLIP強度が確定できない/);
  assert.equal(route.loras[1].tag, '<lora:details.safetensors:1.2>');
});
