#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
source_dir=$(realpath "${1:-$root/build/upstream}")
export PATH="$root/.cache/toolchain/bin:$PATH"
[[ $(node --version) == v24.22.3 ]]
[[ $(pnpm --version) == 11.28.5 ]]
cd "$source_dir"
if [[ $(node -p process.arch) == s390x ]]; then
  bash "$root/scripts/bootstrap-rust.sh"
fi
"$root/scripts/build-rolldown.sh" "$source_dir"
node --expose-internals native/system/scripts/build.ts
node -e 'import("./native/system/scripts/repo.mjs").then(m=>console.log(m.verifyPlatformBinaries(`native/system/packages/${process.platform}-${process.arch}`)))'
export CI=true RAYON_NUM_THREADS=1
pnpm run build:artifacts --serial
if [[ $(node -p process.arch) == s390x ]]; then
  # Aggregate Host tests/scripts use >4 GiB; x64 CI checks the aggregate.
  node scripts/compile-referenced-projects.ts host-libraries
  node scripts/compile-referenced-projects.ts client
  node --expose-internals node_modules/vitest/vitest.mjs run --maxWorkers=1 \
    packages/host/webserver/tests/webserver.spec.ts \
    packages/boot/hmr/tests/package-manifest.spec.ts \
    packages/subprocess/subprocess-local/tests/process-inspector.spec.ts
else
  pnpm run build:check --serial
fi
