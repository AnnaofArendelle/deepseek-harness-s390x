/** Real native loads and PTY lifecycle; kernel guarantees have a separate native test. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdtempSync,writeFileSync,openSync,closeSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {promisify} from 'node:util';
import {zstdCompressSync,zstdDecompress} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
const source=resolve(process.argv[2]),world=process.argv[3]??'native';
const require=createRequire(join(source,existsSync(join(source,'app/package.json'))?'app/package.json':'packages/subprocess/subprocess-local/package.json'));
assert.equal(process.arch,'s390x');
const {spawn}=require('node-pty');
const temporary=mkdtempSync(join(tmpdir(),'dsh-runtime-'));
try {
 const shell=spawn('/bin/bash',['--noprofile','--norc'],{name:'xterm-256color',cols:83,rows:29,cwd:temporary,env:{...process.env,PS1:'DSH_PROMPT> '}});
 let output='';shell.onData(text=>{output+=text});
 const exit=new Promise(resolve=>shell.onExit(resolve));
 async function until(text) {const limit=Date.now()+20000;while(!output.includes(text)){if(Date.now()>limit)throw Error(`PTY output missing ${text}: ${output}`);await new Promise(resolve=>setTimeout(resolve,100))}}
 await until('DSH_PROMPT>');
 shell.write("printf '\\033[32mDSH_NATIVE_PTY_OK\\033[0m\\n'; stty size\r");await until('29 83');
 shell.resize(101,37);shell.write('stty size\r');await until('37 101');
 shell.write('sleep 60\r');await new Promise(resolve=>setTimeout(resolve,300));shell.write('\u0003');await until('^C');
 shell.write('printf DSH_FILE_OK > result; exit 0\r');const result=await exit;assert.equal(result.exitCode,0);assert.equal(readFileSync(join(temporary,'result'),'utf8'),'DSH_FILE_OK');
 const value=Buffer.from('s390x persistent frame 中文 '.repeat(100));assert.deepEqual(await promisify(zstdDecompress)(zstdCompressSync(value)),value);
 const database=new DatabaseSync(join(temporary,'test.sqlite'));database.exec('CREATE TABLE test(value TEXT)');database.prepare('INSERT INTO test VALUES (?)').run('中文');assert.equal(database.prepare('SELECT value FROM test').get().value,'中文');database.close();
 const platformManifest=require.resolve('@deepseek-ai/node-addon-system-linux-s390x/package.json');
 const platformRequire=createRequire(platformManifest),native=platformRequire('./bin/glibc/system.node');
 const lockPath=join(temporary,'lock');writeFileSync(lockPath,'');const first=openSync(lockPath,'r+'),second=openSync(lockPath,'r+');
 const lock=fd=>new Promise(resolve=>native.tryLock(fd,resolve));assert.equal(await lock(first),0);assert.equal(await lock(second),11);closeSync(first);assert.equal(await lock(second),0);closeSync(second);
 console.log(JSON.stringify({world,architecture:process.arch,tests:['native-pty-input-output-ansi','resize','Ctrl-C','exit','SQLite','Zstd','flock-contention'],status:'passed'}));
}finally{rmSync(temporary,{recursive:true,force:true})}
