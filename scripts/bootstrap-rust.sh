#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
mkdir -p "$root/.cache"
version=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["rust"])' "$root/config/build-environment.lock.json")
if [[ -x "$HOME/.cargo/bin/rustc" ]] && [[ $("$HOME/.cargo/bin/rustc" --version) == "rustc $version "* ]]; then exit 0; fi
# rustup downloads the pinned toolchain and checks component SHA-256 values.
curl --fail --location --retry 3 --proto '=https' --tlsv1.2 https://sh.rustup.rs -o "$root/.cache/rustup-init.sh"
sh "$root/.cache/rustup-init.sh" -y --profile minimal --default-toolchain "$version" --no-modify-path
[[ $("$HOME/.cargo/bin/rustc" --version) == "rustc $version "* ]]
