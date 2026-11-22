/** A real watcher, package manifest cache changes, module replacement and disposal. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]),from=createRequire(join(root,'app/package.json'));
async function module(name){return import(pathToFileURL(from.resolve(name)))}
const {Context}=await module('@deepseek-ai/cordis'),{default:Loader}=await module('@deepseek-ai/cordis-plugin-loader');
const {default:Timer}=await module('@deepseek-ai/cordis-plugin-timer'),{default:Hmr}=await module('@deepseek-ai/dsh-hmr');
const scratch=mkdtempSync(join(tmpdir(),'dsh-live-hmr-')),pkg=join(scratch,'plugins/live-addon'),app=join(scratch,'app'),trace=[];
mkdirSync(pkg,{recursive:true});mkdirSync(join(app,'node_modules'),{recursive:true});
const file=(name,value)=>writeFileSync(join(pkg,name),value);
const plugin=marker=>`import {value} from '#dep';export function apply(ctx){ctx.get('s390xTrace').push('start:${marker}:'+value);ctx.effect(()=>()=>ctx.get('s390xTrace').push('stop:${marker}'))}`;
file('package.json',JSON.stringify({name:'live-addon',type:'module',exports:'./a.mjs',imports:{'#dep':'./dep1.mjs'}}));
file('dep1.mjs','export const value=1');file('dep2.mjs','export const value=2');file('a.mjs',plugin('a'));file('b.mjs',plugin('b'));
writeFileSync(join(app,'package.json'),'{"type":"module"}');symlinkSync(pkg,join(app,'node_modules/live-addon'));
const ctx=new Context();ctx.baseUrl=pathToFileURL(app).href+'/';ctx.provide('s390xTrace',trace);
async function until(predicate){const limit=Date.now()+30000;while(!predicate()){if(Date.now()>limit)throw Error('HMR did not observe expected lifecycle: '+trace);await new Promise(r=>setTimeout(r,100))}}
try{
 await ctx.plugin(Loader);await ctx.plugin(Timer);await ctx.plugin(Hmr,{root:[join(scratch,'plugins')],ignored:[],debounce:50});
 const entry=ctx.loader.resolve(await ctx.loader.create({name:'live-addon'}));await ctx.loader.await();await until(()=>trace.includes('start:a:1'));
 await new Promise(r=>setTimeout(r,500));file('a.mjs',plugin('a2'));await until(()=>trace.includes('stop:a')&&trace.includes('start:a2:1'));
 // Upstream preserves the running entry on manifest-only changes. A source update uses new imports; restart selects new exports.
 file('package.json',JSON.stringify({name:'live-addon',type:'module',exports:'./b.mjs',imports:{'#dep':'./dep2.mjs'}}));
 await new Promise(r=>setTimeout(r,500));file('a.mjs',plugin('a3'));await until(()=>trace.includes('stop:a2')&&trace.includes('start:a3:2'));
 await entry.fiber.dispose();await until(()=>trace.includes('stop:a3'));
 const restarted=ctx.loader.resolve(await ctx.loader.create({name:'live-addon'}));await ctx.loader.await();await until(()=>trace.includes('start:b:2'));
 await restarted.fiber.dispose();await until(()=>trace.includes('stop:b'));assert.equal(trace.filter(x=>x==='stop:b').length,1);
 console.log(JSON.stringify({world:process.arch==='s390x'?'IBM-or-s390x-guest':'host',tests:['real-filesystem-watcher','plugin-code-replacement','manifest-export-cache-invalidation','old-resources-disposed','disable-disposal'],trace,status:'passed'}));
}finally{await ctx.fiber.dispose();rmSync(scratch,{recursive:true,force:true})}
