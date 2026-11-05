'use strict';

const fs = require('node:fs/promises');
const zlib = require('node:zlib');
const { TextDecoder } = require('node:util');

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const TEXT_LIMIT = 4 * 1024 * 1024;
const TOTAL_LIMIT = 16 * 1024 * 1024;

function decodeText(data, utf8) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch (error) {
    if (utf8) throw error;
    // Some generators put UTF-8 in tEXt despite PNG's Latin-1 specification.
    return data.toString('latin1');
  }
}

function parseText(type, data, attemptedKeys) {
  const end = data.indexOf(0);
  if (end < 1 || end > 79) throw new Error('Invalid PNG text keyword');
  const key = data.subarray(0, end).toString('latin1');
  if (!['prompt', 'parameters'].includes(key)) return null;
  if (attemptedKeys.has(key)) {
    const error = new Error('Duplicate PNG generation metadata');
    error.code = 'DUPLICATE_METADATA';
    throw error;
  }
  // Count attempts before decoding, including malformed compressed text.
  attemptedKeys.add(key);
  let body = data.subarray(end + 1);
  if (type === 'zTXt') {
    if (body[0] !== 0) throw new Error('Unsupported PNG compression');
    body = zlib.inflateSync(body.subarray(1), { maxOutputLength: TEXT_LIMIT });
  } else if (type === 'iTXt') {
    const flag = body[0];
    if (![0, 1].includes(flag) || body[1] !== 0) throw new Error('Invalid iTXt header');
    const languageEnd = body.indexOf(0, 2);
    const translatedEnd = languageEnd < 0 ? -1 : body.indexOf(0, languageEnd + 1);
    if (translatedEnd < 0) throw new Error('Invalid iTXt fields');
    body = body.subarray(translatedEnd + 1);
    if (flag) body = zlib.inflateSync(body, { maxOutputLength: TEXT_LIMIT });
  }
  if (body.length > TEXT_LIMIT) throw new Error('PNG text too large');
  return [key, decodeText(body, type === 'iTXt'), body.length];
}

async function readPng(filePath) {
  const file = await fs.open(filePath, 'r');
  try {
    const { size } = await file.stat();
    async function read(position, length) {
      const buffer = Buffer.alloc(length);
      let offset = 0;
      while (offset < length) {
        const { bytesRead } = await file.read(buffer, offset, length - offset, position + offset);
        if (!bytesRead) throw new Error('Truncated PNG');
        offset += bytesRead;
      }
      return buffer;
    }
    if (!(await read(0, 8)).equals(SIGNATURE)) throw new Error('Not a PNG');
    const texts = Object.create(null);
    const attemptedKeys = new Set();
    const warnings = [];
    let offset = 8;
    let width, height, total = 0, expandedTotal = 0;
    for (let chunks = 0; chunks < 100000; chunks++) {
      const header = await read(offset, 8);
      const length = header.readUInt32BE(0);
      const type = header.toString('ascii', 4, 8);
      if (offset + length + 12 > size) throw new Error('Truncated PNG chunk');
      if (offset === 8 && (type !== 'IHDR' || length !== 13)) throw new Error('Missing IHDR');
      if (type === 'IHDR') {
        if (length !== 13) throw new Error('Invalid IHDR');
        const body = await read(offset + 8, 13);
        width = body.readUInt32BE(0);
        height = body.readUInt32BE(4);
        if (!width || !height) throw new Error('Invalid PNG dimensions');
      } else if (['tEXt', 'zTXt', 'iTXt'].includes(type)) {
        total += length;
        if (length > TEXT_LIMIT || total > TOTAL_LIMIT) throw new Error('PNG metadata too large');
        let entry;
        try {
          entry = parseText(type, await read(offset + 8, length), attemptedKeys);
        } catch (error) {
          if (['DUPLICATE_METADATA', 'ERR_BUFFER_TOO_LARGE'].includes(error.code)) throw error;
          warnings.push('一部のテキストメタデータを読み取れませんでした。');
        }
        if (entry) {
          expandedTotal += entry[2];
          if (expandedTotal > TOTAL_LIMIT) throw new Error('Expanded PNG metadata too large');
          texts[entry[0]] = entry[1];
        }
      } else if (type === 'IEND') {
        if (length !== 0) throw new Error('Invalid IEND');
        return { texts, width, height, warnings: [...new Set(warnings)] };
      }
      // Pixel data and workflow JSON are never decoded or executed.
      offset += length + 12;
    }
    throw new Error('Too many PNG chunks');
  } finally {
    await file.close();
  }
}

module.exports = { readPng };
