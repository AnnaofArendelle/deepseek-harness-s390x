/** Public trusted TLS, Secure cookie and live PTY through an external reload barrier. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const [entryFile,reportFile,barrier,cwd='/tmp']=process.argv.slice(2),entry=readFileSync(entryFile,'utf8').trim();
const browser=await chromium.launch(),context=await browser.newContext(),page=await context.newPage();
const report={world:'external-x64-browser-to-IBM-s390x-HTTPS',tests:[],status:'failed'};
let terminal,sessionId;
async function rpc(method,args) {
 return page.evaluate(async({method,args})=>{
  const r=await fetch('/api/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'https-'+Date.now(),method,payload:{args}})});
  const result=(await r.json()).result;if(!result.ok)throw Error(result.error.message);return result.value;
 },{method,args});
}
try {
 await page.goto(entry,{waitUntil:'networkidle',timeout:120000});
 assert.equal(await page.evaluate(()=>window.isSecureContext),true);
 const cookies=await context.cookies();assert.ok(cookies.some(c=>c.secure&&c.httpOnly));report.tests.push('browser-trusted-TLS-secure-context-and-Secure-HttpOnly-auth-cookie');
 const rejected=await context.request.post(new URL('/api/session/list',entry).href,{headers:{Origin:'https://untrusted.example'},data:{type:'client-request',rpcId:'untrusted',method:'session/list',payload:{args:{_request:{}}}}});
 assert.equal(rejected.status(),403);report.tests.push('cross-origin-authenticated-request-rejected');
 ({sessionId}=await rpc('session/create',{request:{cwd}}));
 terminal=await rpc('terminal/create',{agentId:sessionId,request:{id:'https-renew-'+Date.now(),cols:80,rows:24}});
 await page.evaluate(({sessionId,id})=>{
  window.httpsTest={text:'',closed:false};
  const ws=window.httpsTest.ws=new WebSocket(location.origin.replace(/^http/,'ws')+'/api/remote.mux');
  ws.onopen=()=>ws.send(JSON.stringify({type:'open',streamId:'tls',endpoint:'terminal/attach',payload:{args:{agentId:sessionId,id}}}));
  ws.onclose=()=>window.httpsTest.closed=true;
  ws.onmessage=e=>{const frame=JSON.parse(e.data);if(frame.value?.type==='snapshot')ws.send(JSON.stringify({type:'item',streamId:'tls',value:{type:'write',sequence:1,typed:true,data:"printf 'HTTPS_PTY_READY\\n'; sleep 2; printf 'HTTPS_PTY_RUNNING\\n'\r"}}));if(frame.value?.type==='output')window.httpsTest.text+=frame.value.data;};
 },{sessionId,id:terminal.id});
 await page.waitForFunction(()=>window.httpsTest.text.includes('HTTPS_PTY_RUNNING'),{timeout:30000});
 writeFileSync(barrier+'.ready','ready');
 for(let i=0;i<120&&!existsSync(barrier+'.done');i++)await new Promise(r=>setTimeout(r,500));
 assert.ok(existsSync(barrier+'.done'),'External renewal/reload barrier did not complete');
 assert.equal(await page.evaluate(()=>window.httpsTest.closed),false);
 await page.evaluate(()=>window.httpsTest.ws.send(JSON.stringify({type:'item',streamId:'tls',value:{type:'write',sequence:2,typed:true,data:"printf 'HTTPS_AFTER_RELOAD\\n'; uname -m\r"}})));
 await page.waitForFunction(()=>window.httpsTest.text.includes('HTTPS_AFTER_RELOAD')&&window.httpsTest.text.includes('s390x'),{timeout:30000});
 report.tests.push('existing-WSS-PTY-remains-open-and-usable-through-certificate-cron-and-nginx-reload');
 await rpc('terminal/close',{agentId:sessionId,id:terminal.id});terminal=undefined;
 report.status='passed';
} catch(error) {report.error=error.message;throw error}
finally {try{if(terminal)await rpc('terminal/close',{agentId:sessionId,id:terminal.id})}finally{writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');await browser.close()}}
