const fs = require('node:fs');
const path = require('node:path');

const target = path.join(__dirname, '..', 'node_modules', '@electron', 'rebuild', 'lib', 'clang-fetcher.js');

if (!fs.existsSync(target)) {
  console.warn('[patch-electron-rebuild] Target file not found:', target);
  process.exit(0);
}

const source = fs.readFileSync(target, 'utf8');
const from = "import tar from 'tar';";
const to = "import * as tar from 'tar';";

if (source.includes(to)) {
  console.log('[patch-electron-rebuild] Already patched.');
  process.exit(0);
}

if (!source.includes(from)) {
  console.warn('[patch-electron-rebuild] Expected import not found.');
  process.exit(0);
}

const updated = source.replace(from, to);
fs.writeFileSync(target, updated, 'utf8');
console.log('[patch-electron-rebuild] Patched tar import for ESM compatibility.');
