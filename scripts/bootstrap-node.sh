#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
version=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["node"])' "$root/upstream.lock.json")
case $(uname -m) in s390x) arch=s390x;; x86_64) arch=x64;; aarch64) arch=arm64;; *) exit 2;; esac
prefix=${1:-"$root/.cache/toolchain"}
mkdir -p "$prefix"
archive="node-v$version-linux-$arch.tar.xz"
if [[ ! -x "$prefix/node-v$version-linux-$arch/bin/node" ]]; then
  curl --fail --location --retry 4 "https://nodejs.org/dist/v$version/$archive" -o "$prefix/$archive"
  curl --fail --location --retry 4 "https://nodejs.org/dist/v$version/SHASUMS256.txt" -o "$prefix/SHASUMS256.txt"
  expected=$(awk -v name="$archive" '$2==name {print $1}' "$prefix/SHASUMS256.txt")
  if [[ "$arch" == s390x ]]; then
    pinned=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["nodeLinuxS390xSha256"])' "$root/upstream.lock.json")
    [[ "$pinned" == "$expected" ]]
  fi
  printf '%s  %s\n' "$expected" "$prefix/$archive" | sha256sum -c - >&2
  tar -xJf "$prefix/$archive" -C "$prefix"
fi
node_dir="$prefix/node-v$version-linux-$arch"
pnpm_version=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["pnpm"])' "$root/upstream.lock.json")
if [[ ! -f "$prefix/pnpm/package/bin/pnpm.cjs" ]]; then
  mkdir -p "$prefix/pnpm"
  PATH="$node_dir/bin:$PATH" npm pack --loglevel=error "pnpm@$pnpm_version" --pack-destination "$prefix/pnpm" >/dev/null
  tar -xzf "$prefix/pnpm/pnpm-$pnpm_version.tgz" -C "$prefix/pnpm"
fi
mkdir -p "$prefix/bin"
ln -sfn "$node_dir/bin/node" "$prefix/bin/node"
ln -sfn "$node_dir/bin/npm" "$prefix/bin/npm"
ln -sfn "$prefix/pnpm/package/bin/pnpm.cjs" "$prefix/bin/pnpm"
printf '%s\n' "$prefix/bin"
