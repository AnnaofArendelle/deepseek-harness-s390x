/** Real service upgrade refusal, failed-launch rollback and explicit data recovery. Run on s390x. */
import assert from 'node:assert/strict';
import {readFileSync,readlinkSync,writeFileSync,existsSync,mkdirSync,cpSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {serviceClient} from './service-client.mjs';
const prefix=resolve(process.argv[2]),candidate=resolve(process.argv[3]),output=resolve(process.argv[4]);
const node=join(candidate,'node/bin/node'),manager=join(candidate,'manage-install.mjs');
const report={world:'IBM-installed-service',tests:[],status:'failed'};
async function command(args) {
 return new Promise((resolve,reject)=>{let text='';const p=spawn(node,[manager,...args,'--prefix',prefix],{env:process.env});p.stdout.on('data',b=>text+=b);p.stderr.on('data',b=>text+=b);p.on('error',reject);p.on('close',code=>resolve({code,text}))});
}
async function ready() {for(let i=0;i<60;i++){try{return await serviceClient(prefix)}catch{}await new Promise(r=>setTimeout(r,1000))}throw Error('Restored service did not become ready')}
const bad=join(candidate,'..','bad-launch-test');let terminal,client;
try {
 client=await ready();const {sessionId}=await client.rpc('session/create',{request:{cwd:client.config.data}});
 terminal=await client.rpc('terminal/create',{agentId:sessionId,request:{id:'upgrade-refusal-'+Date.now(),cols:80,rows:24}});
 const old=readlinkSync(join(prefix,'current'));
 let result=await command(['upgrade','--package',candidate]);
 assert.notEqual(result.code,0);assert.match(result.text,/End active tasks.*terminal/s);assert.equal(readlinkSync(join(prefix,'current')),old);
 report.tests.push('active-terminal-refuses-upgrade-before-switch');
 await client.rpc('terminal/close',{agentId:sessionId,id:terminal.id});terminal=undefined;
 const marker=join(client.config.data,'upgrade-recovery-marker');writeFileSync(marker,'ORIGINAL_DATA');
 cpSync(candidate,bad,{recursive:true,preserveTimestamps:true,verbatimSymlinks:true});
 writeFileSync(join(bad,'run-server.mjs'),"import {readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';const c=JSON.parse(readFileSync(process.argv[2]));writeFileSync(join(c.data,'upgrade-recovery-marker'),'MIGRATED_DATA');process.exit(42);\n");
 result=await command(['upgrade','--package',bad]);
 assert.notEqual(result.code,0);assert.match(result.text,/Upgrade rolled back with the data backup restored/);assert.equal(readlinkSync(join(prefix,'current')),old);
 client=await ready();assert.equal(readFileSync(marker,'utf8'),'ORIGINAL_DATA');
 report.tests.push('failed-new-program-restores-old-program-and-pre-migration-data');
 result=await command(['upgrade','--package',candidate]);assert.equal(result.code,0,result.text);
 const backup=result.text.match(/Data backup: ([^\n]+)/)?.[1];assert.ok(backup);client=await ready();
 writeFileSync(marker,'AFTER_UPGRADE_DATA');
 result=await command(['restore','--backup',backup]);assert.equal(result.code,0,result.text);client=await ready();
 assert.equal(readFileSync(marker,'utf8'),'ORIGINAL_DATA');assert.equal(readlinkSync(join(prefix,'current')),old);
 report.tests.push('explicit-restore-restores-program-and-data-snapshot');
 result=await command(['upgrade','--package',candidate]);assert.equal(result.code,0,result.text);await ready();
 report.tests.push('final-candidate-upgrade-and-authenticated-health');report.status='passed';
}catch(error){report.error=error.message;throw error}
finally{if(terminal&&client)await client.rpc('terminal/close',{agentId:terminal.agentId,id:terminal.id}).catch(()=>{});rmSync(bad,{recursive:true,force:true});mkdirSync(join(output,'..'),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n')}
