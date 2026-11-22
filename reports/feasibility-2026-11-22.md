# DeepSeek Harness s390x 可行性评估

评估日期：2026-11-22，Asia/Singapore。当前阶段：调查和技术探测；尚未安装 DSH 全量依赖、构建 DSH、修改上游源码或部署服务。

## 结论

**值得进入实施阶段：WebUI、DeepSeek Agent、持久终端、后台任务和会话存储有明确的 s390x 适配路线。上游当前版本不能直接原样安装并完整运行，不能把此次探测称为 DSH 编译成功。**

主要障碍是 Koffi 不支持大端、Node 内部模块加载器不支持 s390x、DSH 系统原生包缺少平台声明，以及终端检测中的架构与字节序假设。这些核心障碍可以通过有针对性的源码修改解决，不需要重写 Agent 或 WebUI。

“所有可选插件都在同一台 s390x 上原生运行”目前不能保证：本地 Chromium/Electron、Claude Code 二进制、CUA 驱动、SenseVoice/ONNX 等还有独立限制。应逐项记录能保留的实现、替代实现和确实不能在本机运行的组件，不能把删除功能或静默降级计为成功。

最终 CI/CD **不得通过 SSH 连接 SERVER_IP_REDACTED，也不得依赖该 IBM 机器**。IBM 机器仅供实施期间临时真机验证。这一限制是用户在调查期间明确补充的要求。

## 调查基线

- 官方上游：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。
- 检查分支：`master`。
- 固定提交：`2e39e70496aa02986ca6a820c5d497e816b69d7e`，提交时间 2026-11-18 18:58:42 +08:00。
- 源码版本：`0.2.2-rc.5`；要求 Node `>=24.9.0`，包管理器固定 `pnpm@11.28.5`。不应照搬旧教程的 pnpm 10 配置。
- MIT 许可证允许修改和再分发；需要保留版权、许可证和第三方声明。
- 已克隆源码到工作区 `investigation/upstream/`；调查下载物不进入后续发布仓库。
- 锁文件包含 416 个 importer、1756 条第三方包记录。自动列出的 357 条平台／构建工具记录并不等于 357 个原生模块。
- 以 CLI、base、Web bundle 和 frontend 为入口，保守追踪运行依赖及 optional/peer 边，得到 351 个 workspace 包、59 个直接外部依赖名。该集合比实际启用插件更多；开发依赖和运行时激活情况需在实施安装时进一步核验。

依赖元数据清单见 [dependency-platform-inventory.json](dependency-platform-inventory.json)，workspace 关系见 [runtime-workspace-closure.json](runtime-workspace-closure.json)。这些清单用于后续安装审计，不能替代对安装产物中所有 ELF、`.node`、WASM、下载脚本和启动路径的检查。

## SSH 与服务器实测

使用工作区私钥、`IdentitiesOnly=yes` 和用户指定账户/地址，增加批处理模式、连接超时及只读探测命令进行连接。

首次连接在密钥交换阶段被远端关闭；等待后第二次连接成功。后续调查使用 OpenSSH ControlMaster 复用连接，减少重复握手。

| 项目 | 实测结果 |
|---|---|
| 架构 | `s390x`，Big Endian |
| 系统 | Ubuntu 24.04.5 LTS，Linux 6.8 |
| CPU | 2 个逻辑 CPU，IBM z/VM |
| 内存 | 约 3.9 GiB，无 swap |
| 磁盘 | 50 GB 根盘，约 44 GB 可用 |
| 已有工具 | GCC/G++ 13.3、Make、Git、Python 3.12.3、curl、wget |
| 缺少工具 | Node.js、pnpm、Cargo、Docker、pkg-config、bubblewrap、ripgrep |
| sudo | 非交互 sudo 可用 |
| 出站网络 | npm registry、nodejs.org、GitHub HTTPS 成功 |
| Landlock | LSM 已启用，系统调用探测返回 ABI 4 |
| systemd | 用户 manager 正常，`systemd-run --user --scope /bin/true` 成功 |
| cgroup | 用户 slice 有 cpu、memory、pids 控制器 |

Ubuntu 仓库的默认 Node 候选为 18.19.1，不满足 DSH。官方 Node 24 已提供 s390x Linux tarball。

### 已完成的最小技术验证

