/** Actual optional package launch/load outcomes on s390x. Failure is evidence, never a fake provider. */
import {createRequire} from 'node:module';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';import {writeFileSync} from 'node:fs';
const source=resolve(process.argv[2]),out=process.argv[3];const results=[];
for(const [name,workspace,dependency,kind] of [
 ['Codex','subagent/subagent-codex','@openai/codex','CLI'],
 ['Claude Code','subagent/subagent-claude-code','@anthropic-ai/claude-agent-sdk','SDK'],
 ['SenseVoice','experimental/speech-to-text-sensevoice','sherpa-onnx-node','CJS'],
 ['CUA driver','experimental/computer-use-cua-driver-native','@trycua/cua-driver','ESM']]) {
 const r=createRequire(join(source,'packages',workspace,'package.json'));
 try{
  if(kind==='CLI'){const path=r.resolve(dependency+'/package.json'),p=r(path);const cli=resolve(path,'..',typeof p.bin==='string'?p.bin:Object.values(p.bin)[0]);const x=spawnSync(process.execPath,[cli,'--version'],{encoding:'utf8',timeout:15000});if(x.status!==0)throw Error(x.stderr);results.push({name,status:'loaded',output:x.stdout.trim()});}
  else if(kind==='CJS'){r(dependency);results.push({name,status:'loaded'})}
  else if(kind==='SDK'){const m=await import(pathToFileURL(r.resolve(dependency)));const q=m.query({prompt:'Reply OK',options:{maxTurns:1}});try{await q.next();results.push({name,status:'query-started'})}finally{q.close?.()}}
  else {const packageDir=join(source,'packages',workspace,'node_modules',dependency);const manifest=JSON.parse(await import('node:fs/promises').then(fs=>fs.readFile(join(packageDir,'package.json'),'utf8')));const m=await import(pathToFileURL(resolve(packageDir,manifest.main)));const d=m.CuaDriver.create(undefined);try{await d.listToolsJson();results.push({name,status:'driver-created'})}finally{d.uniffiDestroy?.()}}
 }catch(error){results.push({name,status:'unsupported-on-this-host',error:String(error.message).slice(0,1500)})}
}
writeFileSync(out,JSON.stringify({world:'IBM-native-s390x',architecture:process.arch,results},null,2)+'\n');console.log(results.map(r=>({name:r.name,status:r.status})));
