/** Optional real model acceptance; credentials are configured in the service, never here. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const entry=readFileSync(process.argv[2],'utf8').trim(),output=process.argv[3];
const cwd=process.argv[4],report={world:'IBM-native-with-real-compatible-model',tests:[],status:'failed'};
const browser=await chromium.launch();let page=await browser.newPage();
async function login(){await page.goto(entry,{waitUntil:'networkidle',timeout:120000})}
async function rpc(endpoint,args){return page.evaluate(async({endpoint,args})=>{
 const response=await fetch('/api/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({type:'client-request',rpcId:'real-'+Date.now()+'-'+Math.random(),method:endpoint,payload:{args}})});
 const result=(await response.json()).result;if(!result.ok)throw Error(result.error.message);return result.value;
},{endpoint,args})}
async function rows(sessionId){return page.evaluate(sessionId=>new Promise((resolve,reject)=>{
 const ws=new WebSocket(location.origin.replace(/^http/,'ws')+'/api/remote.mux');
 const timer=setTimeout(()=>{ws.close();reject(Error('Job rows timeout'))},15000);
 ws.onopen=()=>ws.send(JSON.stringify({type:'open',streamId:'jobs',endpoint:'job/list',payload:{args:{request:{sessionId}}}}));
 ws.onerror=()=>reject(Error('Job WebSocket failed'));
 ws.onmessage=event=>{const frame=JSON.parse(event.data);if(frame.type==='error'){clearTimeout(timer);ws.close();reject(Error(frame.error.message))}
 else if(frame.value?.type==='rows'){clearTimeout(timer);ws.close();resolve(frame.value.jobs)}};
}),sessionId)}
async function idle(sessionId,timeout=240000){const limit=Date.now()+timeout;await new Promise(r=>setTimeout(r,1000));while(Date.now()<limit){
 const state=await rpc('session/state',{request:{sessionId}});if(!state.running&&!state.queue?.length&&!state.pendingInput.length)return state;
 await new Promise(r=>setTimeout(r,1000));}throw Error('Real Agent did not become idle')}
async function prompt(sessionId,text){await rpc('session/prompt',{request:{sessionId,requestId:'acceptance-'+Date.now(),mode:'queue',content:[{type:'text',text}]}})}
try{
 await login();const {sessionId}=await rpc('session/create',{request:{cwd}});report.sessionId=sessionId;
 await prompt(sessionId,'这是 s390x 实际验收。使用文件工具创建 agent-real-multi.txt，内容恰好为 FIRST_TURN，然后读回。仅报告结果。');
 await idle(sessionId);report.tests.push('real-model-first-turn-file-write-and-read');
 await prompt(sessionId,'第二轮：使用文件修改工具将 agent-real-multi.txt 的 FIRST_TURN 替换为 SECOND_TURN，读回确认。然后使用 bash 启动后台命令，run_in_background=true：printf BG_START; sleep 120; printf BG_COMPLETE > background-result.txt。不要等待该后台任务结束，仅报告任务编号。');
 await idle(sessionId);let jobs=await rows(sessionId);const background=jobs.find(job=>job.status==='running'&&job.label.includes('background-result.txt'));
 assert.ok(background,'The real Agent must start a live background process');report.backgroundId=background.id;
 report.tests.push('real-model-second-turn-edit-and-background-start');
 await page.close();await new Promise(r=>setTimeout(r,125000));page=await browser.newPage();await login();
 jobs=await rows(sessionId);assert.equal(jobs.find(job=>job.id===background.id)?.status,'completed');
 report.tests.push('background-completed-after-browser-disconnected');
 await prompt(sessionId,'读回 agent-real-multi.txt 和 background-result.txt，确认 SECOND_TURN 和 BG_COMPLETE。然后运行 bash command="printf PROMOTION_START; sleep 180; printf SHOULD_NOT_FINISH > stopped-result.txt"，timeoutMs=1000，run_in_background=false，以验收前台超时转后台。得到后台 job id 后立即结束本轮回复，不要自行停止任务。');
 await idle(sessionId);jobs=await rows(sessionId);const promoted=jobs.find(job=>job.status==='running'&&job.label.includes('stopped-result.txt'));
 assert.ok(promoted,'Foreground timeout must leave a running job');
 const killed=await rpc('job/kill',{request:{sessionId,jobId:promoted.id}});assert.equal(killed.outcome,'requested');
 for(let i=0;i<45;i++){jobs=await rows(sessionId);if(!['running','stopping'].includes(jobs.find(job=>job.id===promoted.id)?.status))break;await new Promise(r=>setTimeout(r,1000))}
 assert.equal(jobs.find(job=>job.id===promoted.id)?.status,'killed');
 report.tests.push('foreground-promoted-to-background-and-human-stop');
 await idle(sessionId);
 await prompt(sessionId,'使用 DSH 内置 subagent 工具创建一个子任务：让子 Agent 在同一工作区创建 child-real.txt，内容为 CHILD_REAL_OK，读回并执行 uname -m。等待子任务完成，报告结果。');
 await idle(sessionId);report.tests.push('real-model-child-agent-request-completed');
 await prompt(sessionId,'现在执行 bash command="printf CANCEL_STARTED; sleep 300; printf SHOULD_NOT_FINISH > cancelled-result.txt"，timeoutMs=600000，run_in_background=false。此操作用于人工取消验收。');
 let active;
 for(let i=0;i<90;i++){active=(await rows(sessionId)).find(job=>job.status==='running'&&job.label.includes('cancelled-result.txt'));if(active)break;await new Promise(r=>setTimeout(r,1000))}
 assert.ok(active);await rpc('session/cancel',{request:{sessionId}});await idle(sessionId);
 jobs=await rows(sessionId);assert.ok(!['running','stopping'].includes(jobs.find(job=>job.id===active.id)?.status));
 report.tests.push('real-model-foreground-cancellation-and-job-cleanup');
 report.status='passed';
}catch(error){report.error=error.stack;throw error}
finally{mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');await browser.close()}
