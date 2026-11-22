/** Remove reviewed unused foreign prebuilds, retaining portable sources and notices. */
import {readdirSync,openSync,readSync,closeSync,lstatSync,rmSync,writeFileSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
const stage=resolve(process.argv[2]), source=resolve(process.argv[3]);
const buildMode=process.env.DSH_BUILD_MODE??'native';
if(!['native','cross'].includes(buildMode))throw Error('Unknown build mode');
const removed=[],elfRequirements=[];
function walk(dir) {
 for(const name of readdirSync(dir)) {
  const path=join(dir,name),stat=lstatSync(path);
  if(stat.isSymbolicLink()) continue;
  if(stat.isDirectory()) {walk(path);continue;}
  if(stat.size<4)continue;
  const bytes=Buffer.alloc(64),fd=openSync(path,'r');try{readSync(fd,bytes,0,64,0)}finally{closeSync(fd)}
  const elf=bytes.subarray(0,4).equals(Buffer.from([127,69,76,70]));
  if(elf&&bytes[5]===2&&bytes.readUInt16BE(18)===22) {
   const versions=execFileSync('readelf',['--version-info',path],{encoding:'utf8'});
   const glibc=[...new Set([...versions.matchAll(/GLIBC_([0-9]+\.[0-9]+(?:\.[0-9]+)?)/g)].map(match=>match[1]))];
   elfRequirements.push({path:relative(stage,path),glibc});
  }
  const foreign=elf&&(bytes[5]!==2||bytes.readUInt16BE(18)!==22);
  const addon=name.endsWith('.node')&&!elf;
  const pe=bytes[0]===77&&bytes[1]===90;
  if(foreign||addon||pe) {
   const local=relative(stage,path);
   if(!/node-pty\/(?:prebuilds|third_party\/conpty)\/|libreoffice-kit\/frame-forwarding\/prebuilds\/|bare-[^/]+\/prebuilds\/|pi-tui\/.*\.node$|pnpm\/dist\/node_modules\/@reflink\/reflink-(?:darwin|win32)-|pnpm\/dist\/vendor\/fastlist-[\w.-]+\.exe$/.test(local))throw Error(`Unreviewed foreign payload: ${local}`);
   rmSync(path);removed.push(local);
  }
 }
}
walk(stage);
const glibcMinimum=elfRequirements.flatMap(item=>item.glibc).sort((a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]??0)-(y[i]??0);if(d)return d;}return 0}).at(-1)??null;
if(glibcMinimum&&Number(glibcMinimum.split('.')[1])>39)throw Error(`Release requires glibc ${glibcMinimum}, beyond Ubuntu 24.04`);
writeFileSync(join(stage,'build-info.json'),JSON.stringify({upstream:{repository:'https://github.com/deepseek-ai/deepseek-harness.git',commit:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim()},node:'24.22.3',pnpm:'11.28.5',architecture:'s390x',byteOrder:'BE',buildMode,targetRuntimeTested:false,targetRuntimeEvidence:buildMode==='native'?'Native build only; acceptance reports must be supplied separately':'Not executed: host simulation, source and ELF checks only',supportedDistribution:'Ubuntu 24.04',buildHost:process.arch,glibcMinimum,elfRequirements,builtAt:new Date().toISOString(),removedForeignPayloads:removed},null,2)+'\n');
