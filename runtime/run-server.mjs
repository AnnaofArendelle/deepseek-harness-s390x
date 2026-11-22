/** Start the Web service with installation-owned arguments and private launch diagnostics. */
import {readFileSync,mkdirSync,openSync,writeFileSync,rmSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve,dirname} from 'node:path';
const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
const release=resolve(import.meta.dirname);
mkdirSync(config.data,{recursive:true,mode:0o700});
const output=openSync(resolve(config.data,'service.log'),'w',0o600);
const pidFile=resolve(config.data,'server.pid');
writeFileSync(pidFile,String(process.pid),{mode:0o600});
const server=spawn(resolve(release,'bin/dsh'),['web','--no-open','--host',config.host,'--port',String(config.port),
  '--public-url',config.publicUrl,'--trusted-host',new URL(config.publicUrl).host],
  {env:{...process.env,DSH_HOME:config.data},stdio:['ignore','pipe','pipe']});
import {writeSync} from 'node:fs';
for(const stream of [server.stdout,server.stderr])stream.on('data',bytes=>{writeSync(output,bytes);process.stdout.write(bytes)});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.kill(signal));
server.on('error',error=>{console.error(error);rmSync(pidFile,{force:true});process.exitCode=1});
server.on('exit',(code,signal)=>{rmSync(pidFile,{force:true});process.exitCode=code??(signal?1:0)});
