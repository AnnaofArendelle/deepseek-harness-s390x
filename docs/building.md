# Building from source

**English** | [简体中文](building.zh-CN.md) | [Project home](../README.md)

## Pinned baseline

| Component | Version |
|---|---|
| DeepSeek Harness | `0.2.2-rc.5`, commit `2e39e70496aa02986ca6a820c5d497e816b69d7e` |
| Node.js | `24.22.3` |
| pnpm | `11.28.5` |
| Rust for the native s390x Web build | `1.98.0` |

Upstream source is downloaded into a separate build directory. Patches require exact context and refuse offsets/fuzzy matches. Use a clean directory; patch conflicts or unreviewed native dependencies stop packaging.

## Native s390x build

Run from an adaptation-repository checkout on Ubuntu s390x. Install the system tools:

```bash
sudo apt-get update
```

```bash
sudo apt-get install -y build-essential git curl ca-certificates python3 musl-tools pkg-config xz-utils cmake ninja-build
```

Prepare the pinned runtime:

```bash
./scripts/bootstrap-node.sh
```

```bash
export PATH="$PWD/.cache/toolchain/bin:$PATH"
```

Prepare, install, build, and package in order:

```bash
node scripts/prepare-source.mjs build/upstream
```

```bash
./scripts/install-dependencies.sh build/upstream
```

```bash
./scripts/native-build.sh build/upstream
```

```bash
./scripts/package-release.sh build/upstream
```

Artifacts are written to `dist/`. The s390x Web build compiles a fixed Rolldown/OXC source with the big-endian JSON correction; `scripts/build-rolldown.sh` verifies sources and crate checksums and keeps Cargo.lock. The native entry installs the pinned Rust toolchain.

Builds run serially to limit memory use. A 4 GiB system may swap heavily during aggregate type checks; size swap according to the environment. Hardware acceptance used individual Host/Client project checks, with aggregate checks completed on x64. Native compilation alone does not constitute complete runtime acceptance.

## Local x64 cross-compilation

On a Linux x64 checkout, install cross tools:

```bash
sudo apt-get update
```

```bash
sudo apt-get install -y musl-tools pkg-config gcc-s390x-linux-gnu g++-s390x-linux-gnu binutils-s390x-linux-gnu make python3 xz-utils
```

Run the same entry points used by CI:

```bash
./scripts/ci-prepare-x64.sh
```

```bash
./scripts/ci-cross-package.sh
```

Allow adequate temporary disk space. Cross-compilation does not execute the target binaries, and its packages are marked `targetRuntimeTested: false`.

## Continuous integration and upstream updates

The [build workflow](https://github.com/AnnaofArendelle/deepseek-harness-s390x/blob/main/.github/workflows/build-s390x.yml) uses Ubuntu 24.04 x64 hosted runners for:

- TypeScript/Web builds, aggregate type checks, and relevant upstream tests.
- Host unit tests and simulations of s390x syscalls, big-endian `fd_set`/`pollfd`, and ELF rejection paths.
- GCC cross-compilation of platform bindings and node-pty, a static musl Landlock launcher, and verified downloads of target Node.js, Sharp, and ripgrep.
- Dependency inventory, target ELF/symbol checks, archive assembly, and release publication after required checks pass.

CI does not use SSH to reach IBM, run s390x executables, or use QEMU/full-system VMs. Host simulation cannot verify target addon loading, PTYs, cgroups, process cleanup, or kernel sandbox behavior.

Changes, manual upstream refs, and daily release checks are supported, including upstream prereleases and excluding drafts. Pull requests and development branches create candidates; main, manual, and scheduled runs can publish. Patch conflicts, dependency-lock mismatches, unknown native/WASM payloads, foreign ELF, or failed checks stop publication. Already published scheduled versions are skipped.

Release tags identify both upstream and adaptation commits. The pinned native build and manually checked initial cross package have hardware evidence; that evidence does not automatically apply to later upstream releases. Installed servers remain under manual upgrade control.
