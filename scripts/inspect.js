'use strict';

const { readPng } = require('../src/png.js');
const { extractMetadata } = require('../src/metadata.js');

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: npm run inspect -- <image.png> [--summary]');
  const result = extractMetadata(await readPng(file));
  const output = process.argv.includes('--summary') ? {
    routes: result.routes.map(route => ({
      source: route.source,
      positiveCharacters: route.positive?.length,
      negativeCharacters: route.negative?.length,
      loras: route.loras.length,
      loraTags: route.loras.filter(lora => lora.tag).length,
      modelRecorded: !!route.model.name,
      settings: route.settings,
      notes: route.notes
    })), notes: result.notes
  } : result;
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main().catch(() => {
  process.stderr.write('Inspection failed. Check the PNG path and metadata.\n');
  process.exitCode = 1;
});
