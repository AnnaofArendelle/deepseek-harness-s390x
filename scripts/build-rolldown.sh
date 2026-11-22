#!/usr/bin/env bash
# Build the reviewed OXC big-endian fix; retain the Rust dependency lock.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
source_dir=$(realpath "${1:-$root/build/upstream}")
[[ $(uname -m) == s390x ]] || exit 0
export PATH="$root/.cache/toolchain/bin:$HOME/.cargo/bin:$PATH"
[[ $(rustc --version) == 'rustc 1.98.0 '* ]]
work="$root/build/rolldown"
if [[ ! -d "$work/source/.git" ]]; then
  mkdir -p "$work"
  git clone --depth=1 --branch v1.2.7 https://github.com/rolldown/rolldown.git "$work/source"
  [[ $(git -C "$work/source" rev-parse HEAD) == 26b4c6e56c5553d72a910d0f73d60fa331c0ed88 ]]
  curl -fL --retry 3 https://crates.io/api/v1/crates/oxc_estree/0.148.0/download -o "$work/oxc-estree.crate"
  printf '%s  %s\n' 4ac33adcec9582af677f3007e282530f7c8c507df7a3cb335383b79c0c57f574 "$work/oxc-estree.crate" | sha256sum -c -
  tar -xf "$work/oxc-estree.crate" -C "$work"
  patch --fuzz=0 -p1 -d "$work/oxc_estree-0.148.0" < "$root/patches/dependencies/oxc_estree-0.148.0-big-endian.patch"
  printf '\n[patch.crates-io]\noxc_estree = { path = "../oxc_estree-0.148.0" }\n' >> "$work/source/Cargo.toml"
  node --input-type=module - "$work/source/Cargo.lock" <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
const file=process.argv[2], text=readFileSync(file,'utf8');
const old=/\[\[package\]\]\nname = "oxc_estree"\nversion = "0\.148\.0"\nsource = "[^"\n]+"\nchecksum = "[^"\n]+"\n/;
if(!old.test(text)) throw Error('Pinned OXC lock entry missing');
writeFileSync(file,text.replace(old,'[[package]]\nname = "oxc_estree"\nversion = "0.148.0"\n'));
JS
fi
export CARGO_BUILD_JOBS=1 CARGO_PROFILE_RELEASE_LTO=false CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16
cargo build --locked --manifest-path "$work/source/Cargo.toml" -p rolldown_binding --release
binding="$source_dir/node_modules/.pnpm/@rolldown+binding-linux-s390x-gnu@1.2.7/node_modules/@rolldown/binding-linux-s390x-gnu/rolldown-binding.linux-s390x-gnu.node"
[[ -f "$binding" ]]
# pnpm store files may be hard linked. Replace the file instead of changing the store.
cp "$work/source/target/release/librolldown_binding.so" "$binding.s390x-new"
mv "$binding.s390x-new" "$binding"
node "$root/tests/parser-regression.mjs" "$source_dir"