1. 临时下载官方 `node-v24.22.3-linux-s390x.tar.xz`，校验官方 SHA-256：`b5dbeb563ffb81946478fd765ae92efc21117e410e4e9b7d966bf59b00cee55d`。
2. 在 IBM 真机上执行 Node 24.22.3，确认 `process.arch=s390x`、字节序 BE。
3. `node:sqlite` 创建内存表、写入和读取成功。
4. `node:zlib` Zstandard 压缩和解压成功。
5. 使用 `--expose-internals` 成功访问 DSH 启动需要的 ESM/CJS loader、helpers、utils、resolve，并确认条件集合接口存在。
6. 热更新还会访问 `internal/bootstrap/realm`；直接 require 失败。通过 `internal/test/binding` 可取得 `internalBinding('modules')`，其 `readPackageJSON`、`getPackageScopeConfig`、`getPackageType` 均存在。这是 Node 私有测试接口，运行时会发出警告，必须固定 Node 版本并覆盖 HMR 行为测试后才能采用；仅加启动参数不够。
7. 将上游未修改的 Landlock C 源码传至临时目录，用现有 GCC 编译成功；产物为 IBM S/390 的 64 位 MSB ELF；功能探测报告 `partially enforced (older ABI)`，符合宿主 ABI 4 的事实。未验证完整 npm 打包、静态 musl 构建或所有沙箱行为。

所有上述远端临时 Node 和 C 编译目录已清理。探测未永久安装工具链、修改防火墙或启动长期服务。

## 核心原生依赖与适配路线

| 组件 | 当前支持情况／阻塞 | 可行方案与验证重点 |
|---|---|---|
| Node 24 | 官方提供 linux-s390x；已真机运行 | 固定并校验 runtime，附 headers；验证模块解析、SQLite、压缩和所有启动子进程 |
| pnpm 11.28.5 | 已检查发布 tarball，入口为 JS | 固定上游要求的版本；审查安装脚本，不全局跳过原生构建 |
| `@deepseek-ai/node-addon-system` 0.1.2 | 只声明 Linux/macOS 的 x64、arm64；构建脚本在 s390x 抛出“no declared binaries” | 新增 linux-s390x 平台包和 optional 依赖、prebuilds 声明；编译 flock Node-API 和 Landlock；补齐打包／加载验证 |
| `node-addon-require-builtin` 0.1.9 | 无 s390x 包；源码 getter 解码和 V8 context reader 仅支持部分架构，直接重编译仍不可用 | 优先为 DSH 接入已探测的 `--expose-internals` 路径，并适配 boot 和 HMR；若无法保持热更新语义，再移植该 addon 的 s390x ABI／指令解码 |
| `koffi` 3.1.1 | 安装器及加载代码明确拒绝大端；无 s390x ABI 实现 | 不仅删除检查。Linux 仅需要的 `execve/fcntl` 改用小型 C Node-API，或评估 Node `process.execve` 配合 native fcntl；必须保留 fd 3、CLOEXEC、O_NONBLOCK、参数、环境和 errno 语义 |
| Koffi 的其他消费者 | Windows ACL、Win32 process、Windows 文件操作和 macOS/Windows native picker 等 | 保持平台条件加载；安装依赖声明和打包 closure 同步调整，不能为整个 Koffi 包造无功能假实现 |
| `node-pty` 1.2.0-beta.15 | 发布包有 POSIX 源码及 node-gyp fallback；尚未在目标上编译 | 原生重建，保留上游 patch；测试交互输入、ANSI、resize、Ctrl-C、前台进程组、后台存活、退出和清理 |
| 终端 process inspector | 只有 x64/arm64 syscall 表；fd_set 首字节、pollfd 用 LE 读取 | 新增 s390x syscall 表及原生字节序处理；真机测试 read/select/pselect/poll/ppoll/epoll 等输入等待状态 |
| SQLite 存储 | 使用 Node 内置 SQLite，不是必须另编 `better-sqlite3` | SQLite 与 flock 配合验证并发租约、锁竞争、重启恢复、查询、会话持久化 |
| Sharp 0.35.5／libvips 1.3.4 | 锁文件和 npm 均有 s390x 构件 | 安装后检查 ELF、最低 glibc 版本和真实图像操作；现有系统 libvips 8.15 不应盲目替代所需版本 |
| esbuild、Rollup、Rolldown、oxc-resolver、oxlint、ripgrep | 当前锁文件均有 s390x 构件 | 优先使用固定版本和包完整性校验；加载／执行验证。oxlint 支持不代表 `oxlint-tsgolint` 支持 |
| Lightning CSS 1.33.0 | 无 s390x 发布包；用于 stylesheet 校验及部分构建链 | 评估源码构建或同版本 WASM 适配，校验 API；也可在 x64 CI 运行架构无关的样式检查 |
| Lefthook、jscpd、oxlint-tsgolint | 当前只提供部分 CPU 的二进制；主要是开发检查工具 | 保留检查在 x64 CI 执行；需要本机工具时尝试 Go/Rust 构建。Lefthook 安装脚本已有 CI 跳过机制 |

上游终端 syscall 与字节序问题不是只影响“显示”：错误识别输入等待状态会影响 Agent 如何操作和判定终端任务，必须纳入验收。

