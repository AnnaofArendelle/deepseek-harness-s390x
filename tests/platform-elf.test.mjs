/** Exercise the real platform verifier with synthetic s390x ELF headers on x64. */
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const source=resolve(process.env.DSH_SOURCE??'build/upstream');
const {verifyPlatformBinaries}=await import(pathToFileURL(join(source,'native/system/scripts/repo.mjs')).href);
const scratch=mkdtempSync(join(tmpdir(),'dsh-elf-simulation-'));
after(()=>rmSync(scratch,{recursive:true,force:true}));
function fixture(){
 const dir=mkdtempSync(join(scratch,'case-'));mkdirSync(join(dir,'bin/glibc'),{recursive:true});
 writeFileSync(join(dir,'package.json'),JSON.stringify({name:'simulation',cpu:['s390x'],os:['linux']}));
 writeFileSync(join(dir,'prebuilds.json'),JSON.stringify({platform:'linux-s390x',binaries:[
  {tool:'landlock-run',kind:'static-musl',path:'bin/landlock-run'},
  {tool:'flock',kind:'node-api',napi:8,libc:'glibc',path:'bin/glibc/system.node'},
 ]}));
 const header=Buffer.alloc(64);header.set([127,69,76,70,2,2]);header.writeUInt16BE(22,18);
 const launcher=Buffer.from(header);launcher.writeUInt16BE(2,16);
 const addon=Buffer.from(header);addon.writeUInt16BE(3,16);
 const symbols=Buffer.from('napi_register_module_v1\0node_api_module_get_api_version_v1\0');
 const launcherPath=join(dir,'bin/landlock-run'),addonPath=join(dir,'bin/glibc/system.node');
 writeFileSync(launcherPath,launcher,{mode:0o755});writeFileSync(addonPath,Buffer.concat([addon,symbols]));
 return {dir,launcher,addon,symbols,launcherPath,addonPath};
}
test('accepts ELF64 big-endian machine 22 with the declared Node-API symbols',()=>{
 assert.deepEqual(verifyPlatformBinaries(fixture().dir),{name:'simulation',count:2});
});
test('rejects little-endian and foreign machine headers',()=>{
 for(const mutation of [header=>{header[5]=1},header=>{header.writeUInt16BE(62,18)}]){
  const f=fixture();mutation(f.addon);writeFileSync(f.addonPath,Buffer.concat([f.addon,f.symbols]));
  assert.throws(()=>verifyPlatformBinaries(f.dir),/byte order|architecture/);
 }
});
test('rejects the wrong ELF file type, missing registration and truncated headers',()=>{
 for(const bytes of [(()=>{const f=fixture();f.addon.writeUInt16BE(2,16);return Buffer.concat([f.addon,f.symbols])})(),Buffer.alloc(64),Buffer.alloc(12)]){
  const f=fixture();writeFileSync(f.addonPath,bytes);assert.throws(()=>verifyPlatformBinaries(f.dir));
 }
 const f=fixture();writeFileSync(f.addonPath,f.addon);assert.throws(()=>verifyPlatformBinaries(f.dir),/entry points/);
});
test('rejects undeclared payloads and a nonexecutable launcher',()=>{
 const f=fixture();writeFileSync(join(f.dir,'bin/extra.node'),'extra');assert.throws(()=>verifyPlatformBinaries(f.dir),/undeclared/);
 const g=fixture();chmodSync(g.launcherPath,0o600);assert.throws(()=>verifyPlatformBinaries(g.dir),/not executable/);
});
