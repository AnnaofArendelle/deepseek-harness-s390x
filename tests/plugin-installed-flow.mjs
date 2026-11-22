/** Install an actual plugin, observe its code/lifecycle, then remove it through public RPC. */
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {serviceClient} from './service-client.mjs';
const prefix=resolve(process.argv[2]),fixture=resolve(process.argv[3]),out=resolve(process.argv[4]);
const client=await serviceClient(prefix),marker=join(client.config.data,'plugin-installed-events.txt'),name='dsh-s390x-acceptance-plugin';
const report={world:'IBM-installed-service',tests:[],status:'failed'};
mkdirSync(fixture,{recursive:true});rmSync(marker,{force:true});
writeFileSync(join(fixture,'package.json'),JSON.stringify({name,version:'1.0.0',type:'module',main:'index.mjs',dsh:{bundle:{patch:['./cordis.patch.yml']}},files:['index.mjs','cordis.patch.yml']}));
writeFileSync(join(fixture,'cordis.patch.yml'),'- insert:\n    - id: s390x-acceptance-plugin\n      name: '+name+'\n');
const plugin=v=>`import {appendFileSync} from 'node:fs';export function apply(ctx){appendFileSync(${JSON.stringify(marker)},'start:${v}\\n');ctx.effect(()=>()=>appendFileSync(${JSON.stringify(marker)},'stop:${v}\\n'))}`;
writeFileSync(join(fixture,'index.mjs'),plugin('v1'));
async function until(value){for(let i=0;i<60;i++){if(existsSync(marker)&&readFileSync(marker,'utf8').includes(value))return;await new Promise(r=>setTimeout(r,500))}throw Error('Missing actual plugin event '+value)}
let installed=false;
try {
 const result=await client.rpc('pluginManager/installBundle',{spec:'file:'+fixture});assert.equal(result.application,'applied');installed=true;
 await until('start:v1');report.tests.push('actual-installed-plugin-code-executed');
 const file=join(client.config.data,'profiles/web/node_modules',name,'index.mjs');assert.ok(existsSync(file));
 writeFileSync(file,plugin('v2'));await until('stop:v1');await until('start:v2');report.tests.push('installed-plugin-source-edit-HMR-and-old-disposal');
 assert.equal((await client.rpc('pluginManager/setBundleEnabled',{name,enabled:false})).application,'applied');await until('stop:v2');report.tests.push('disable-releases-actual-resource');
 assert.equal((await client.rpc('pluginManager/setBundleEnabled',{name,enabled:true})).application,'applied');
 assert.equal((await client.rpc('pluginManager/removeBundle',{name})).application,'applied');installed=false;
 const trace=readFileSync(marker,'utf8').trim().split('\n');assert.equal(trace.filter(v=>v==='start:v2').length,2);assert.equal(trace.filter(v=>v==='stop:v2').length,2);
 report.tests.push('reenable-and-remove-release-resources');report.trace=trace;report.status='passed';
}catch(error){report.error=error.message;throw error}
finally {if(installed)await client.rpc('pluginManager/removeBundle',{name}).catch(()=>{});mkdirSync(join(out,'..'),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n')}
