/** s390x DSH provider attaches to an independently owned x64 CDP browser. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,rmSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const source=resolve(process.argv[2]),endpoint=process.argv[3],url=process.argv[4];
const packages=new Map();
for(const base of ['vendor','packages']){for(const name of readdirSync(join(source,base))){const dir=join(source,base,name);if(!statSync(dir).isDirectory())continue;if(base==='vendor')index(dir);else for(const child of readdirSync(dir))index(join(dir,child));}}
function index(dir){try{const p=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));packages.set(p.name,join(dir,p.main??'lib/index.js'))}catch{}}
async function mod(name){const path=packages.get('@deepseek-ai/'+name);if(!path)throw Error('Missing module '+name);return import(pathToFileURL(path))}
const {Context}=await mod('cordis'),{default:Loader}=await mod('cordis-plugin-loader'),{default:Include}=await mod('cordis-plugin-include');
const mapping={browserUse:'dsh-browser-use',prompt:'dsh-system-prompt',tools:'dsh-tools',toolExecutor:'dsh-tool-executor-native',llm:'dsh-llm',sessions:'dsh-session',agents:'dsh-agent',loop:'dsh-agent-loop',projections:'dsh-session-projection',browser:'dsh-experimental-browser-use-chrome-devtools-mcp',fs:'dsh-fs-local',workingDirectory:'dsh-working-directory'};
const modules=new Map();for(const [name,pkg] of Object.entries(mapping)){const m=await mod(pkg);modules.set(name,m.default??m)}
const {executeToolFixture}=await mod('dsh-tool-testkit'),root=mkdtempSync(join(tmpdir(),'dsh-cdp-test-')),ctx=new Context();
try{
 const file=join(root,'cordis.yml');writeFileSync(file,JSON.stringify([...modules.keys()].map(name=>({id:name,name,config:name==='loop'?{agents:[]}:name==='browser'?{mode:'attach',endpoint,toolCallTimeoutMs:90000}:{}}))));
 ctx.baseUrl=pathToFileURL(root).href+'/';await ctx.plugin(Loader);ctx.loader.builtins.include=Include;
 ctx.loader.internal={version:'v2',async import(name){if(!modules.has(name))throw Error('Unexpected module '+name);return modules.get(name)}};
 await ctx.loader.create({name:'cordis:include',config:{path:pathToFileURL(file).href}});await ctx.loader.await();
 const owner=await ctx.agents.create({sessionId:'cdp-s390x',meta:{cwd:root}});await owner.agent.whenIdle();
 await ctx.systemPrompt.assemble({agent:owner.agent,scope:owner.agent,signal:new AbortController().signal});
 assert.ok(ctx.tools.schemas(owner.agent).length>5);
 const result=await executeToolFixture(ctx,{agent:owner.agent,name:'mcp__chrome-devtools-mcp__new_page',arguments:{url},callId:'cdp-real',signal:new AbortController().signal});
 assert.equal(result.isError,false,JSON.stringify(result.content));
 const pages=await (await fetch(endpoint+'/json/list')).json();assert.ok(pages.some(page=>page.url===url));
 await owner.dispose();assert.deepEqual(ctx.tools.schemas(owner.agent),[]);assert.equal((await fetch(endpoint+'/json/version')).status,200);
 console.log(JSON.stringify({world:'IBM-s390x-provider-to-external-x64-Chromium',provider:'chrome-devtools-mcp',tests:['real-MCP-tool-catalog','navigate-external-browser','observed-CDP-page','Agent-disposal-removes-tools','externally-owned-browser-survives'],status:'passed'}));
}finally{await ctx.fiber.dispose();rmSync(root,{recursive:true,force:true})}
