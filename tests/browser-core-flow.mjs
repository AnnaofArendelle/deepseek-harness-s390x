/** Real browser and tool-backed Agent flow; only the model response is scripted. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {chromium} from 'playwright';
const entry=readFileSync(process.argv[2],'utf8').trim(),out=process.argv[3],cwd=process.argv[4]??'/home/dsh/workspace';
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:1000}});
let page=await context.newPage(),sessionId,activeJob;
const report={world:'x64-browser-to-s390x-full-service',model:'mock-scripted-response; actual Agent loop, bash, filesystem and jobs',tests:[],status:'failed'};
async function rpc(method,args) {
 return page.evaluate(async({method,args})=>{
  const r=await fetch('/api/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'ci-core-'+Date.now()+'-'+Math.random(),method,payload:{args}})});
  const v=(await r.json()).result;if(!v.ok)throw Error(v.error.message);return v.value;
 },{method,args});
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function jobs() {
 return page.evaluate(id=>new Promise((resolve,reject)=>{
  const ws=new WebSocket(location.origin.replace(/^http/,'ws')+'/api/remote.mux');
  let done=false;const timer=setTimeout(()=>finish(Error('Job stream timed out')),30000);
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);ws.close();error?reject(error):resolve(value)};
  ws.onopen=()=>ws.send(JSON.stringify({type:'open',streamId:'ci-jobs',endpoint:'job/list',payload:{args:{request:{sessionId:id}}}}));
  ws.onerror=()=>finish(Error('Job stream failed'));
  ws.onmessage=e=>{const f=JSON.parse(e.data);if(f.type==='error')finish(Error(f.error.message));else if(f.value?.type==='rows')finish(undefined,f.value.jobs)};
 }),sessionId);
}
async function prompt(marker) {
 await rpc('session/prompt',{request:{sessionId,requestId:'ci-'+marker+'-'+Date.now(),mode:'queue',content:[{type:'text',text:marker}]}});
 await page.getByText(marker+'_DONE',{exact:true}).waitFor({timeout:180000});
 for(let i=0;i<180;i++) {const s=await rpc('session/state',{request:{sessionId}});if(!s.running&&!s.queue?.length&&!s.pendingInput.length)return;await delay(500)}
 throw Error('Scripted Agent did not settle');
}
async function read(path) {return rpc('workspaceFiles/read',{workspaceFileScopeId:sessionId,path,range:{}})}
try {
 await page.goto(entry,{waitUntil:'networkidle',timeout:120000});
 ({sessionId}=await rpc('session/create',{request:{cwd}}));report.sessionId=sessionId;
 await rpc('session/selectModel',{request:{sessionId,provider:'s390x-ci-fixture',model:'ci-scripted'}});
 await page.evaluate(id=>localStorage.setItem('dsh.sessions.current',JSON.stringify({sessionId:id})),sessionId);
 await page.reload({waitUntil:'networkidle',timeout:120000});
 await prompt('DSH_CI_FIRST');assert.equal((await read('ci-agent.txt')).text.trim(),'FIRST_TURN');
 await prompt('DSH_CI_SECOND');assert.equal((await read('ci-agent.txt')).text.trim(),'SECOND_TURN');
 report.tests.push('Agent-multi-turn-real-file-write-edit-read-and-visible-streamed-reply');
 await prompt('DSH_CI_BACKGROUND');const bg=(await jobs()).find(j=>j.label.includes('ci-background.txt'));assert.ok(bg);activeJob=bg.id;
 await page.close();page=await context.newPage();await page.goto(entry,{waitUntil:'networkidle',timeout:120000});
 for(let i=0;i<120;i++){if((await jobs()).find(j=>j.id===bg.id)?.status==='completed')break;await delay(500)}
 assert.equal((await jobs()).find(j=>j.id===bg.id)?.status,'completed');assert.equal((await read('ci-background.txt')).text.trim(),'BG_COMPLETE');activeJob=undefined;
 report.tests.push('background-continues-after-browser-disconnect-file-and-job-state-verified');
 await prompt('DSH_CI_STOP');const stop=(await jobs()).find(j=>j.label.includes('ci-stopped.txt'));assert.equal(stop?.status,'running');activeJob=stop.id;
 await page.getByRole('button',{name:/Session panel|会话面板/,exact:true}).click();
 const stopButton=page.getByRole('button',{name:/Stop job.*ci-stopped|停止任务.*ci-stopped/});await stopButton.click();
 await page.getByRole('button',{name:/Click again to confirm|再次点击确认停止/}).click();
 for(let i=0;i<120;i++){if((await jobs()).find(j=>j.id===stop.id)?.status==='killed')break;await delay(500)}
 assert.equal((await jobs()).find(j=>j.id===stop.id)?.status,'killed');activeJob=undefined;
 await assert.rejects(read('ci-stopped.txt'));
 report.tests.push('job-panel-human-two-click-stop-process-state-and-absent-result-verified');
 await page.reload({waitUntil:'networkidle',timeout:120000});assert.equal((await read('ci-agent.txt')).text.trim(),'SECOND_TURN');
 report.tests.push('session-refresh-and-file-persistence');report.status='passed';
}catch(error){report.error=error.message;throw error}
finally {
 try{if(activeJob)await rpc('job/kill',{request:{sessionId,jobId:activeJob}});if(sessionId)await rpc('session/cancel',{request:{sessionId}})}
 finally{mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');await browser.close()}
}
