#!/usr/bin/env node
/** Adjust reviewed install scripts on s390x while keeping all functional builds. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
if (process.arch !== 's390x') process.exit(0);
const source = resolve(process.argv[2]);
const file = resolve(source, 'pnpm-workspace.yaml');
let yaml = readFileSync(file, 'utf8');
for (const name of ['koffi', 'lefthook']) {
  const before = `  ${name}: true`;
  if (!yaml.includes(before)) throw new Error(`Expected reviewed install policy for ${name}`);
  yaml = yaml.replace(before, `  ${name}: false`);
}
yaml = yaml.replace('overrides:\n', 'overrides:\n  lightningcss: npm:lightningcss-wasm@1.33.0\n');
yaml = yaml.replace('patchedDependencies:\n', 'patchedDependencies:\n  lightningcss-wasm@1.33.0: patches/lightningcss-wasm@1.33.0.patch\n');
writeFileSync(file, yaml);
console.log('s390x: Koffi has no big-endian ABI; Linux uses the Node-API bridge. Lefthook checks run on x64. Other approved install scripts remain enabled.');
