#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
source_dir=$(realpath "${1:-$root/build/upstream}")
export PATH="$root/.cache/toolchain/bin:$PATH" CI=true RAYON_NUM_THREADS=1
mkdir -p "$root/build/ci"
simulation="$source_dir/packages/subprocess/subprocess-local/tests/s390x-adaptation-simulation.spec.ts"
[[ ! -e "$simulation" ]]
cp "$root/tests/s390x-simulation.spec.ts" "$simulation"
trap 'rm -f "$simulation"' EXIT
"$root/scripts/native-build.sh" "$source_dir"
cd "$source_dir"
node --expose-internals node_modules/vitest/vitest.mjs run --maxWorkers=2 \
 packages/host/webserver/tests/webserver.spec.ts packages/bundle/web-app/tests/web-app.spec.ts \
 packages/boot/hmr/tests/package-manifest.spec.ts packages/subprocess/subprocess-local/tests/process-inspector.spec.ts \
 | tee "$root/build/ci/x64-check-report.txt"
{
  node --expose-internals node_modules/vitest/vitest.mjs run --maxWorkers=2 "$simulation"
  DSH_SOURCE="$source_dir" node --test "$root/tests/native-process.test.mjs" "$root/tests/platform-elf.test.mjs"
} > "$root/build/ci/simulation-report.txt" 2>&1
python3 "$root/scripts/archive-js.py" "$source_dir" "$root/build/ci/js-artifacts.tar.gz"
