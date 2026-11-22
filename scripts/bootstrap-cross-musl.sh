#!/usr/bin/env bash
# Compile musl with the target compiler; no target executable is run.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
work="$root/.cache/cross-musl"
prefix="$work/install"
checksum=a9a118bbe84d8764da0ea0d28b3ab3fae8477fc7e4085d90102b8596fc7c75e4
mkdir -p "$work"
if [[ ! -f "$work/musl-1.2.5.tar.gz" ]]; then
  curl -fL --retry 4 https://musl.libc.org/releases/musl-1.2.5.tar.gz -o "$work/musl-1.2.5.tar.gz"
fi
printf '%s  %s\n' "$checksum" "$work/musl-1.2.5.tar.gz" | sha256sum -c - >&2
if [[ ! -x "$prefix/bin/musl-gcc" ]]; then
  tar -xzf "$work/musl-1.2.5.tar.gz" -C "$work"
  cd "$work/musl-1.2.5"
  CC=s390x-linux-gnu-gcc CROSS_COMPILE=s390x-linux-gnu- \
    ./configure --target=s390x-linux-gnu --prefix="$prefix" > "$work/configure.log" 2>&1
  make -j2 > "$work/build.log" 2>&1
  make install >> "$work/build.log" 2>&1
fi
printf '%s\n' "$prefix/bin/musl-gcc"
