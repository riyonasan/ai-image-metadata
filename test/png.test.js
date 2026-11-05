'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { readPng } = require('../src/png.js');

function chunk(type, data = Buffer.alloc(0)) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4);
  data.copy(result, 8);
  let crc = 0xffffffff;
  for (const value of result.subarray(4, -4)) {
    crc ^= value;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

function png(...texts) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    ...texts, chunk('IDAT', zlib.deflateSync(Buffer.from([0, 128, 128, 128]))), chunk('IEND')]);
}

async function read(t, bytes) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-image-metadata-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'synthetic.png');
  await fs.writeFile(file, bytes);
  return readPng(file);
}

test('tEXt preserves UTF-8 from generators and Latin-1 from standards-compliant files', async t => {
  const data = await read(t, png(chunk('tEXt', Buffer.from('parameters\0日本語\\file')),
    chunk('tEXt', Buffer.from('prompt\0caf\xe9', 'latin1'))));
  assert.equal(data.texts.parameters, '日本語\\file');
  assert.equal(data.texts.prompt, 'café');
  assert.equal(data.width, 1); assert.equal(data.height, 1);
});

test('zTXt and compressed/uncompressed iTXt respect their field layout', async t => {
  const compressed = Buffer.concat([Buffer.from('parameters\0\0'), zlib.deflateSync(Buffer.from('a landscape'))]);
  const data = await read(t, png(chunk('zTXt', compressed),
    chunk('iTXt', Buffer.from('prompt\0\0\0ja\0生成情報\0日本語'))));
  assert.equal(data.texts.parameters, 'a landscape'); assert.equal(data.texts.prompt, '日本語');
  const second = await read(t, png(chunk('iTXt', Buffer.concat([
    Buffer.from('prompt\0\x01\0\0\0'), zlib.deflateSync(Buffer.from('日本語'))
  ]))));
  assert.equal(second.texts.prompt, '日本語');
});

test('workflow is not interpreted, and invalid compressed text does not hide valid parameters', async t => {
  const result = await read(t, png(chunk('tEXt', Buffer.from('workflow\0not parsed')),
    chunk('zTXt', Buffer.from('prompt\0\0invalid')),
    chunk('tEXt', Buffer.from('parameters\0scene\nSteps: 1'))));
  assert.equal(result.texts.workflow, undefined);
  assert.equal(result.texts.parameters, 'scene\nSteps: 1');
  assert.equal(result.warnings.length, 1);
});

test('signature, truncation and oversized decompressed text are handled', async t => {
  await assert.rejects(read(t, Buffer.alloc(20)), /Not a PNG/);
  await assert.rejects(read(t, png().subarray(0, 24)), /Truncated/);
  const bomb = Buffer.concat([Buffer.from('prompt\0\0'), zlib.deflateSync(Buffer.alloc(4 * 1024 * 1024 + 1))]);
  await assert.rejects(read(t, png(chunk('zTXt', bomb))), { code: 'ERR_BUFFER_TOO_LARGE' });
});

test('duplicate compressed chunks cannot bypass the cumulative expanded-size limit', async t => {
  const compressed = chunk('zTXt', Buffer.concat([
    Buffer.from('prompt\0\0'), zlib.deflateSync(Buffer.alloc(4 * 1024 * 1024, 97))
  ]));
  await assert.rejects(read(t, png(...Array(5).fill(compressed))), /Duplicate PNG generation metadata/);
});

test('oversized and invalid UTF-8 chunks cannot repeatedly inflate through warning recovery', async t => {
  const oversized = chunk('zTXt', Buffer.concat([
    Buffer.from('prompt\0\0'), zlib.deflateSync(Buffer.alloc(4 * 1024 * 1024 + 1, 97))
  ]));
  await assert.rejects(read(t, png(...Array(5).fill(oversized))), { code: 'ERR_BUFFER_TOO_LARGE' });
  const invalid = chunk('iTXt', Buffer.concat([
    Buffer.from('prompt\0\x01\0\0\0'), zlib.deflateSync(Buffer.alloc(4 * 1024 * 1024, 255))
  ]));
  await assert.rejects(read(t, png(...Array(5).fill(invalid))), /Duplicate PNG generation metadata/);
});
