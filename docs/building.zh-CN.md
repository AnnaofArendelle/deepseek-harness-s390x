# 源码构建指南

[English](building.md) | **简体中文** | [项目首页](../README.zh-CN.md)

## 固定基线

| 组件 | 版本 |
|---|---|
| DeepSeek Harness | `0.2.2-rc.5`，提交 `2e39e70496aa02986ca6a820c5d497e816b69d7e` |
| Node.js | `24.22.3` |
| pnpm | `11.28.5` |
| s390x 原生 Web 构建所需 Rust | `1.98.0` |

上游源码下载到独立构建目录。补丁严格匹配原始上下文，不允许偏移或模糊匹配；使用干净目录，补丁冲突或未知原生依赖会中止打包。

## s390x 原生编译

在 Ubuntu s390x 的本适配仓库根目录执行。安装系统工具：

```bash
sudo apt-get update
```

```bash
sudo apt-get install -y build-essential git curl ca-certificates python3 musl-tools pkg-config xz-utils cmake ninja-build
```

准备固定运行时：

```bash
./scripts/bootstrap-node.sh
```

```bash
export PATH="$PWD/.cache/toolchain/bin:$PATH"
```

依次准备源码、安装依赖、构建和打包：

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

产物位于 `dist/`。s390x Web 构建从固定 Rolldown/OXC 源码编译，并应用大端 JSON 修正；`scripts/build-rolldown.sh` 校验来源和 crate SHA-256，保留 Cargo.lock。原生构建入口安装固定 Rust 工具链。

构建串行执行以控制内存。4 GiB 环境的聚合类型检查可能大量换页，可根据实际容量配置 swap。真机验收使用逐项目 Host/Client 检查，聚合检查在 x64 完成；仅编译成功不等于完整运行验收。

## 本地 x64 交叉编译

在 Linux x64 的仓库根目录安装交叉工具：

```bash
sudo apt-get update
```

```bash
sudo apt-get install -y musl-tools pkg-config gcc-s390x-linux-gnu g++-s390x-linux-gnu binutils-s390x-linux-gnu make python3 xz-utils
```

执行与 CI 相同的入口：

```bash
./scripts/ci-prepare-x64.sh
```

```bash
./scripts/ci-cross-package.sh
```

需预留足够临时空间。交叉编译不执行目标二进制，包标注 `targetRuntimeTested: false`。

## CI 与上游更新

[构建工作流](https://github.com/AnnaofArendelle/deepseek-harness-s390x/blob/main/.github/workflows/build-s390x.yml)使用 Ubuntu 24.04 x64 托管 runner，完成：

- TypeScript/Web 构建、聚合类型检查和相关上游测试。
- Host 单元、s390x 系统调用、大端 `fd_set`/`pollfd` 和 ELF 拒绝路径模拟。
- GCC 交叉编译平台绑定与 node-pty、musl 静态 Landlock，校验并下载目标 Node.js、Sharp、ripgrep。
- 依赖清单、目标 ELF/导出检查、压缩包组装；必需检查通过后发布。

CI 不 SSH 连接 IBM，不执行 s390x 二进制，不运行 QEMU 或完整 VM。模拟检查不能验证目标 addon 加载、PTY、cgroup、进程清理与实际内核沙箱。

支持代码变更、手动指定上游 ref、每日发行检查，包含预发布并排除草稿。PR 和开发分支生成候选包；main、手动和定时运行可发布。补丁冲突、锁文件不匹配、未知 native/WASM、异架构 ELF 或检查失败都会停止发布；定时检查已发布版本时跳过。

Release 标签同时记录上游与适配提交。固定原生版和人工复验首版交叉包具有真机证据，该证据不会自动适用于后续上游版本。已安装服务器仍由用户手动升级。
