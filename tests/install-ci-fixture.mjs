/** Install a CI fixture through the existing user profile; never ship it in the release. */
import {cpSync,mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const data=resolve(process.argv[2]),fixture=resolve(process.argv[3]);
const profile=join(data,'profiles/web'),module=join(profile,'node_modules/dsh-s390x-ci-fixture');
mkdirSync(module,{recursive:true,mode:0o700});
writeFileSync(join(module,'package.json'),JSON.stringify({name:'dsh-s390x-ci-fixture',version:'1.0.0',type:'module',main:'index.mjs'}));
cpSync(fixture,join(module,'index.mjs'));
// A dedicated test data directory has no user composition to preserve.
const patch=join(profile,'cordis.patch.yml');
const previous=existsSync(patch)?readFileSync(patch,'utf8'):'';
if(previous.includes('s390x-ci-fixture'))throw Error('CI fixture is already installed');
writeFileSync(patch,previous+'\n- insert:\n    - id: s390x-ci-fixture\n      name: dsh-s390x-ci-fixture\n',{mode:0o600});
