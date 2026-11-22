/** Follow published upstream releases, including prereleases, without accepting draft releases. */
import {appendFileSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const lock=JSON.parse(readFileSync('upstream.lock.json','utf8'));
const requested=process.env.INPUT_UPSTREAM_REF,scheduled=process.env.GITHUB_EVENT_NAME==='schedule';
const headers={Accept:'application/vnd.github+json',...(process.env.GH_TOKEN?{Authorization:`Bearer ${process.env.GH_TOKEN}`}:{})};
async function api(path){const response=await fetch('https://api.github.com/'+path,{headers,signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`GitHub API returned ${response.status}`);return response.json()}
let ref=requested||lock.commit,prerelease=lock.version.includes('-'),shouldBuild=true;
if(scheduled||requested){
 const releases=(await api('repos/deepseek-ai/deepseek-harness/releases?per_page=100')).filter(r=>!r.draft&&r.published_at).sort((a,b)=>b.published_at.localeCompare(a.published_at));
 if(scheduled){if(!releases.length)throw Error('Upstream has no published release');ref=releases[0].tag_name;prerelease=releases[0].prerelease;}
 else {const release=releases.find(item=>item.tag_name===requested);if(release)prerelease=release.prerelease;}
}
if(!ref||ref.startsWith('-')||/[\s\x00]/.test(ref))throw Error('Invalid upstream reference');
// Resolve only the official repository. Source preparation independently records the resolved commit.
const probe=spawnSync('git',['ls-remote',lock.repository,ref,`refs/tags/${ref}`,`refs/tags/${ref}^{}`,`refs/heads/${ref}`],{encoding:'utf8'});
if(probe.status!==0)throw Error('Cannot resolve official upstream ref');
const matches=probe.stdout.trim().split('\n').filter(Boolean).map(line=>line.split(/\s+/));
const commit=/^[a-f0-9]{40}$/.test(ref)?ref:(matches.find(row=>row[1].endsWith('^{}'))??matches[0])?.[0];
if(!commit)throw Error('Upstream reference does not exist');
const revision=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});
if(revision.status!==0)throw Error('Cannot resolve adaptation revision');
const tag=`s390x-${commit.slice(0,12)}-${revision.stdout.trim().slice(0,8)}`;
if(scheduled&&process.env.GITHUB_REPOSITORY){const releases=await api(`repos/${process.env.GITHUB_REPOSITORY}/releases?per_page=100`);shouldBuild=!releases.some(r=>!r.draft&&r.tag_name===tag)}
const selection={ref,commit,tag,prerelease,shouldBuild};writeFileSync('build-selection.json',JSON.stringify(selection,null,2)+'\n');
if(process.env.GITHUB_OUTPUT)for(const [key,value] of Object.entries(selection))appendFileSync(process.env.GITHUB_OUTPUT,`${key}=${value}\n`);
console.log(selection);
