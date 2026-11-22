/** Real x64 browser exercises the s390x service through its existing RPC and WebSocket API. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const entry=readFileSync(process.argv[2],'utf8').trim(),output=process.argv[3];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const result={world:'x64-browser-to-s390x',tests:[],status:'failed'};
let terminalId, terminalSession;
async function rpc(endpoint,args) {
 return page.evaluate(async({endpoint,args})=>{
  const response=await fetch(`/api/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({type:'client-request',rpcId:`browser-${Date.now()}-${Math.random()}`,method:endpoint,payload:{args}})});
  if(!response.ok)throw Error(`HTTP ${response.status}`);
  const result=(await response.json()).result;if(!result.ok)throw Error(result.error.message);return result.value;
 },{endpoint,args});
}
try {
 await page.goto(entry,{waitUntil:'networkidle',timeout:120000});
 await assert.doesNotReject(()=>page.locator('body').waitFor());
 result.tests.push('authentication-and-WebUI');
 const listed=await rpc('session/list',{_request:{}});
 assert.ok(Array.isArray(listed.items));
 const created=await rpc('session/create',{request:{cwd:process.argv[4]??'/tmp'}});
 const sessionId=created.sessionId??created.id;
 assert.ok(sessionId);result.tests.push('session-list-and-create');
 const info=await rpc('terminal/create',{agentId:sessionId,request:{id:`browser-${Date.now()}`,cols:101,rows:37}});
 terminalId=info.id;terminalSession=sessionId;
 assert.equal(info.state,'running');
 const terminal=await page.evaluate(async({sessionId,id})=>{
  const socket=new WebSocket(`${location.origin.replace(/^http/,'ws')}/api/remote.mux`);
  let sequence=0,text='';
  const send=value=>socket.send(JSON.stringify({type:'item',streamId:'test',value}));
  return await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{socket.close();reject(Error(`Terminal timed out: ${text}`))},90000);
   socket.onopen=()=>socket.send(JSON.stringify({type:'open',streamId:'test',endpoint:'terminal/attach',payload:{args:{agentId:sessionId,id}}}));
   socket.onerror=()=>reject(Error('WebSocket failed'));
   socket.onmessage=event=>{
    const frame=JSON.parse(event.data);
    if(frame.type==='error'){clearTimeout(timer);socket.close();reject(Error(frame.error.message));return}
    const value=frame.value;
    if(value?.type==='snapshot')send({type:'write',sequence:++sequence,typed:true,data:"printf '\\033[32mDSH_CI_BROWSER_OK\\033[0m\\n'; uname -m; stty size\r"});
    if(value?.type==='output')text+=value.data;
    if(text.includes('s390x')&&text.includes('37 101')&&text.includes('DSH_CI_BROWSER_OK')){clearTimeout(timer);socket.close();resolve(text)}
   };
  });
 },{sessionId,id:info.id});
 assert.match(terminal,/s390x/);result.tests.push('authenticated-WebSocket-PTY-ANSI-input-output-resize');
 await page.reload({waitUntil:'networkidle',timeout:120000});
 const retained=await rpc('terminal/list',{sessionId});assert.ok(retained.some(item=>item.id===info.id));result.tests.push('refresh-and-terminal-retention');
 await rpc('terminal/close',{agentId:sessionId,id:info.id});
 terminalId=undefined;
 result.tests.push('terminal-close');
 assert.deepEqual(errors,[]);result.tests.push('no-browser-JavaScript-errors');result.status='passed';
}catch(error){result.error=error.stack;throw error}
finally{try{if(terminalId)await rpc('terminal/close',{agentId:terminalSession,id:terminalId})}finally{mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');await browser.close()}}
