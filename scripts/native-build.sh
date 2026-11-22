#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
source_dir=${1:-"$root/build/upstream"}
export PATH="$root/.cache/toolchain/bin:$PATH"
[[ $(node --version) == v24.22.3 ]]
[[ $(pnpm --version) == 11.28.5 ]]
cd "$source_dir"
node --expose-internals native/system/scripts/build.ts
node -e 'import("./native/system/scripts/repo.mjs").then(m=>console.log(m.verifyPlatformBinaries(`native/system/packages/${process.platform}-${process.arch}`)))'
export CI=true RAYON_NUM_THREADS=1
pnpm run build:artifacts --serial
pnpm run build:check --serial
