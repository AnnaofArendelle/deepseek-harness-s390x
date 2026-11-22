/** Refuse leaked credentials, nonrelocatable links and mismatched ELF payloads. */
import {readdirSync,openSync,readSync,closeSync,lstatSync,readlinkSync,existsSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
const root=resolve(process.argv[2]);
let elfCount=0;
function walk(dir) {
 for(const name of readdirSync(dir)) {
  const path=join(dir,name),stat=lstatSync(path);
  if(/(^\.env($|\.)|\.pem$|^\.credentials|^\.deepseek-test-key$)/.test(name))throw Error(`Credential-shaped release file: ${relative(root,path)}`);
  if(stat.isSymbolicLink()) {
   const link=readlinkSync(path),target=resolve(dir,link),local=relative(root,target);
   if(isAbsolute(link)||local==='..'||local.startsWith('../'))throw Error(`Release link escapes: ${path}`);
   continue;
  }
  if(stat.isDirectory()) {walk(path);continue;}
  if(stat.size<4)continue;
  const bytes=Buffer.alloc(64),fd=openSync(path,'r');try{readSync(fd,bytes,0,64,0)}finally{closeSync(fd)}
  if(bytes.subarray(0,4).equals(Buffer.from([127,69,76,70]))) {
   if(bytes[4]!==2||bytes[5]!==2||bytes.readUInt16BE(18)!==22)throw Error(`Wrong ELF: ${path}`);
   elfCount++;
  }
  if(name.endsWith('.node')&&!bytes.subarray(0,4).equals(Buffer.from([127,69,76,70])))throw Error(`Foreign addon: ${path}`);
 }
}
walk(root);if(elfCount<5)throw Error('Required native payload is incomplete');
for(const required of ['node/bin/node',
 'app/node_modules/node-pty/build/Release/pty.node',
 'app/node_modules/@deepseek-ai/node-addon-system-linux-s390x/bin/landlock-run',
 'app/node_modules/@deepseek-ai/node-addon-system-linux-s390x/bin/glibc/system.node',
 'app/node_modules/@deepseek-ai/node-addon-system-linux-s390x/bin/musl/system.node',
 'app/node_modules/@deepseek-ai/node-addon-system-linux-s390x/bin/glibc/process.node',
 'app/node_modules/@img/sharp-linux-s390x/lib/sharp-linux-s390x-0.35.5.node',
 'app/node_modules/@img/sharp-libvips-linux-s390x/lib/libvips-cpp.so.8.18.7',
 'app/node_modules/@vscode/ripgrep-linux-s390x/bin/rg']) {
 if(!existsSync(join(root,required)))throw Error(`Required target payload missing: ${required}`);
}
console.log(JSON.stringify({test:'release-integrity',elfCount,status:'passed'}));
