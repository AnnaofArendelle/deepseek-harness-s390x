/** User-owned releases, explicit service control, and task-aware backup/rollback upgrades. */
import {existsSync,readFileSync,writeFileSync,mkdirSync,cpSync,symlinkSync,renameSync,readlinkSync,rmSync,lstatSync} from 'node:fs';
import {resolve,join,dirname,basename} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createInterface} from 'node:readline/promises';
import {isIP,createServer} from 'node:net';
const values=process.argv.slice(2),command=values.shift()??'help',opts={};
for(let i=0;i<values.length;i++) {
 if(!values[i].startsWith('--'))throw Error(`Unexpected argument ${values[i]}`);
 const key=values[i].slice(2);opts[key]=values[i+1]?.startsWith('--')||values[i+1]===undefined?true:values[++i];
}
const prefix=resolve(String(opts.prefix??join(homedir(),'.local/lib/deepseek-harness-s390x')));
const configuration=join(prefix,'installation.json'),current=join(prefix,'current');
const service='deepseek-harness-s390x.service';
function run(executable,args,allowFailure=false) {
 const result=spawnSync(executable,args,{stdio:'inherit'});
 if(!allowFailure&&result.status!==0)throw Error(`${executable} failed (${result.status})`);
 return result.status;
}
function systemd(args,allowFailure=false) {return run('systemctl',['--user',...args],allowFailure)}
function loaded() {if(!existsSync(configuration))throw Error('Install this package first');return JSON.parse(readFileSync(configuration,'utf8'))}
function swapLink(path) {
 const next=join(prefix,'.current-next');rmSync(next,{force:true});symlinkSync(path,next);renameSync(next,current);
}
function publishPackage(path) {
 path=resolve(path);
 const info=JSON.parse(readFileSync(join(path,'build-info.json'),'utf8'));
 if(info.architecture!=='s390x'||info.node!=='24.22.3')throw Error('Incompatible installation package');
 if(run(join(path,'node/bin/node'),[join(path,'verify-release.mjs'),path],true)!==0)throw Error('Package verification failed');
 const id=`${info.upstream.commit.slice(0,12)}-${Date.now()}`,destination=join(prefix,'releases',id);
 mkdirSync(dirname(destination),{recursive:true});cpSync(path,destination,{recursive:true,preserveTimestamps:true,verbatimSymlinks:true});
 if(run(join(destination,'node/bin/node'),[join(destination,'verify-release.mjs'),destination],true)!==0){rmSync(destination,{recursive:true,force:true});throw Error('Copied package verification failed')}
 return destination;
}
function serviceActive() {return spawnSync('systemctl',['--user','is-active','--quiet',service]).status===0}
function running(config) {
 const file=join(config.data,'server.pid');if(!existsSync(file))return false;
 const pid=Number(readFileSync(file,'utf8'));if(!Number.isSafeInteger(pid)||pid<1)throw Error('Invalid server PID file');
 try {process.kill(pid,0);return true} catch(error) {if(error.code!=='ESRCH')throw error;return false}
}
async function api(config) {
 const text=readFileSync(join(config.data,'service.log'),'utf8');
 const entry=text.match(/https?:\/\/[^\s\x1b]+\?token=[^\s\x1b]+/);
 if(!entry)throw Error('Cannot obtain the service authentication entry; task checks must succeed before upgrading');
 const url=new URL(entry[0]),internal=`http://127.0.0.1:${config.port}`,origin=internal;
 const exchange=await fetch(`${internal}${url.pathname}${url.search}`,{redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(exchange.status!==303)throw Error(`Service authentication failed (${exchange.status})`);
 const cookie=exchange.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 async function rpc(endpoint,args) {
  const response=await fetch(`${internal}/api/${endpoint}`,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},
   body:JSON.stringify({type:'client-request',rpcId:`upgrade-${Date.now()}`,method:endpoint,payload:{args}}),signal:AbortSignal.timeout(15000)});
  if(response.status!==200)throw Error(`Service task inspection failed (${response.status})`);
  const result=(await response.json()).result;if(!result.ok)throw Error(result.error.message);return result.value;
 }
 const require=createRequire(join(current,'app/package.json')),WebSocket=require('ws');
 async function jobs(sessionId) {
  return await new Promise((resolve,reject)=>{
   const ws=new WebSocket(internal.replace(/^http/,'ws')+'/api/remote.mux',{headers:{Cookie:cookie,Origin:origin}});
   const timer=setTimeout(()=>{ws.terminate();reject(Error('Job inspection timed out'))},15000);
   const finish=(error,value)=>{clearTimeout(timer);ws.close();error?reject(error):resolve(value)};
   ws.on('open',()=>ws.send(JSON.stringify({type:'open',streamId:'upgrade-jobs',endpoint:'job/list',payload:{args:{request:{sessionId}}}})));
   ws.on('error',error=>finish(error));ws.on('message',bytes=>{const frame=JSON.parse(bytes);if(frame.type==='error')finish(Error(frame.error.message));else if(frame.type==='item'&&frame.value?.type==='rows')finish(undefined,frame.value.jobs)});
  });
 }
 return {rpc,jobs};
}
async function requireIdle(config) {
 if(!running(config)&&!serviceActive())return;
 const client=await api(config),{items}=await client.rpc('session/list',{_request:{}});
 const active=[];
 for(const item of items) {
  const state=await client.rpc('session/state',{request:{sessionId:item.sessionId}});
  if(state.running||state.pendingInput.length||state.queue?.length)active.push(`session ${item.sessionId}`);
  const terminals=await client.rpc('terminal/list',{sessionId:item.sessionId});
  if(terminals.some(terminal=>terminal.state==='running'))active.push(`terminal in ${item.sessionId}`);
  const jobs=await client.jobs(item.sessionId);
  if(jobs.some(job=>['running','stopping','pending'].includes(job.status)))active.push(`job in ${item.sessionId}`);
 }
 if(active.length)throw Error(`End active tasks and close terminals before upgrading: ${active.join(', ')}`);
}
async function health(config) {
 for(let attempt=0;attempt<90;attempt++) {
  await new Promise(resolve=>setTimeout(resolve,1000));
  try {const client=await api(config);await client.rpc('session/list',{_request:{}});return} catch {}
 }
 throw Error('New release did not become ready within 90 seconds');
}
function unit(config) {
 const directory=join(homedir(),'.config/systemd/user');mkdirSync(directory,{recursive:true});
 const escape=value=>value.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('%','%%');
 writeFileSync(join(directory,service),`[Unit]\nDescription=DeepSeek Harness s390x Web service\nAfter=network-online.target\n\n[Service]\nType=simple\nWorkingDirectory=${config.data}\nExecStart="${escape(join(current,'node/bin/node'))}" "${escape(join(current,'run-server.mjs'))}" "${escape(configuration)}"\nRestart=on-failure\nRestartSec=5\nKillMode=control-group\nTimeoutStopSec=45\nUMask=0077\n\n[Install]\nWantedBy=default.target\n`);
 systemd(['daemon-reload']);systemd(['enable',service]);
}
async function setup() {
 const previous=loaded();
 if(process.getuid()===0)throw Error('请以普通用户运行 dshctl setup，不要使用 sudo dshctl');
 if(!/^ID=ubuntu$/m.test(readFileSync('/etc/os-release','utf8'))||!/^VERSION_ID="24\.04"$/m.test(readFileSync('/etc/os-release','utf8')))throw Error('自动 HTTPS 向导目前支持 Ubuntu 24.04；其他系统请手动配置代理');
 const interactive=process.stdin.isTTY,reader=interactive?createInterface({input:process.stdin,output:process.stdout}):undefined;
 const oldAddress=new URL(previous.publicUrl).hostname;
 const defaultAddress=['127.0.0.1','localhost','0.0.0.0'].includes(oldAddress)?'':oldAddress;
 const address=String(opts.address??(reader?await reader.question(`公网 IPv4 或域名${defaultAddress?` [${defaultAddress}]`:''}：`):defaultAddress)).trim().toLowerCase()||defaultAddress;
 const ip=isIP(address),parts=address.split('.').map(Number);
 if(ip===4) {
  if(parts[0]===0||parts[0]===10||parts[0]===127||parts[0]>=224||parts[0]===169&&parts[1]===254||parts[0]===192&&parts[1]===168||parts[0]===172&&parts[1]>=16&&parts[1]<=31)throw Error('请填写可从公网访问的 IPv4，不能填写内网或监听地址');
 } else if(ip!==0||address.length>253||!address.includes('.')||!address.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))||/^[0-9.]+$/.test(address))throw Error('请只填写公网 IPv4 或域名，不包含 https://、端口或路径；自动 IPv6 证书配置暂未支持');
 const publicPort=Number(opts.port??previous.https?.publicPort??3080);
 if(!Number.isInteger(publicPort)||publicPort<1||publicPort>65535||publicPort===80)throw Error('HTTPS 端口须为 1–65535，且不能占用证书验证的 80 端口');
 console.log(`将部署 https://${address}${publicPort===443?'':`:${publicPort}`}/。需要 sudo 安装 Nginx 并开放 TCP 80 / ${publicPort}。\n请先在云控制台放行这两个端口；域名的 A 记录须指向本机公网 IPv4。\nIP 证书有效期约 6 天，系统每 6 小时检查续期；80 端口须持续可达。\nLet’s Encrypt 服务协议：https://letsencrypt.org/documents/LE-SA-v1.6-August-18-2025.pdf`);
 const accepted=opts['accept-terms']===true||(reader&&(await reader.question('已配置云侧端口并同意协议？输入 yes 继续：')).trim().toLowerCase()==='yes');
 reader?.close();
 if(!accepted)throw Error('未确认协议和云侧端口；配置未更改。非交互部署需 --address ADDRESS --accept-terms');
 await requireIdle(previous);
 if(running(previous)&&!serviceActive())throw Error('请先停止前台 DSH，再配置 HTTPS');
 const backendPort=previous.https?previous.port:(publicPort===3081?3082:3081);
 if(!previous.https)await new Promise((resolve,reject)=>{const probe=createServer();probe.on('error',reject);probe.listen(backendPort,'127.0.0.1',()=>probe.close(resolve))});
 const helper=join(current,'https-system.sh'),uid=String(process.getuid());
 run('sudo',['bash',helper,'prepare',uid,address,String(publicPort),String(backendPort)]);
 run('sudo',['bash',helper,'issue',uid]);
 const config={...previous,host:'127.0.0.1',port:backendPort,publicUrl:`https://${address}${publicPort===443?'':`:${publicPort}`}/`,https:{publicPort}};
 const wasActive=serviceActive();systemd(['stop',service],true);
 writeFileSync(configuration,JSON.stringify(config,null,2));
 try {
  unit(config);run('sudo',['loginctl','enable-linger',String(process.env.USER)]);
  systemd(['start',service]);await health(config);
  run('sudo',['bash',helper,'enable',uid]);
 } catch(error) {
  systemd(['stop',service],true);writeFileSync(configuration,JSON.stringify(previous,null,2));
  if(previous.https)run('sudo',['bash',helper,'enable',uid,oldAddress,String(previous.https.publicPort),String(previous.port)],true);
  else run('sudo',['bash',helper,'disable',uid],true);
  if(wasActive)systemd(['start',service],true);throw error;
 }
 console.log('HTTPS 和自动续期已启用，已配置开机启动，退出 SSH 后继续运行。');
 console.log('日常命令：dshctl start | stop | restart | status | logs | url');
 const entry=readFileSync(join(config.data,'service.log'),'utf8').match(/https?:\/\/[^\s\x1b]+\?token=[^\s\x1b]+/)?.[0];
 if(entry)console.log(`私密登录入口（请勿分享）：\n${entry}`);
}
switch(command) {
 case 'install': {
  if(existsSync(configuration))throw Error('Use upgrade for an existing installation');
  const data=resolve(String(opts.data??join(homedir(),'.local/share/deepseek-harness')));
  const publicUrl=String(opts['public-url']??'http://127.0.0.1:3080/'),url=new URL(publicUrl);
 if(url.protocol!=='http:')throw Error('手动安装使用 HTTP；自动 HTTPS 请运行 ./install.sh 或安装后运行 dshctl setup');
  const port=Number(opts.port??(url.port||3080));if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid service port');
  const bin=join(homedir(),'.local/bin');
  for(const name of ['dsh','dshctl'])if(lstatSync(join(bin,name),{throwIfNoEntry:false}))throw Error(`Existing ~/.local/bin/${name} requires choosing your own command link`);
  mkdirSync(prefix,{recursive:true});mkdirSync(data,{recursive:true,mode:0o700});
  const destination=publishPackage(String(opts.package));swapLink(destination);
  const config={prefix,data,host:String(opts.host??'0.0.0.0'),port,publicUrl};
  writeFileSync(configuration,JSON.stringify(config,null,2),{mode:0o600});
  if(config.host==='0.0.0.0') {
   const patch=join(data,'profiles/web/cordis.patch.yml');mkdirSync(dirname(patch),{recursive:true,mode:0o700});
   const text=existsSync(patch)?readFileSync(patch,'utf8'):'';
   if(!/id:\s*ui-context-menu/.test(text))writeFileSync(patch,text+'\n- id: ui-context-menu\n  config:\n    resolutionTimeoutMs: 15000\n',{mode:0o600});
  }
  mkdirSync(bin,{recursive:true});
  for(const name of ['dsh','dshctl'])symlinkSync(join(current,'bin',name),join(bin,name));
  const bashrc=join(homedir(),'.bashrc'),pathLine='export PATH="$HOME/.local/bin:$PATH"';
  const shellConfig=existsSync(bashrc)?readFileSync(bashrc,'utf8'):'';
  if(!shellConfig.split('\n').includes(pathLine))writeFileSync(bashrc,shellConfig+'\n'+pathLine+'\n');
  console.log(`Installed: ${destination}\n配置并启动：${join(bin,'dshctl')} setup`);
  if(opts.setup)await setup();
  break;
 }
 case 'setup': await setup();break;
 case 'foreground': {const config=loaded();process.env.DSH_HOME=config.data;run(join(current,'node/bin/node'),[join(current,'run-server.mjs'),configuration]);break}
 case 'service': unit(loaded());console.log('User service installed. Start with the start command; enable login-independent boot with sudo loginctl enable-linger "$USER".');break;
 case 'start': {const config=loaded();systemd(['start',service]);await health(config);console.log(`DSH 已启动：${config.publicUrl}\n登录入口：dshctl url`);break}
 case 'stop': loaded();systemd(['stop',service]);break;
 case 'restart': loaded();systemd(['restart',service]);break;
 case 'status': {const config=loaded();systemd(['status',service,'--no-pager'],true);console.log(`访问地址：${config.publicUrl}`);if(config.https)console.log('证书续期：系统 dsh-s390x-cert timer（每 6 小时）');break}
 case 'url': {const config=loaded();if(!running(config))throw Error('DSH 尚未运行，请先执行 dshctl start');const entry=readFileSync(join(config.data,'service.log'),'utf8').match(/https?:\/\/[^\s\x1b]+\?token=[^\s\x1b]+/)?.[0];if(!entry)throw Error('登录入口尚未就绪，请稍后重试或执行 dshctl logs');console.log(entry);break}
 case 'renew': {const config=loaded();if(!config.https)throw Error('请先运行 dshctl setup');run('sudo',['bash',join(current,'https-system.sh'),'renew',String(process.getuid())]);break}
 case 'logs': loaded();run('journalctl',['--user','-u',service,'-n','50','--no-pager']);break;
 case 'upgrade': {
  const config=loaded();await requireIdle(config);
  if(running(config)&&!serviceActive())throw Error('Stop the foreground server before upgrading');
  const destination=publishPackage(String(opts.package)),old=readlinkSync(current),active=serviceActive();
  const backup=join(prefix,'backups',String(Date.now()));mkdirSync(backup,{recursive:true,mode:0o700});
  if(active)systemd(['stop',service]);
  cpSync(config.data,join(backup,'data'),{recursive:true,verbatimSymlinks:true});
  writeFileSync(join(backup,'rollback.json'),JSON.stringify({release:old,data:config.data}),{mode:0o600});
  swapLink(destination);
  const control=join(homedir(),'.local/bin/dshctl');if(!lstatSync(control,{throwIfNoEntry:false}))symlinkSync(join(current,'bin/dshctl'),control);
  try {if(active){systemd(['start',service]);await health(config)};console.log(`Upgrade installed. Data backup: ${backup}`)}
  catch(error) {
   systemd(['stop',service],true);swapLink(old);
   const failedData=`${config.data}.failed-${Date.now()}`;renameSync(config.data,failedData);cpSync(join(backup,'data'),config.data,{recursive:true,verbatimSymlinks:true});
   if(active)systemd(['start',service]);throw Error(`Upgrade rolled back with the data backup restored. Failed data retained at ${failedData}`,{cause:error});
  }
  break;
 }
 case 'restore': {
  const config=loaded();await requireIdle(config);const backup=resolve(String(opts.backup)),record=JSON.parse(readFileSync(join(backup,'rollback.json'),'utf8'));
  if(record.data!==config.data||!existsSync(record.release))throw Error('Backup does not match this installation');
  if(running(config)&&!serviceActive())throw Error('Stop the foreground server before restoring');
  const active=serviceActive();if(active)systemd(['stop',service]);
  renameSync(config.data,`${config.data}.before-restore-${Date.now()}`);cpSync(join(backup,'data'),config.data,{recursive:true,verbatimSymlinks:true});swapLink(record.release);
  if(active){systemd(['start',service]);await health(config)};break;
 }
 case 'uninstall': {
  const config=loaded();await requireIdle(config);if(running(config)&&!serviceActive())throw Error('Stop the foreground server first');
  systemd(['disable','--now',service],true);rmSync(join(homedir(),'.config/systemd/user',service),{force:true});systemd(['daemon-reload'],true);
  if(config.https)run('sudo',['bash',join(current,'https-system.sh'),'remove',String(process.getuid())]);
  for(const name of ['dsh','dshctl']){const link=join(homedir(),'.local/bin',name);if(lstatSync(link,{throwIfNoEntry:false})?.isSymbolicLink()&&readlinkSync(link)===join(current,'bin',name))rmSync(link)}
  rmSync(prefix,{recursive:true,force:true});console.log(`Uninstalled. User data preserved: ${config.data}`);break;
 }
 default: console.log('命令：setup（自动 HTTPS 向导）, start, stop, restart, status, logs, url, renew, foreground, upgrade --package DIR, restore --backup DIR, uninstall. 高级：install --package DIR, service, --prefix DIR。setup 可使用 --address 公网IPv4或域名 --port 3080 --accept-terms。');
}
