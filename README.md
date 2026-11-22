# DeepSeek Harness for s390x

独立适配 Linux s390x 大端架构的 DeepSeek Harness。固定基线为官方 `0.2.2-rc.5` / `2e39e70496aa02986ca6a820c5d497e816b69d7e`，随包提供 Node `24.22.3` 和 pnpm `11.28.5`。

首版已完成 IBM 真机安装、功能与重启验收，独立 GitHub 托管 CI 的源码/模拟检查、交叉编译和自动发布全部成功。支持 Ubuntu 24.04 / glibc；Electron 桌面应用不在服务器包内。

[IBM 原生验证首包](https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases/tag/native-0.2.2-rc.5-s390x-b6d3d87) · [自动交叉首包](https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases/tag/s390x-2e39e70496aa-2adbb3a2) · [所有发行版（含预发布）](https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases) · [成功的 CI](https://github.com/AnnaofArendelle/deepseek-harness-s390x/actions/runs/44994504488)。

## 全新安装

### 1. 放行服务端口

以下命令适用于由 iptables 管理 INPUT 规则的 Ubuntu 服务器。不要混用于已有的 UFW/firewalld 管理配置。默认端口为 TCP 3080；云侧安全组也必须允许该端口。

```bash
sudo iptables -C INPUT -p tcp --dport 3080 -j ACCEPT 2>/dev/null ||
  sudo iptables -I INPUT 1 -p tcp --dport 3080 -j ACCEPT

sudo env DEBIAN_FRONTEND=noninteractive \
  apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

命令只增加规则，不清空现有规则。更换端口时同步更改防火墙、安装参数和 public URL。重启后检查规则与外部访问：

```bash
sudo iptables -C INPUT -p tcp --dport 3080 -j ACCEPT
sudo systemctl status netfilter-persistent --no-pager
```

若本机监听正常但外部访问超时，请检查云侧规则及上游网络。撤销规则：

```bash
sudo iptables -D INPUT -p tcp --dport 3080 -j ACCEPT
sudo netfilter-persistent save
```

### 2. 安装压缩包

从本仓库 Release 下载 `deepseek-harness-VERSION-linux-s390x.tar.gz` 及对应 `.sha256`，先校验，再解压。首版可优先使用上面的 IBM 原生验证包；自动交叉包的目标运行验证限制见 CI/CD 部分。

下载首版原生验证包：

```bash
release=https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases/download/native-0.2.2-rc.5-s390x-b6d3d87
curl -fLO "$release/deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz"
curl -fLO "$release/deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz.sha256"
sha256sum -c deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz.sha256
tar -xzf deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz
cd deepseek-harness-0.2.2-rc.5-linux-s390x
./install.sh --public-url http://SERVER_IP:3080/
```

```bash
sha256sum -c deepseek-harness-VERSION-linux-s390x.tar.gz.sha256
tar -xzf deepseek-harness-VERSION-linux-s390x.tar.gz
cd deepseek-harness-VERSION-linux-s390x
./install.sh --public-url http://SERVER_IP:3080/
```

默认程序目录为 `~/.local/lib/deepseek-harness-s390x`，命令链接为 `~/.local/bin/dsh`，数据目录为 `~/.local/share/deepseek-harness`。已有 `~/.local/bin/dsh` 时安装会拒绝覆盖。数据和程序分开保存；`--data /absolute/path` 可指定数据目录。

Office 预览使用系统 LibreOffice 和 Poppler。安装这些运行依赖不涉及现场源码编译：

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  libreoffice-writer libreoffice-calc libreoffice-impress \
  python3-uno poppler-utils fonts-dejavu-core
```

### 3. 启动

前台启动：

```bash
runtime="$HOME/.local/lib/deepseek-harness-s390x/current"
"$runtime/node/bin/node" "$runtime/manage-install.mjs" foreground
```

安装用户级 systemd 服务，并使服务在退出登录后继续运行、开机启动：

```bash
runtime="$HOME/.local/lib/deepseek-harness-s390x/current"
"$runtime/node/bin/node" "$runtime/manage-install.mjs" service
sudo loginctl enable-linger "$USER"
"$runtime/node/bin/node" "$runtime/manage-install.mjs" start
```

公网安装为文件右键菜单设置 `resolutionTimeoutMs: 15000`，避免上游默认 1 秒预算在远程网络上省略下载项；可在 `profiles/web/cordis.patch.yml` 调整。服务采用 `Restart=on-failure`、进程组清理和私有文件权限。查看状态、日志、停止或重启：

```bash
"$runtime/node/bin/node" "$runtime/manage-install.mjs" status
"$runtime/node/bin/node" "$runtime/manage-install.mjs" logs
"$runtime/node/bin/node" "$runtime/manage-install.mjs" stop
"$runtime/node/bin/node" "$runtime/manage-install.mjs" restart
```

### 4. 获取认证入口

启动日志中以 `dsh web: http...` 开头的 URL 带认证 token。通过该完整 URL 登录；之后浏览器使用认证 cookie。请在自己的终端查看日志，不要公开 token 或整个 service.log。

```bash
sed -n 's/^dsh web: \(http[^ ]*\)$/\1/p' \
  "$HOME/.local/share/deepseek-harness/service.log"
```

监听地址为 `0.0.0.0`，内部自连接使用 loopback，对外地址为 `--public-url`。保留 DSH 的 token/cookie、Host/Origin 及 WebSocket 认证。HTTP 部署用于本计划的初始运行；公网 HTTP 会传输明文，应按自己的网络需求配置 TLS。

### 5. 配置模型

在 WebUI 设置中配置可用的模型 provider、API 地址、模型名和密钥，再新建会话。不同兼容接口支持的模型名、工具调用和流式协议可能不同。仓库和压缩包不携带测试密钥；真实模型验收结果标记为用户提供的兼容 API，自报模型 `deepseek-v4.1-flash`。

## HTTPS

有域名和证书时可直接以前台 CLI 启动 TLS：

```bash
~/.local/bin/dsh web --no-open --host 0.0.0.0 --port 3080 \
  --public-url https://dsh.example.com:3080/ \
  --trusted-host dsh.example.com:3080 \
  --tls-cert /absolute/path/fullchain.pem \
  --tls-key /absolute/path/privkey.pem
```

也可在 loopback HTTP 服务前配置支持 WebSocket 升级的 HTTPS 反向代理。代理必须保留正确的 Host，转发 `Upgrade` / `Connection`，并在 DSH 中把 public URL 设为真实 HTTPS 地址。随包安装器的默认托管服务是 HTTP；自定义 TLS 服务需要自己的 systemd 参数配置。

## 手动升级与恢复

已安装服务器不会自动升级。结束正在运行的 Agent、后台任务并关闭终端后，下载、校验并解压新包，然后执行：

```bash
runtime="$HOME/.local/lib/deepseek-harness-s390x/current"
"$runtime/node/bin/node" "$runtime/manage-install.mjs" upgrade \
  --package /absolute/path/to/new-package
```

升级器通过现有认证 API 检查会话、终端和任务；无法检查时拒绝升级。前台服务需先停止。升级备份数据、切换程序并检查服务就绪；失败时恢复旧程序和数据备份，失败数据单独保留。发生数据迁移后不要直接用旧程序读取新数据。

恢复某次升级前状态：

```bash
"$runtime/node/bin/node" "$runtime/manage-install.mjs" restore \
  --backup /absolute/path/to/backups/TIMESTAMP
```

卸载程序和用户服务，保留数据：

```bash
"$runtime/node/bin/node" "$runtime/manage-install.mjs" uninstall
```

## 手动原生编译

```bash
sudo apt-get update
sudo apt-get install -y build-essential git curl ca-certificates python3 \
  musl-tools pkg-config xz-utils cmake ninja-build
./scripts/bootstrap-node.sh
export PATH="$PWD/.cache/toolchain/bin:$PATH"
node scripts/prepare-source.mjs build/upstream
./scripts/install-dependencies.sh build/upstream
./scripts/native-build.sh build/upstream
./scripts/package-release.sh build/upstream
```

s390x Web 构建还需要 Rust `1.98.0`，用于从固定 Rolldown 源码编译已修正大端 JSON 序列化的 OXC。`scripts/build-rolldown.sh` 校验来源和 crate SHA-256，并保留 Cargo.lock。`native-build.sh` 自动安装固定 Rust 工具链。构建串行执行；真机采用逐项目类型检查与相关测试，聚合 Host/Client 检查在 x64 执行。4 GiB 真机聚合类型检查可能大量换页，可按机器容量配置 swap。测试机本轮启用了 `/dsh-build.swap` 8 GiB，未写入 fstab。

补丁按声明的原始行逐一检查，禁止偏移和模糊匹配；请使用干净构建目录。未知上游变更、依赖或补丁冲突会使构建失败，不发布不完整包。

## 独立 CI/CD

`.github/workflows/build-s390x.yml` 使用 GitHub Ubuntu 24.04 x64 托管环境，先完成 TypeScript/Web 构建、聚合类型检查、相关上游测试，以及 execve/fcntl、s390x 系统调用、大端 fd_set/pollfd 和 ELF 拒绝路径的单元测试。随后 GCC 交叉编译 s390x 系统绑定、node-pty 与 musl 静态 Landlock，下载并校验官方目标 Node、Sharp 和 ripgrep，组装压缩包。整个工作流不运行 QEMU、完整 VM 或 s390x 二进制，也不连接外部测试服务器。

支持代码变更、手动指定官方 ref、每日查询正式版及预发布版，排除草稿。全部检查与交叉打包成功后自动发布；PR 和开发分支仅生成候选包，main、手动及每日运行可发布。补丁冲突、依赖锁不匹配、未知原生/WASM 文件、错误架构或任何必需检查失败都会停止发布，保留上一成功版本。每日已发布的上游提交会跳过重复构建。

**自动交叉产物未经目标环境运行验收。** Release 与 `build-info.json` 会明确标注 `targetRuntimeTested: false`。模拟检查能够发现架构假设和打包问题，不能验证真实内核、终端、cgroup、沙箱或目标 addon 的加载行为。首次固定基线另有独立 IBM 原生构建和完整验收报告，首版交叉包也经人工真机复验；这些证据不适用于未来上游版本。Release tag 同时记录上游和适配仓库提交，以区分相同上游的适配修订。

本地 Linux x64 的相同入口（需要足够临时磁盘空间）：

```bash
sudo apt-get update
sudo apt-get install -y musl-tools pkg-config gcc-s390x-linux-gnu \
  g++-s390x-linux-gnu binutils-s390x-linux-gnu make python3 xz-utils
./scripts/ci-prepare-x64.sh
./scripts/ci-cross-package.sh
```

## 功能与限制

| 功能 | 当前验证状态与条件 |
|---|---|
| WebUI、真实 Agent、持久终端、后台任务 | IBM 源码服务与公网已实际通过；最终包已通过；接口的每分钟 8 请求限制影响高密度模型测试，详见报告 |
| SQLite、Zstd、文件锁 | 包内 s390x 原生测试通过 |
| 插件代码/HMR | 真机回归、真实监听、安装/热更新/禁用/移除与资源释放均通过 |
| Office PDF/PNG、XLSX 重算、DOCX/PPTX | 系统 LibreOffice + python3-uno + Poppler 真机测试通过；WASM 要求 little-endian |
| Office 字体和表格图片 | 字体由系统 Fontconfig/LibreOffice 管理，暂不提供原 WASM 字体缺失清单和私有字体缓存；表格图片采用打印页，布局可能与上游区域渲染不同 |
| 图像和浏览器 PDF | 目标 Sharp 真实 PNG、浏览器图片上传显示、DOCX 转 PDF.js 画布/文本及下载通过 |
| 浏览器控制 | 本机 Chromium 未提供 s390x 官方包；已有 Chrome DevTools MCP attach provider 在 IBM 上控制外部 x64 Chromium 实测通过 |
| SenseVoice 语音 | `sherpa-onnx-node` 未提供 s390x addon，真机加载失败；ONNX Runtime 大端源码路线尚未验证，当前未支持 |
| Codex 子 Agent | `@openai/codex` 0.153.4 启动器拒绝 linux/s390x；Rust 源码移植尚未形成可运行产物，当前未支持 |
| Claude Code 子 Agent | SDK 0.3.263 缺 linux-s390x CLI；`pathToClaudeCodeExecutable` 可配置已有兼容程序，但尚无真机可用程序，当前未支持 |
| CUA 本机控制 | `@ubjs/node` 驱动拒绝 linux/s390x；源码/libffi 路线未完成，当前未支持。外部 CDP 仅覆盖浏览器操作 |
| DSH 自身子 Agent | 使用真实模型创建子任务、写入/读回文件与执行命令已验证 |
| Landlock | 真机 ABI 4，部分能力受内核限制；DSH 保留 partial enforcement 提示 |
| Electron 桌面壳 | 不属于服务器发行包 |

调查与分环境证据在 `reports/`，验收汇总见 [acceptance-summary.md](reports/build/acceptance-summary.md)，当前完成状态见 `reports/build/progress.md`。mock、真实模型、x64 模拟检查和 IBM 真机分别记录；QEMU 与完整 VM 未执行，已移出交付范围。没有测试证据的功能不标为支持。私钥、模型密钥、缓存、用户数据和 build/dist 不提交 Git。
