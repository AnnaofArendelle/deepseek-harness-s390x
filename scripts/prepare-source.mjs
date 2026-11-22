#!/usr/bin/env node
/** Fetch a pinned source checkout and apply patches without offsets or fuzz. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const lock = JSON.parse(readFileSync(resolve(root, 'upstream.lock.json'), 'utf8'));
const target = resolve(process.argv[2] ?? resolve(root, 'build/upstream'));
const ref = process.argv[3] ?? lock.commit;
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
  if (git(['rev-parse', 'HEAD'], target) !== ref) throw new Error('Existing checkout does not match requested commit');
}
for (const name of readdirSync(resolve(root, 'patches')).filter(n => n.endsWith('.patch')).sort()) {
  const patch = resolve(root, 'patches', name);
  // git apply does not fuzz context. --check prevents a partially applied patch.
  git(['apply', '--check', '--whitespace=error', patch], target);
  git(['apply', '--whitespace=error', patch], target);
}
console.log(JSON.stringify({ source: target, upstream: git(['rev-parse', 'HEAD'], target) }));
