/** Test client for the existing authenticated RPC/stream APIs. Never log its cookie or entry. */
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
export async function serviceClient(prefix) {
 const config=JSON.parse(readFileSync(join(prefix,'installation.json'),'utf8'));
 const entry=readFileSync(join(config.data,'service.log'),'utf8').match(/https?:\/\/[^\s\x1b]+\?token=[^\s\x1b]+/)?.[0];
 if(!entry)throw Error('No private authentication entry');
 const url=new URL(entry),origin=`http://127.0.0.1:${config.port}`;
 const response=await fetch(origin+url.pathname+url.search,{redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(response.status!==303)throw Error(`Authentication failed (${response.status})`);
 const cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 const require=createRequire(join(prefix,'current/app/package.json')),WebSocket=require('ws');
 async function rpc(method,args) {
  const response=await fetch(origin+'/api/'+method,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'test-'+Date.now()+'-'+Math.random(),method,payload:{args}}),signal:AbortSignal.timeout(180000)});
  if(response.status!==200)throw Error(`RPC ${method} returned ${response.status}`);
  const result=(await response.json()).result;if(!result.ok)throw Error(`${method}: ${result.error.message}`);return result.value;
 }
 async function jobs(sessionId) {
  return new Promise((resolve,reject)=>{
   const ws=new WebSocket(origin.replace(/^http/,'ws')+'/api/remote.mux',{headers:{Cookie:cookie,Origin:origin}});
   const timer=setTimeout(()=>{ws.terminate();reject(Error('Job stream timed out'))},15000);
   const end=(error,value)=>{clearTimeout(timer);ws.close();error?reject(error):resolve(value)};
   ws.on('error',error=>end(error));ws.on('open',()=>ws.send(JSON.stringify({type:'open',streamId:'tests',endpoint:'job/list',payload:{args:{request:{sessionId}}}})));
   ws.on('message',bytes=>{const frame=JSON.parse(bytes);if(frame.type==='error')end(Error(frame.error.message));else if(frame.value?.type==='rows')end(undefined,frame.value.jobs)});
  });
 }
 return {config,rpc,jobs};
}
