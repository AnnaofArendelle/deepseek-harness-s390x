/** A complete kernel must expose actual PTY read/select/poll waits and release its children. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve, join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync, existsSync, mkdtempSync, cpSync, symlinkSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';

const pkg = resolve(process.argv[2]);
const from = createRequire(join(pkg, 'app/package.json'));
const {spawn} = from('node-pty');
// The optional source path verifies a pending patch before packaging it.
const source = process.argv[3] ? resolve(process.argv[3])
  : join(dirname(from.resolve('@deepseek-ai/dsh-subprocess-local/package.json')), 'src');
const scratch = mkdtempSync(join(tmpdir(), 'dsh-inspector-'));
const tests = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function exited(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('Owned PTY child did not exit within 10 seconds')), 10000);
    })]);
  } finally { clearTimeout(timer); }
}

try {
  cpSync(source, join(scratch, 'src'), {recursive: true});
  symlinkSync(join(pkg, 'app/node_modules'), join(scratch, 'node_modules'));
  const {createProcessInspector} = await import(pathToFileURL(join(scratch, 'src/process-inspector.ts')));
  const inspector = createProcessInspector();
  for (const mode of ['read', 'select', 'poll']) {
    const wait = mode === 'read' ? 'os.read(0,1024)' : mode === 'select'
      ? 'select.select([0],[],[])' : 'p=select.poll();p.register(0,select.POLLIN);p.poll()';
    const code = `import os,select\nprint('DSH_READY',flush=True)\n${wait}\nprint('DSH_READ_FINISHED',flush=True)`;
    const child = spawn('/usr/bin/python3', ['-c', code], {
      cwd: tmpdir(), cols: 80, rows: 24, env: {...process.env},
    });
    let output = '', finished = false;
    const exit = new Promise(resolve => child.onExit(status => { finished = true; resolve(status); }));
    const data = child.onData(value => { output += value; });
    try {
      for (let i = 0; i < 100 && !output.includes('DSH_READY'); i++) await delay(50);
      assert.ok(output.includes('DSH_READY'), `${mode} child did not reach its wait`);
      let detected = false;
      for (let i = 0; i < 100; i++) {
        if (inspector.isStdinWaiting(child.pid, child.pid)) { detected = true; break; }
        await delay(50);
      }
      const syscall = readFileSync(`/proc/${child.pid}/syscall`, 'utf8').trim();
      assert.ok(detected, `Real ${mode} wait was not detected: ${syscall}`);
      child.write('input\r');
      const status = await exited(exit);
      assert.equal(status.signal ?? 0, 0, `${mode} child was terminated by a signal`);
      assert.equal(status.exitCode, 0);
      assert.ok(output.includes('DSH_READ_FINISHED'));
      tests.push({mode, syscall, result: 'real-stdin-wait-detected-and-resumed'});
    } finally {
      if (!finished) child.kill('SIGKILL');
      await exited(exit);
      data.dispose();
      assert.equal(existsSync(`/proc/${child.pid}`), false, 'Owned PTY child remains alive');
    }
  }
} finally { rmSync(scratch, {recursive: true, force: true}); }
console.log(JSON.stringify({world: 'complete-kernel', architecture: process.arch, tests, status: 'passed'}));
