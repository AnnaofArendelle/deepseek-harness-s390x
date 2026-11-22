#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
bash scripts/bootstrap-node.sh
export PATH="$root/.cache/toolchain/bin:$PATH"
node scripts/prepare-source.mjs build/ci-source "${DSH_UPSTREAM_REF:-$(node -p "require('./upstream.lock.json').commit")}"
bash scripts/install-dependencies.sh build/ci-source
bash scripts/ci-build-x64.sh build/ci-source
