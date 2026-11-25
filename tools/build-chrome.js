#!/usr/bin/env node
// Builds the Chrome / Edge package: dist/chrome/ (for "Load unpacked") and
// dist/tldraw-math-typing-chrome-<version>.zip (for the Chrome Web Store / Edge Add-ons).
// The source manifest serves Firefox and Chrome at once; Chrome flags the Firefox-only keys
// (background.scripts, browser_specific_settings) as errors on chrome://extensions, so the
// copy here drops them. No dependencies: needs Node 22.2+ for zlib.crc32.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist', 'chrome');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
delete manifest.browser_specific_settings;
manifest.background = { service_worker: manifest.background.service_worker };
// world: "MAIN" in content_scripts needs Chrome 111.
manifest.minimum_chrome_version = '111';

// Everything the manifest points at, plus the font licence.
const files = new Set(['fonts/OFL.txt', manifest.background.service_worker, manifest.action.default_popup]);
for (const p of Object.values(manifest.icons)) files.add(p);
for (const p of Object.values(manifest.action.default_icon)) files.add(p);
for (const cs of manifest.content_scripts) {
  for (const p of cs.js ?? []) files.add(p);
  for (const p of cs.css ?? []) files.add(p);
}
// Files the popup page loads.
const popup = fs.readFileSync(path.join(root, manifest.action.default_popup), 'utf8');
for (const m of popup.matchAll(/(?:src|href)="([^":]+)"/g)) files.add(m[1]);
files.add('vendor/nerdamer/license.txt');

fs.rmSync(outDir, { recursive: true, force: true });
const entries = [];
for (const rel of [...files].sort()) {
  const data = fs.readFileSync(path.join(root, rel));
  fs.mkdirSync(path.dirname(path.join(outDir, rel)), { recursive: true });
  fs.writeFileSync(path.join(outDir, rel), data);
  entries.push([rel, data]);
}
const manifestData = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'manifest.json'), manifestData);
entries.unshift(['manifest.json', manifestData]);

const zipPath = path.join(root, 'dist', `tldraw-math-typing-chrome-${manifest.version}.zip`);
fs.writeFileSync(zipPath, makeZip(entries));
console.log(`${entries.length} files -> ${path.relative(root, outDir)}${path.sep}`);
console.log(`zip       -> ${path.relative(root, zipPath)}`);

// Minimal zip writer (deflate, no directories, fixed 1980-01-01 timestamps).
function makeZip(list) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of list) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // UTF-8 names
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt16LE(0, 10);
    head.writeUInt16LE(0x21, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(comp.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    local.push(head, nameBuf, comp);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0x21, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += head.length + nameBuf.length + comp.length;
  }
  const cenSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(list.length, 8);
  end.writeUInt16LE(list.length, 10);
  end.writeUInt32LE(cenSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}