实测 s390x 系统调用号：read=3、select=142、poll=168、epoll_wait=251、pselect6=301、ppoll=302、epoll_pwait=312。Landlock 的 444/445/446 与上游 fallback 常量一致。

## 附加功能与架构限制

| 功能 | 评估 |
|---|---|
| 浏览器中的 WebUI、xterm、PDF.js | 在访问者浏览器执行，与服务器 CPU 架构分离；仍要验证上传、PDF、WebSocket、远程目录选择等全流程 |
| PDF.js 的 optional `@napi-rs/canvas` 1.0.8 | 没有 s390x 构件，依赖 Rust/Skia。浏览器 Canvas 可能足以满足 Web PDF 展示；如果确实需要服务器渲染，可评估 Cairo node-canvas 适配。必须先确认实际调用路径 |
| LibreOffice Kit 0.2.3 | 官方 Linux 路线已有 WASM 引擎，可尝试保留转换和预览；当前只确认源码/元数据，未在 s390x 运行。系统 LibreOffice 可作为明确实现的替代 provider；不假定其 API 或结果与 Kit 等价 |
| Office/Python 工具环境 | primary-runtime 和 SDK 单文件打包只声明 x64/arm64。服务器可用系统 Python/venv；如交付 bundled runtime，需要新增 s390x 元数据和 wheel/source 构建，不应沿用错误架构 wheel |
| DeepSeek 自有 Agent/subagent/jobs/goal/schedule/MCP | 主要为 TS 和远程模型 API，预计可保留；需要真实模型密钥完成实际 Agent 闭环，mock 通过不等于真 API 通过 |
| Codex 子 Agent | 上游 @openai/codex 未提供 s390x 二进制。其 Rust 源码可研究移植，工作量独立于 DSH 核心，尚未验证；不能声称已有可运行版本 |
| Claude Code 子 Agent | SDK 携带的平台二进制无 s390x。不能承诺把其专有 CLI 从源码编出来；可研究有明确配置的外部执行环境或其他 provider |
| Playwright／Puppeteer 本地浏览器 | 缺少常规 s390x Chromium/Chrome 构件；自行移植整个浏览器成本很高。可保留外部 CDP／MCP 浏览器 provider；在 x64 CI 浏览器中测试 s390x 服务的 WebUI |
| CUA driver／`@ubjs/node` | 无 s390x 平台包。需要单独研究源码移植或外部 provider；桌面控制不能计入已支持功能 |
| SenseVoice／sherpa-onnx | 当前发布包无 s390x；ONNX Runtime 的大端支持和算法依赖是高风险项。可研究源码或服务化实现，不能以禁用语音冒充完整保留 |
| Electron Desktop | 无官方 s390x Electron；这台服务器的主要交付目标应为 Web 服务。其桌面壳和 macOS/Windows 原生功能需在支持的平台使用 |
| Python SDK 单文件 exe | 上游 pkg/目标矩阵只有 x64/arm64，需要额外移植；初期可交付 Node runtime 加 JS/native 模块目录的可安装 tarball |

## 0.0.0.0 与公网访问

上游存在至少两处 wildcard 拒绝：

- `packages/host/webserver/src/index.ts` 的 Config host 校验。
- `packages/bundle/web-app/src/startup.ts` 的 `--host` 校验及 help。

实施要同时处理监听地址、内部可连接 origin 和对外公告 URL。`0.0.0.0` 是监听所有接口的地址，不能作为用户公网访问地址或正常的服务发现地址。

目标部署参数语义为：监听 `0.0.0.0:3080`，公告 `http://SERVER_IP_REDACTED:3080/`，显式信任 `SERVER_IP_REDACTED:3080`。保留上游 token/cookie 认证、Host/Origin 一致性检查和 WebSocket 认证。仅修改 host 校验不代表 API/WebSocket 已可从公网使用。

现有上游已支持 `--public-url`、`--trusted-host` 以及 TLS 证书参数；这些可以用于适配后的部署。浏览器设置文档动作存在 loopback 条件，需要确认它对应本机应用动作还是必要的远程配置功能，再选择有意义的处理方式，不能整体伪造 loopback 状态。

**公网当前未打通。** 调查曾启动自动退出的 Python HTTP 探针监听 0.0.0.0:3080：服务器 `127.0.0.1:3080` 返回成功，公网 HTTP 请求未进入服务。随后查看 nft/iptables，确认 INPUT 仅放行新建 TCP 22、ICMP 和已建立连接，末尾拒绝其他入站连接。实施时需要在该拒绝规则前放行实际 DSH 端口并持久化，再进行真正的外部 HTTP/WebSocket 验证；其他云侧限制届时以实测判定。此次没有修改规则。

## 独立于 IBM 机器的 GitHub CI/CD

GitHub Actions runner 最新官方发行资产没有 s390x，因此不能直接假定存在托管或官方 self-hosted s390x runner。采用 GitHub x64 托管 runner 上的 QEMU 路线可行，但需要验证时长和系统级测试环境。

