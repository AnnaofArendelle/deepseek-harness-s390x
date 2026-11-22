#!/usr/bin/env node
/** Fetch a pinned source checkout and apply patches without offsets or fuzz. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const lock = JSON.parse(readFileSync(resolve(root, 'upstream.lock.json'), 'utf8'));
const target = resolve(process.argv[2] ?? resolve(root, 'build/upstream'));
const ref = process.argv[3] ?? lock.commit;
if (!ref || ref.startsWith('-') || /[\s\x00]/.test(ref)) throw new Error('Invalid upstream ref');
function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || String(r.error));
  return r.stdout.trim();
}
if (!existsSync(target)) {
  mkdirSync(target, { recursive: true });
  git(['init', '--quiet'], target);
  git(['remote', 'add', 'origin', lock.repository], target);
  git(['fetch', '--depth=1', 'origin', ref], target);
  git(['checkout', '--detach', '--quiet', 'FETCH_HEAD'], target);
} else {
  if (git(['status', '--porcelain'], target)) throw new Error('Source directory has local changes; select a fresh build directory');
  const requested = git(['rev-parse', '--verify', `${ref}^{commit}`], target);
  if (git(['rev-parse', 'HEAD'], target) !== requested) throw new Error('Existing checkout does not match requested commit');
}
// Check each old hunk at its declared location. git apply alone permits offsets.
// Build against a changed upstream only after the patch has been rebased explicitly.
function checkExactHunks(patch) {
  const lines = readFileSync(patch, 'utf8').split('\n');
  let original;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('--- ')) {
      const path = line.slice(4);
      if (path === '/dev/null') original = [];
      else {
        if (!path.startsWith('a/') || path.includes('..') || path.includes('\t')) throw new Error(`Unsupported patch path: ${path}`);
        original = readFileSync(resolve(target, path.slice(2)), 'utf8').split('\n');
      }
    }
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk) continue;
    if (!original) throw new Error('Patch hunk has no source');
    let oldIndex = Math.max(0, Number(hunk[1]) - 1);
    let remainingOld = Number(hunk[2] ?? 1);
    let remainingNew = Number(hunk[4] ?? 1);
    while (remainingOld || remainingNew) {
      const content = lines[++i];
      if (content?.startsWith('\\')) continue;
      const marker = content?.[0];
      if (![' ', '+', '-'].includes(marker)) throw new Error(`Malformed hunk in ${patch}`);
      if (marker !== '+') {
        if (original[oldIndex] !== content.slice(1)) throw new Error(`Patch would require an offset or changed context: ${patch}, original line ${oldIndex + 1}`);
        oldIndex++; remainingOld--;
      }
      if (marker !== '-') remainingNew--;
      if (remainingOld < 0 || remainingNew < 0) throw new Error('Invalid hunk counts');
    }
  }
}
for (const name of readdirSync(resolve(root, 'patches')).filter(n => n.endsWith('.patch')).sort()) {
  const patch = resolve(root, 'patches', name);
  checkExactHunks(patch);
  git(['apply', '--check', '--whitespace=error', patch], target);
  git(['apply', '--whitespace=error', patch], target);
}
writeFileSync(resolve(target, '.s390x-build-source.json'), JSON.stringify({ repository: lock.repository, ref, commit: git(['rev-parse', 'HEAD'], target) }, null, 2) + '\n');
console.log(JSON.stringify({ source: target, upstream: git(['rev-parse', 'HEAD'], target) }));
