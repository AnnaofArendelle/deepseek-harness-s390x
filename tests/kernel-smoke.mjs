/** Kernel-dependent s390x sandbox and cgroup evidence, executed only in a complete guest/native host. */
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {spawn,spawnSync} from 'node:child_process';
const packageRoot=resolve(process.argv[2]),require=createRequire(join(packageRoot,'app/package.json'));
assert.equal(process.arch,'s390x');
const nativeRoot=join(require.resolve('@deepseek-ai/node-addon-system-linux-s390x/package.json'),'..');
const launcher=resolve(nativeRoot,'bin/landlock-run'),probe=spawnSync(launcher,['--probe'],{encoding:'utf8'});
assert.equal(probe.status,0,probe.stderr);
const allowed=mkdtempSync(join(tmpdir(),'dsh-allowed-')),denied=mkdtempSync(join(tmpdir(),'dsh-denied-'));
try {
 writeFileSync(join(denied,'secret'),'PRIVATE');
 const grants=['/usr','/bin','/lib','/lib64'].filter(existsSync).flatMap(path=>['--ro',path]);
 const result=spawnSync(launcher,[...grants,'--rw',allowed,'--','/bin/sh','-c',
  `printf ALLOWED > '${allowed}/result'; if cat '${denied}/secret'; then exit 42; fi`],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(join(allowed,'result'),'utf8'),'ALLOWED');
 assert.ok(!result.stdout.includes('PRIVATE'));
 assert.ok(existsSync('/sys/fs/cgroup/cgroup.controllers'));
 const name=`dsh-kernel-${process.pid}`;
 const unit=spawnSync('systemd-run',['--user','--wait','--pipe','--collect','--unit',name,'--property=KillMode=control-group','/bin/sh','-c','cat /proc/self/cgroup; sleep 0.2'],{encoding:'utf8'});
 assert.equal(unit.status,0,unit.stderr);assert.match(unit.stdout,new RegExp(name));
 const cleanupName=`dsh-cleanup-${process.pid}`,pidFile=join(allowed,'child.pid');
 const started=spawnSync('systemd-run',['--user','--collect','--unit',cleanupName,'--property=KillMode=control-group','/bin/sh','-c',`sleep 300 & echo $! > '${pidFile}'; wait`],{encoding:'utf8'});
 assert.equal(started.status,0,started.stderr);
 for(let i=0;i<30&&!existsSync(pidFile);i++)await new Promise(r=>setTimeout(r,100));
 const childPid=Number(readFileSync(pidFile,'utf8'));assert.ok(existsSync(`/proc/${childPid}`));
 const stopped=spawnSync('systemctl',['--user','stop',cleanupName+'.service'],{encoding:'utf8'});assert.equal(stopped.status,0,stopped.stderr);
 for(let i=0;i<30&&existsSync(`/proc/${childPid}`);i++)await new Promise(r=>setTimeout(r,100));
 assert.ok(!existsSync(`/proc/${childPid}`)||/\) Z /.test(readFileSync(`/proc/${childPid}/stat`,'utf8')),'Stopped cgroup left a live descendant');
 console.log(JSON.stringify({world:'complete-kernel',architecture:process.arch,landlockProbe:probe.stdout.trim(),partial:result.stderr.includes('partial enforcement'),tests:['allowed-write','denied-read','systemd-user-unit','cgroup-v2','systemd-cgroup-descendant-cleanup'],status:'passed'}));
}finally{rmSync(allowed,{recursive:true,force:true});rmSync(denied,{recursive:true,force:true})}
