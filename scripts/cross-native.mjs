/** Cross compile reviewed C/C++ sources. Verification reads ELF and symbols on the host. */
import {readFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const source=resolve(process.argv[2]),app=resolve(process.argv[3]),musl=resolve(process.argv[4]);
if(process.arch!=='x64'||process.platform!=='linux')throw Error('Cross build requires Linux x64');
const headers=resolve(dirname(process.execPath),'../include/node');
const system=join(source,'native/system');
const platform=join(system,'packages/linux-s390x');
const spec=JSON.parse(readFileSync(join(platform,'prebuilds.json'),'utf8'));
const sources={'landlock-run':'main.c',flock:'flock.c','linux-process':'linux-process.c'};
function compile(compiler,flags,file,output,libraries=[]){
 mkdirSync(dirname(output),{recursive:true});
 const pending=output+'.cross-new';
 const result=spawnSync(compiler,[...flags,'-o',pending,file,...libraries],{stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error(`Cross compiler failed: ${output}`);
 renameSync(pending,output);
 console.log(`cross: built ${output}`);
}
for(const binary of spec.binaries){
 let flags,compiler;
 if(binary.tool==='landlock-run'&&binary.kind==='static-musl'){
  compiler=musl;flags=['-std=c11','-Os','-Wall','-Wextra','-Werror','-static','-s'];
 }else if(['flock','linux-process'].includes(binary.tool)&&binary.kind==='node-api'&&binary.napi===8){
  if(!['glibc','musl'].includes(binary.libc))throw Error('Unreviewed libc');
  compiler=binary.libc==='musl'?musl:'s390x-linux-gnu-gcc';
  flags=['-std=c11','-O2','-Wall','-Wextra','-Werror','-fPIC','-fvisibility=hidden','-DNAPI_VERSION=8','-I',headers,'-shared'];
 }else throw Error('Unreviewed system build declaration');
 compile(compiler,flags,join(system,'packages/entry/src',sources[binary.tool]),join(platform,binary.path));
}
const {verifyPlatformBinaries}=await import(pathToFileURL(join(system,'scripts/repo.mjs')).href);
console.log(verifyPlatformBinaries(platform));
const launcher=execFileSync('s390x-linux-gnu-readelf',['-l',join(platform,'bin/landlock-run')],{encoding:'utf8'});
if(launcher.includes('INTERP')||launcher.includes('DYNAMIC'))throw Error('Landlock launcher is not static');
for(const binary of spec.binaries.filter(b=>b.kind==='node-api')){
 const symbols=execFileSync('s390x-linux-gnu-readelf',['--dyn-syms','--wide',join(platform,binary.path)],{encoding:'utf8'});
 for(const symbol of ['napi_register_module_v1','node_api_module_get_api_version_v1']){
  if(!symbols.split('\n').some(line=>line.includes(symbol)&&!line.includes(' UND ')))throw Error(`Missing exported ${symbol}`);
 }
}
const require=createRequire(join(app,'package.json'));
const pty=dirname(require.resolve('node-pty/package.json'));
const gyp=readFileSync(join(pty,'binding.gyp'));
if(createHash('sha256').update(gyp).digest('hex')!=='60087f9bc86f372a5ad49d15d7854140c29fac959aaa1fb2c8ffd0dc021595dd')throw Error('node-pty build declarations changed; review the cross build');
const api=dirname(createRequire(join(pty,'package.json')).resolve('node-addon-api/package.json'));
compile('s390x-linux-gnu-g++',['-std=gnu++17','-O2','-Wall','-fstack-protector-strong','-fPIC','-shared','-pthread','-DNAPI_CPP_EXCEPTIONS','-DNODE_GYP_MODULE_NAME=pty','-I',headers,'-I',api],join(pty,'src/unix/pty.cc'),join(pty,'build/Release/pty.node'),['-lutil']);
const symbols=execFileSync('s390x-linux-gnu-readelf',['--dyn-syms','--wide',join(pty,'build/Release/pty.node')],{encoding:'utf8'});
if(!symbols.includes('napi_register_module_v1'))throw Error('node-pty Node-API registration missing');
