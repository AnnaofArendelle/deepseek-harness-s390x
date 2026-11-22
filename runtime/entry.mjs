/** Relocatable carrier for the CLI and its selected child runner. */
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const selection = process.env.DSH_SUBPROCESS_RUNNER;
if (process.env.DSH_PTC_RUNTIME_NODE === '1') {
  delete process.env.DSH_PTC_RUNTIME_NODE;
  await import('@deepseek-ai/dsh-ptc-runtime-node/process');
} else if (selection !== undefined) {
  delete process.env.DSH_SUBPROCESS_RUNNER;
  const {runSelectedSubprocessRunner} = await import('@deepseek-ai/dsh-subprocess-local/runner');
  await runSelectedSubprocessRunner(selection);
} else {
  const {runCli} = await import('@deepseek-ai/dsh/lib/bin.js');
  await runCli({packageManager: {command: resolve(root,'node/bin/node'),args:[resolve(root,'pnpm/bin/pnpm.cjs')],
    env:{PATH: `${resolve(root,'node/bin')}${delimiter}${process.env.PATH ?? ''}`}}});
}
