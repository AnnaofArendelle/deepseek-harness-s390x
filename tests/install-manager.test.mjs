/** Host-only installation/control tests: no target binaries, sudo or ACME network. */
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readlinkSync,existsSync,rmSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const scratch=mkdtempSync(join(tmpdir(),'dsh-manager-host-'));
const manager=resolve(import.meta.dirname,'../scripts/manage-install.mjs');
after(()=>rmSync(scratch,{recursive:true,force:true}));
function fixture() {
 const home=mkdtempSync(join(scratch,'home-')),pkg=join(home,'package'),bin=join(home,'tools'),prefix=join(home,'installation'),log=join(home,'calls');
 mkdirSync(join(pkg,'node/bin'),{recursive:true});mkdirSync(join(pkg,'bin'));mkdirSync(bin);
 writeFileSync(join(pkg,'node/bin/node'),'#!/bin/sh\nexec "$DSH_TEST_NODE" "$@"\n',{mode:0o755});
 writeFileSync(join(pkg,'verify-release.mjs'),'console.log("host-only fixture verified")');
 writeFileSync(join(pkg,'build-info.json'),JSON.stringify({architecture:'s390x',node:'24.22.3',upstream:{commit:'a'.repeat(40)}}));
 for(const name of ['dsh','dshctl'])writeFileSync(join(pkg,'bin',name),'#!/bin/sh\nexit 0\n',{mode:0o755});
 for(const command of ['systemctl','sudo'])writeFileSync(join(bin,command),'#!/bin/sh\nprintf "%s %s\\n" "$(basename "$0")" "$*" >> "$DSH_TEST_CALLS"\ncase "$*" in *is-active*) exit 3;; *issue*) exit 23;; *) exit 0;; esac\n',{mode:0o755});
 const preload=join(home,'ubuntu-fixture.mjs');writeFileSync(preload,`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const read=fs.readFileSync;fs.readFileSync=(p,...a)=>p==='/etc/os-release'?'ID=ubuntu\\nVERSION_ID="24.04"\\n':read(p,...a);process.getuid=()=>1000;syncBuiltinESMExports();`);
 const env={...process.env,HOME:home,PATH:bin+':'+process.env.PATH,DSH_TEST_NODE:process.execPath,DSH_TEST_CALLS:log};
 const run=(...args)=>spawnSync(process.execPath,['--import',preload,manager,...args,'--prefix',prefix],{env,encoding:'utf8',timeout:10000});
 return {home,pkg,prefix,log,run};
}
test('clean manual installation publishes both commands and uninstall preserves data',()=>{
 const f=fixture();let r=f.run('install','--package',f.pkg,'--public-url','http://dsh.example.com:3080/');assert.equal(r.status,0,r.stderr);
 const config=JSON.parse(readFileSync(join(f.prefix,'installation.json')));
 for(const name of ['dsh','dshctl'])assert.equal(readlinkSync(join(f.home,'.local/bin',name)),join(f.prefix,'current/bin',name));
 assert.match(readFileSync(join(f.home,'.bashrc'),'utf8'),/\.local\/bin/);
 writeFileSync(join(config.data,'preserved'),'USER_DATA');
 r=f.run('uninstall');assert.equal(r.status,0,r.stderr);
 assert.equal(existsSync(f.prefix),false);assert.equal(readFileSync(join(config.data,'preserved'),'utf8'),'USER_DATA');
 for(const name of ['dsh','dshctl'])assert.equal(existsSync(join(f.home,'.local/bin',name)),false);
});
test('HTTPS public URL needs setup rather than silently serving HTTP',()=>{
 const f=fixture(),r=f.run('install','--package',f.pkg,'--public-url','https://dsh.example.com:3080/');
 assert.notEqual(r.status,0);assert.match(r.stderr,/HTTP/);assert.equal(existsSync(f.prefix),false);
});
test('short controls use user systemd and url refuses a stopped service',()=>{
 const f=fixture();assert.equal(f.run('install','--package',f.pkg).status,0);
 assert.equal(f.run('service').status,0);assert.equal(f.run('stop').status,0);
 assert.notEqual(f.run('url').status,0);
 assert.match(readFileSync(f.log,'utf8'),/systemctl --user enable deepseek-harness-s390x.service/);
 assert.match(readFileSync(f.log,'utf8'),/systemctl --user stop deepseek-harness-s390x.service/);
});
test('stopped-service upgrade preserves HTTPS settings without invoking sudo',()=>{
 const f=fixture();assert.equal(f.run('install','--package',f.pkg).status,0);
 const old=readlinkSync(join(f.prefix,'current')),candidate=join(f.home,'candidate');cpSync(f.pkg,candidate,{recursive:true});
 // This fixture exercises the stopped-service upgrade path and leaves the certificate proxy independent.
 const config=JSON.parse(readFileSync(join(f.prefix,'installation.json')));config.https={publicPort:3080};config.host='127.0.0.1';config.port=3081;config.publicUrl='https://dsh.example.com:3080/';writeFileSync(join(f.prefix,'installation.json'),JSON.stringify(config));
 const r=f.run('upgrade','--package',candidate);assert.equal(r.status,0,r.stderr);
 assert.notEqual(readlinkSync(join(f.prefix,'current')),old);assert.deepEqual(JSON.parse(readFileSync(join(f.prefix,'installation.json'))),config);
 assert.ok(!readFileSync(f.log,'utf8').includes('sudo'));
});
test('setup rejects invalid addresses or missing terms before system changes',()=>{
 const f=fixture();assert.equal(f.run('install','--package',f.pkg).status,0);const saved=readFileSync(join(f.prefix,'installation.json'),'utf8');
 for(const address of ['0.0.0.0','127.0.0.1','10.1.2.3','https://dsh.example.com/','dsh.example.com;whoami']) {
  const r=f.run('setup','--address',address,'--accept-terms');assert.notEqual(r.status,0,r.stdout);
 }
 assert.notEqual(f.run('setup','--address','dsh.example.com').status,0);
 assert.equal(existsSync(f.log),false);assert.equal(readFileSync(join(f.prefix,'installation.json'),'utf8'),saved);
});
test('certificate failure leaves the existing HTTP configuration and service intact',()=>{
 const f=fixture();assert.equal(f.run('install','--package',f.pkg).status,0);const saved=readFileSync(join(f.prefix,'installation.json'),'utf8');
 const r=f.run('setup','--address','dsh.example.com','--accept-terms');assert.notEqual(r.status,0);assert.match(r.stderr,/sudo failed \(23\)/);
 assert.equal(readFileSync(join(f.prefix,'installation.json'),'utf8'),saved);
 assert.ok(!readFileSync(f.log,'utf8').includes('--user stop'));
});
