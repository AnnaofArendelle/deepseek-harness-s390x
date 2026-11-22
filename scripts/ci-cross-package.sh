#!/usr/bin/env bash
# Consume checked host JavaScript and cross build only the target runtime payload.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
bash scripts/bootstrap-node.sh
export PATH="$root/.cache/toolchain/bin:$PATH" CI=true
source_dir=${DSH_CROSS_WORKSPACE:-"$root/build/cross-source"}
source_dir=$(realpath -m "$source_dir")
artifact=${1:-"$root/build/ci/js-artifacts.tar.gz"}
ref=${DSH_UPSTREAM_REF:-$(node -p "require('./upstream.lock.json').commit")}
node scripts/prepare-source.mjs "$source_dir" "$ref"
tar -xzf "$artifact" -C "$source_dir"
# Deploy production dependencies directly. Build tooling and host native addons
# are not installed into this target workspace.
DSH_BUILD_MODE=cross bash scripts/package-release.sh "$source_dir"