1. x64 runner 完成源码拉取、固定 commit/版本解析、依赖审计、补丁应用，以及适合 x64 执行的检查。TypeScript、浏览器 JS 和 Web 静态资源可在 x64 构建，以降低仿真成本。
2. QEMU user-mode 加 s390x 容器执行目标架构的 C/Node-API 构建、依赖安装及可适用的运行测试；也可使用固定 cross toolchain 生成产物，再在仿真中加载。每个 `.node` 和 ELF 都必须验证为 s390x，不能把 x64 node_modules 复制到发行包。
3. 需要真实 s390x kernel/systemd/`/proc` 的终端、cgroup、进程清理和沙箱测试，在 `qemu-system-s390x` 的完整 VM 中运行；通过串口/测试盘导出结果，不连接 IBM 服务器。QEMU user-mode 共享宿主内核，不能替代这类测试。已确认官方 QEMU 提供 s390-ccw-virtio 机器类型、Ubuntu 发布 s390x cloud image；VM 流程尚未实际构建。
4. x64 Playwright 浏览器访问同一 CI job 中的 s390x 服务，测试 WebUI、token 登录、RPC/WebSocket、终端和后台任务交互。
5. 分离任务、限制并行、缓存固定版本工具链／构建依赖；实测 QEMU 耗时后确认可在托管 job 时限内完成。不能提前承诺全量上游测试速度。
6. 工作流同时支持手动构建指定上游 ref、定期检查上游发布和版本变化，以及自身改动触发。记录 upstream SHA、patch 版本、Node/pnpm、产物 hash 和测试报告。
7. 上游更新只有在补丁能正确应用、依赖审计和必需测试全部通过时才发布新产物；失败保留上一版并给出 CI 失败证据。开发预览 API 有破坏性变化，不能保证任何未来提交均可无人工介入适配。

Docker 官方当前 `node:24.22.3-bookworm-slim` 清单不含 s390x，而 `24.22.3-trixie-slim` 包含 s390x；不能只按镜像名猜测架构。为贴近目标 Ubuntu 24.04/glibc 环境，更适合使用经 digest 固定的 s390x Ubuntu 基础镜像加已校验 Node tarball，或同系统版本的 VM；更高 glibc 的 Debian 构建产物不能自动认为兼容 Ubuntu 24.04。

## 实施规模、验收与未决事项

核心改造集中在少数平台适配点，但依赖安装、HMR、完整 terminal lifecycle、发行打包和 CI VM 集成需要多轮验证。当前 2 CPU/4 GiB IBM 实例可以作为真机测试环境；上游构建配置含 8 GiB Node heap 上限和并行步骤，完整本机编译可能触发 OOM。实施应采用串行构建、受控内存、必要 swap 或把架构无关构建放到本地／CI，先测峰值后选择策略。

必须分别验收：构建/类型检查、干净目录安装、启动和重启、持久会话和锁、真实 DeepSeek Agent 调用和工具执行、PTY 交互与信号、后台任务脱离前台及停止、WebUI 认证与重连、公网 HTTP/WebSocket、插件加载和更新、沙箱限制、s390x CI 构建及完整 VM 测试。最终报告须明确使用 mock、真实 API、user-mode 仿真、完整 VM 或 IBM 真机的证据类别。

进入计划模式后需要落实的选择包括：发行形式（推荐可安装 tarball，可另加 OCI 镜像）、核心功能的强制验收边界、语音/浏览器/外部 Agent 的尽量保留策略，以及公网 TLS 是否纳入最终交付。这些选择可以在计划中给出默认方案，不影响当前的可行性结论。

当前没有索取 GitHub 令牌、创建远程仓库或推送。后续应在本地代码、独立 CI 和 IBM 真机验收均完成后，按用户要求处理 GitHub 访问授权及推送。SSH 私钥已写入工作区 `.gitignore`，不能进入源码、发行包或 CI secrets。

## 调查证据文件

- [Node/SQLite/Zstandard 真机输出](evidence/server-node-probe.txt)
- [HMR 内部接口真机输出](evidence/server-hmr-internals-probe.txt)
- [Landlock C 编译与功能探测](evidence/server-landlock-build-probe.txt)
- [服务器能力及 syscall 表](evidence/server-capabilities.txt)
- [本机端口访问成功输出](evidence/server-port-self-probe.txt)
- [临时 HTTP 服务输出](evidence/server-public-http-probe.txt)
- [公网 HTTP 探测失败输出](evidence/public-http-error.txt)
- [最终监听和防火墙状态](evidence/server-final-network-state.txt)

主要源码位置均对应上述固定上游提交；私有 API、可选组件和 QEMU 路线尚待实施测试，不属于已完成支持。
