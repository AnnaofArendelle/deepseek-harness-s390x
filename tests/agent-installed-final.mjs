/** Final installed-service real-model checks. Read files and process state independently of model prose. */
import assert from 'node:assert/strict';import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';import {join} from 'node:path';import {serviceClient} from './service-client.mjs';
const c=await serviceClient(process.argv[2]),cwd=process.argv[3],out=process.argv[4],report={world:'IBM-installed-real-compatible-model',model:'deepseek-v4.1-flash (third-party compatible endpoint)',tests:[],status:'failed'};
mkdirSync(cwd,{recursive:true});
async function prompt(sessionId,text){await c.rpc('session/prompt',{request:{sessionId,requestId:'final-'+Date.now(),mode:'queue',content:[{type:'text',text}]}})}
async function idle(sessionId){await new Promise(r=>setTimeout(r,1000));for(let i=0;i<180;i++){const s=await c.rpc('session/state',{request:{sessionId}});if(!s.running&&!s.pendingInput.length&&!s.queue?.length)return;await new Promise(r=>setTimeout(r,1000))}throw Error('Agent idle timed out')}
try{
 const {sessionId}=await c.rpc('session/create',{request:{cwd}});report.sessionId=sessionId;
 await prompt(sessionId,'使用 bash 工具执行 command="printf CANCEL_STARTED; sleep 300; printf SHOULD_NOT_FINISH > cancelled-final.txt"，timeoutMs=600000，run_in_background=false。直接调用工具，不要预先回复。此操作用于人工取消验收。');
 let active;for(let i=0;i<90;i++){active=(await c.jobs(sessionId)).find(j=>j.status==='running'&&j.label.includes('cancelled-final.txt'));if(active)break;await new Promise(r=>setTimeout(r,1000))}assert.ok(active,'Real tool must start before cancellation');
 await c.rpc('session/cancel',{request:{sessionId}});await idle(sessionId);
 assert.ok(!(await c.jobs(sessionId)).some(j=>j.id===active.id&&['running','stopping'].includes(j.status)));assert.equal(existsSync(join(cwd,'cancelled-final.txt')),false);report.tests.push('actual-foreground-command-cancelled-and-result-not-written');
 await new Promise(r=>setTimeout(r,65000));
 await prompt(sessionId,'使用 DSH 内置 subagent 工具创建子任务，让子 Agent 在当前工作区创建 child-final.txt，内容恰好为 CHILD_FINAL_REAL_OK，并读回、执行 uname -m。等待子任务完成。不要用你自己的文件工具代替子 Agent。');
 await idle(sessionId);for(let i=0;i<180&&!existsSync(join(cwd,'child-final.txt'));i++)await new Promise(r=>setTimeout(r,1000));assert.equal(readFileSync(join(cwd,'child-final.txt'),'utf8').trim(),'CHILD_FINAL_REAL_OK');report.tests.push('real-DSH-child-agent-file-result-verified');report.status='passed';
}catch(error){report.error=error.message;throw error}finally{writeFileSync(out,JSON.stringify(report,null,2)+'\n')}
