import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const source = resolve(process.argv[2] ?? 'build/upstream');
const require = createRequire(resolve(source, 'node_modules/.pnpm/rolldown@1.2.7/node_modules/rolldown/package.json'));
const {parseSync} = await import(require.resolve('rolldown/utils'));
let cases = 0;
for (const value of ['中文😀', '\ud800', '\udfff', '\u0000', ...Array.from({length:32}, (_,i)=>'a'.repeat(i)+'#"\\\n'+'x'.repeat(32))]) {
  const parsed = parseSync('regression.js', `export const value=${JSON.stringify(value)};`);
  assert.equal(parsed.errors.length,0);
  assert.equal(parsed.program.body[0].declaration.declarations[0].init.value,value);
  assert.equal(parsed.program,parsed.program);
  cases++;
}
const ast = parseSync('regression.js', 'const a=12345678901234567890n;const b=/\\w+/giu;').program;
assert.equal(ast.body[0].declarations[0].init.value,12345678901234567890n);
assert.equal(ast.body[1].declarations[0].init.value.source,'\\w+');
console.log(JSON.stringify({test:'oxc-estree-escape-regression',architecture:process.arch,cases:cases+2,status:'passed'}));
