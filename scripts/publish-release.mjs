/** Publish only after all required CI jobs succeed; preserve an existing successful release. */
import {writeFileSync,readdirSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const tag=process.env.RELEASE_TAG;
if(!/^s390x-[a-f0-9]{12}-[a-f0-9]{8}$/.test(tag??''))throw Error('Invalid release tag');
function gh(args){const r=spawnSync('gh',args,{encoding:'utf8'});if(r.error)throw r.error;return r}
const existing=gh(['release','view',tag,'--json','isDraft']);
if(existing.status===0){
 if(JSON.parse(existing.stdout).isDraft)throw Error('Existing draft must be reviewed before publication');
 console.log('Successful release already exists; leaving its assets intact');
}else{
 const infoFile=readdirSync('dist').find(name=>name.endsWith('.build-info.json'));
 if(!infoFile)throw Error('Build information missing');
 const info=JSON.parse(readFileSync('dist/'+infoFile,'utf8'));
 if(info.buildMode!=='cross'||info.targetRuntimeTested!==false)throw Error('Unexpected CI validation claim');
 writeFileSync('release-notes.md',`DeepSeek Harness Linux s390x adaptation of official commit ${info.upstream.commit}.\n\nAutomatically cross compiled on GitHub Ubuntu x64. Source, TypeScript/Web builds, host unit tests, s390x big-endian simulations and target ELF/symbol integrity passed. **This CI artifact has not been run in a target s390x environment.**\n\nSee README for installation, manual native builds and supported features. Checks, dependency inventory, SHA-256 and build information are attached. IBM acceptance reports in the repository apply to the initial pinned native build only.\n`);
 const assets=readdirSync('dist').filter(name=>/^deepseek-harness-.*\.(tar\.gz|sha256|json)$/.test(name)||name==='checks.tar.gz').map(name=>'dist/'+name);
 if(assets.length<5)throw Error('Release assets incomplete');
 const result=gh(['release','create',tag,...assets,'--draft','--target',process.env.GITHUB_SHA,'--title',`DeepSeek Harness s390x ${tag.slice(6)}`,'--notes-file','release-notes.md',...(process.env.RELEASE_PRERELEASE==='true'?['--prerelease']:[])]);
 if(result.status!==0)throw Error(result.stderr);
 const published=gh(['release','edit',tag,'--draft=false']);
 if(published.status!==0)throw Error(published.stderr);
 console.log(result.stdout.trim());
}
