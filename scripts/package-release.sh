#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
source_dir=$(realpath "${1:-$root/build/upstream}")
toolchain=${DSH_TOOLCHAIN:-"$root/.cache/toolchain"}
export PATH="$toolchain/bin:$PATH" CI=true
mode=${DSH_BUILD_MODE:-native}
case "$mode" in
  native) [[ $(node -p process.arch) == s390x ]];;
  cross) [[ $(node -p process.arch) == x64 ]];;
  *) echo 'Unknown build mode' >&2; exit 1;;
esac
export DSH_BUILD_MODE="$mode"
version=$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1])).version" "$source_dir/package.json")
identity="deepseek-harness-$version-linux-s390x"
stage="${DSH_RELEASE_STAGE:-$root/build/release/$identity}"
[[ ! -e "$stage" ]] || { echo 'Select a fresh release staging directory' >&2; exit 1; }
mkdir -p "$stage/bin" "$root/dist"
cd "$source_dir"
deploy_options=(--config.pnpmfile="$source_dir/scripts/python-runtime-deploy.pnpmfile.mjs")
if [[ "$mode" == cross ]]; then
  export DSH_CROSS_SOURCE="$source_dir"
  deploy_options=(--cpu s390x --os linux --libc glibc --config.pnpmfile="$root/scripts/cross-deploy.pnpmfile.mjs")
fi
pnpm --filter dsh-python-runtime-closure deploy --prod --config.allow-unused-patches=true \
  --config.node-linker=hoisted --config.link-workspace-packages=true --config.hoist-workspace-packages=false \
  "${deploy_options[@]}" "$stage/app"
if [[ "$mode" == cross ]]; then
  musl=$(bash "$root/scripts/bootstrap-cross-musl.sh")
  node "$root/scripts/cross-native.mjs" "$source_dir" "$stage/app" "$musl"
  cp -a "$source_dir/native/system/packages/linux-s390x/bin" \
    "$stage/app/node_modules/@deepseek-ai/node-addon-system-linux-s390x/"
fi
node --input-type=module - "$stage/app" "$source_dir" <<'JS'
import {existsSync,symlinkSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const stage=process.argv[2],source=process.argv[3],modules=join(source,'node_modules');
// Staging helpers only import portable js-yaml, supplied by the deployed closure.
const temporaryLink=!existsSync(modules);
if(temporaryLink)symlinkSync(join(stage,'node_modules'),modules,'dir');
try {
 const {materializeStagedLinks,deduplicateStagedWorkspacePackages}=await import(pathToFileURL(join(source,'scripts/build-exe-for-python-sdk-staging.ts')).href);
 const {verifyStagedDependencies}=await import(pathToFileURL(join(source,'scripts/executable-packaging.ts')).href);
 await materializeStagedLinks(stage);await deduplicateStagedWorkspacePackages(stage,stage);await verifyStagedDependencies(stage);
} finally {if(temporaryLink)unlinkSync(modules);}
JS
if [[ "$mode" == cross ]]; then
  DSH_NODE_ARCH=s390x bash "$root/scripts/bootstrap-node.sh" "$toolchain/target" >/dev/null
  node_payload="$toolchain/target/node-v24.22.3-linux-s390x"
else
  node_payload="$toolchain/node-v24.22.3-linux-s390x"
fi
cp -a "$node_payload" "$stage/node"
cp -a "$toolchain/pnpm/package" "$stage/pnpm"
cp "$root/runtime/entry.mjs" "$stage/app/entry.mjs"
cp "$root/runtime/dsh" "$stage/bin/dsh"
cp "$root/runtime/dshctl" "$stage/bin/dshctl"
cp "$root/runtime/https-system.sh" "$stage/"
cp "$root/scripts/install.sh" "$root/scripts/manage-install.mjs" "$stage/"
cp "$root/scripts/verify-release.mjs" "$root/runtime/run-server.mjs" "$stage/"
cp "$root/README.md" "$root/README.zh-CN.md" "$root/LICENSE" "$stage/"
cp -a "$root/docs" "$stage/docs"
node "$root/scripts/prune-release.mjs" "$stage" "$source_dir"
node "$root/scripts/audit-installed.mjs" "$stage" "$stage/dependencies.json" s390x --release
node "$root/scripts/verify-release.mjs" "$stage"
if [[ "$mode" == native ]]; then "$stage/bin/dsh" --version; fi
cp "$stage/build-info.json" "$root/dist/$identity.build-info.json"
tar -C "$(dirname "$stage")" -czf "$root/dist/$identity.tar.gz" "$(basename "$stage")"
cd "$root/dist"
sha256sum "$identity.tar.gz" > "$identity.tar.gz.sha256"
cp "$stage/dependencies.json" "$identity.dependencies.json"
printf '%s\n' "$root/dist/$identity.tar.gz"
