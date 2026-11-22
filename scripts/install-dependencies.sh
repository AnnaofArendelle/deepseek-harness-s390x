#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
source_dir=${1:-"$root/build/upstream"}
export PATH="$root/.cache/toolchain/bin:$PATH"
[[ $(node --version) == v24.22.3 ]]
[[ $(pnpm --version) == 11.28.5 ]]
arch=$(node -p process.arch)
node "$root/scripts/configure-platform.mjs" "$source_dir"
if [[ "$arch" == s390x ]]; then
  cp "$root/config/locks/pnpm-s390x.yaml" "$source_dir/pnpm-lock.yaml"
fi
cd "$source_dir"
CI=true pnpm install --frozen-lockfile --child-concurrency=1
