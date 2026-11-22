import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const temporary = mkdtempSync(join(tmpdir(), 'dsh-native-test-'));
const binary = join(temporary, 'process.node');
const source = resolve(process.env.DSH_SOURCE ?? 'build/upstream');
let native;
before(() => {
  const headers = resolve(dirname(process.execPath), '../include/node');
  const r = spawnSync('cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-fPIC', '-shared', '-DNAPI_VERSION=8', '-I', headers, '-o', binary, resolve(source, 'native/system/packages/entry/src/linux-process.c')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  native = require(binary);
});
after(() => rmSync(temporary, { recursive: true, force: true }));
test('captures fcntl errno and validates C integer arguments', () => {
  assert.deepEqual(native.fcntl(-1, 1, 0), [-1, 9]);
  for (const fd of [NaN, Infinity, 1.5, 2 ** 32]) assert.throws(() => native.fcntl(fd, 1, 0));
  assert.throws(() => native.fcntl(0, 999, 0));
});
test('failed execve returns errno and rejects embedded NUL', () => {
  assert.equal(native.execve('/missing/dsh-test', ['test'], []), 2);
  for (const args of [['/bin/true', ['a\0b'], []], ['/bin/true', [], ['X=a\0b']], ['/bin/true\0', [], []]]) {
    assert.throws(() => native.execve(...args), { code: 'ERR_INVALID_ARG_VALUE' });
  }
});
test('execve preserves fd 3, argv, Unicode and exact environment', () => {
  const script = `const native=require(${JSON.stringify(binary)}); const fs=require('node:fs');
    const flags=native.fcntl(3,1,0); if(flags[0]<0)throw Error('fd3 missing');
    if(native.fcntl(3,2,flags[0]&~1)[0]<0)throw Error('fcntl failed');
    native.execve('/bin/sh',['sh','-c','printf "%s|%s|%s" "$1" "$DSH_TEST" "$PATH" >&3','sh','中文 argument'],['DSH_TEST=环境 value','PATH=/usr/bin']);`;
  const r = spawnSync(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe', 'pipe'], encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.output[3], '中文 argument|环境 value|/usr/bin');
});
test('descriptor flags round trip without changing unrelated flags', () => {
  const script = `const n=require(${JSON.stringify(binary)});const assert=require('node:assert/strict');
    const [flags,error]=n.fcntl(1,3,0);assert.equal(error,0);
    assert.deepEqual(n.fcntl(1,4,flags|0x800),[0,0]);assert.equal(n.fcntl(1,3,0)[0]&0x800,0x800);
    assert.deepEqual(n.fcntl(1,4,flags),[0,0]);assert.equal(n.fcntl(1,3,0)[0],flags);`;
  const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
});
