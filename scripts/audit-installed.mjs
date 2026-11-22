#!/usr/bin/env node
/** Inventory actual installed packages, lifecycle scripts and native bytes. */
import { readdirSync, readFileSync, lstatSync, realpathSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(process.argv[2]);
const output = resolve(process.argv[3] ?? 'installed-inventory.json');
const target = process.argv[4] ?? process.arch;
const packages = [], binaries = [], seen = new Set();
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === '.git') continue;
    const file = join(dir, name), stat = lstatSync(file);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) { walk(file); continue; }
    if (name === 'package.json') {
      const p = JSON.parse(readFileSync(file, 'utf8'));
      packages.push({ path: relative(root, file), name: p.name, version: p.version, os: p.os, cpu: p.cpu, scripts: Object.fromEntries(Object.entries(p.scripts ?? {}).filter(([k]) => /^(preinstall|install|postinstall|prepare)$/.test(k))) });
    }
    if (stat.size < 4) continue;
    const data = readFileSync(file);
    const elf = data.subarray(0,4).equals(Buffer.from([127,69,76,70]));
    const wasm = data.subarray(0,4).equals(Buffer.from([0,97,115,109]));
    if (!elf && !wasm && !name.endsWith('.node')) continue;
    const identity = realpathSync(file);
    if (seen.has(identity)) continue;
    seen.add(identity);
    let machine, byteOrder;
    if (elf) { byteOrder = data[5] === 2 ? 'BE' : 'LE'; machine = byteOrder === 'BE' ? data.readUInt16BE(18) : data.readUInt16LE(18); }
    binaries.push({ path: relative(root, file), kind: elf ? 'ELF' : wasm ? 'WASM' : 'addon-other-format', machine, byteOrder, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
  }
}
walk(root);
const wrong = binaries.filter(b => b.kind === 'ELF' && (b.machine !== ({s390x:22,x64:62,arm64:183})[target]));
const result = { target, packages, binaries, wrongArchitecture: wrong, note: 'Build trees may contain unused foreign prebuilds. Release assembly must remove foreign payloads and re-audit with --release.' };
writeFileSync(output, JSON.stringify(result, null, 2)+'\n');
console.log(JSON.stringify({ packages: packages.length, binaries: binaries.length, wrongArchitecture: wrong.length, output }));
if (process.argv.includes('--release') && wrong.length) process.exitCode = 1;
