/** Cross staging preserves upstream approvals except explicitly replaced target builds. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const hooks={updateConfig(config){
 if(!process.env.DSH_CROSS_SOURCE)throw Error('DSH_CROSS_SOURCE must name the patched workspace');
 const allowBuilds=Object.fromEntries(Object.entries(config.allowBuilds??{}).map(([key,value])=>{
  const marker=key.indexOf('@file:');
  if(marker<0||key.slice(marker+6).startsWith('//'))return [key,value];
  return [`${key.slice(0,marker+1)}${pathToFileURL(resolve(process.env.DSH_CROSS_SOURCE,key.slice(marker+6))).href}`,value];
 }));
 // node-pty is compiled immediately after deploy with the target C++ compiler.
 allowBuilds['node-pty']=false;allowBuilds.koffi=false;allowBuilds.lefthook=false;
 return {...config,allowBuilds,supportedArchitectures:{os:['linux'],cpu:['s390x'],libc:['glibc']}};
}};
