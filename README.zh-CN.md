# DeepSeek Harness for s390x

[English](README.md) · **简体中文**

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供 Linux s390x 支持，包含可复现源码补丁、随包运行时和独立交叉编译 CI。

在 IBM LinuxONE 上运行 WebUI、Agent、持久终端、后台任务和插件。发行包包含 Node.js 与运行依赖，安装无需编译器。

[Latest 发行版](https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases/latest) · [构建工作流](https://github.com/AnnaofArendelle/deepseek-harness-s390x/actions/workflows/build-s390x.yml) · [手动部署](docs/manual-deployment.zh-CN.md) · [模型与搜索配置](docs/configuration.zh-CN.md)

## 项目状态

当前基线为上游 **0.2.2-rc.5**，提交 `2e39e70496aa02986ca6a820c5d497e816b69d7e`，使用 Node.js **24.22.3**、pnpm **11.28.5**。本适配仓库的 Latest 是正式发行版，上游基线仍为候选版。

固定原生包已在 Ubuntu 24.04 s390x 真机通过安装与运行验收。最新部署更新提供受信任 HTTPS、证书续期和 `dshctl` 管理命令，完成了真机安装、升级恢复、公网 WebSocket 与服务器重启检查。

自动交叉包标注 `targetRuntimeTested: false`，源码、类型、模拟及 ELF 检查不能证明未来上游版本的目标运行兼容性。各次验收范围见[验收汇总](https://github.com/AnnaofArendelle/deepseek-harness-s390x/blob/main/reports/build/acceptance-summary.md)与 [HTTPS 部署报告](https://github.com/AnnaofArendelle/deepseek-harness-s390x/blob/main/reports/build/https-deployment.md)。

## 前置条件

| 项目 | 要求 |
|---|---|
| 操作系统 | Ubuntu 24.04、Linux s390x、glibc；压缩包不能用于 x86_64、ARM64、Alpine/musl |
| 服务管理 | 可写主目录的普通用户；常驻使用 systemd 用户服务；系统依赖和防火墙配置需要 sudo |
| 资源 | 建议至少 4 GiB 内存、5 GiB 可用磁盘，另为用户数据与备份留空间 |
| 网络 | 能访问 GitHub、所选模型/搜索服务；默认 WebUI 使用入站 TCP 3080 |
| 自动 HTTPS | 公网 IPv4 或域名；证书验证与续期需要入站 TCP 80，并同意 CA 服务协议 |
| 模型访问 | 可用 API Key、协议、Base URL 和准确模型 ID；聊天与搜索凭据分别配置 |

Node.js、pnpm 和原生运行模块随包提供。Office 转换另需系统软件，安装方法见部署指南。

## 安装方式

| 方式 | 说明 | 行为 |
|---|---|---|
| 手动部署 | [逐步部署指南](docs/manual-deployment.zh-CN.md) | 下载校验压缩包，手动配置端口、服务；可使用自己的证书配置 HTTPS |
| 可选一键脚本 | [下方快速安装](#快速安装可选) | 下载 Latest，通过向导配置受信任 HTTPS、续期和常驻服务 |

两种方式都由同一普通用户执行。已有安装请使用[升级流程](docs/manual-deployment.zh-CN.md#升级恢复与卸载)。

## 快速安装（可选）

在 Ubuntu 24.04 s390x 服务器上执行，每个代码框单独复制。先在云侧放行 **TCP 80 和 3080**。域名 A 记录指向服务器；若有 AAAA，也须能访问同一证书验证服务。向导不配置 IPv6。

安装基础工具：

```bash
sudo apt-get update
```

```bash
sudo apt-get install -y --no-install-recommends ca-certificates curl python3 tar gzip coreutils libstdc++6 libgcc-s1 dbus-user-session
```

下载可选安装器，可先检查脚本内容：

```bash
curl -fL https://raw.githubusercontent.com/AnnaofArendelle/deepseek-harness-s390x/main/scripts/install-latest.sh -o install-dsh.sh
```

以普通用户运行：

```bash
bash install-dsh.sh
```

填写公网 IPv4 或域名，**不包含协议、端口或路径**。按提示确认云侧规则和 Let’s Encrypt 协议。脚本校验压缩包、安装 Nginx、添加本机规则、申请受信任证书，并配置续期与无需 SSH 登录的开机启动。

安装后在当前终端启用短命令：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

获取私密登录入口，在自己的浏览器中打开：

```bash
dshctl url
```

按[配置指南](docs/configuration.zh-CN.md)设置模型。URL 中的 token 是登录凭据，勿分享。安装报错时先处理网络、DNS 或服务问题，再执行 `dshctl setup` 重试。

## 服务管理

| 操作 | 命令 |
|---|---|
| 启动 | `dshctl start` |
| 停止 | `dshctl stop` |
| 重启 | `dshctl restart` |
| 状态 | `dshctl status` |
| 最近日志 | `dshctl logs` |
| 登录入口 | `dshctl url` |
| 配置自动 HTTPS | `dshctl setup` |
| 检查证书续期 | `dshctl renew` |

向导启用用户级 systemd 服务与 linger，退出 SSH 后继续运行，服务器重启后自动启动。手动部署也可按[常驻服务配置](docs/manual-deployment.zh-CN.md#4-手动配置常驻服务与开机启动)启用相同行为。

重启或升级前先结束活动任务与终端。主动停止后，服务保持停止，直到手动启动或服务器重启。HTTPS 部署中 Nginx 与续期定时器仍运行，DSH 停止时网页返回 502。

原来的 `dsh web` 保留，用于前台运行；它读取 CLI 参数而非安装器保存的配置。详见[前台运行](docs/manual-deployment.zh-CN.md#6-重启核对与可选前台调试)。

## 功能支持

| 功能 | 状态 |
|---|---|
| WebUI、Agent、持久终端、后台任务 | s390x 真机验证；固定原生首包使用真实兼容模型，HTTPS 补验使用 mock 模型与真实工具/任务 |
| 会话、SQLite、Zstd、文件锁 | 目标运行时验证通过 |
| 插件与热更新 | 加载、修改、禁用/移除、缓存失效和资源释放通过 |
| 图像与浏览器 PDF | Sharp、上传显示、PDF.js 预览及下载通过 |
| Office 转换与表格重算 | 系统 LibreOffice、UNO、Poppler provider 通过；原 WASM 要求小端内存 |
| 浏览器控制 | 外部 Chrome DevTools MCP/CDP 通过；不包含本机 s390x Chromium |
| DSH 子 Agent | 真实兼容模型验证通过 |
| Web Search / Web Fetch | 保留上游 provider；搜索需独立官方/兼容搜索凭据；本机 Web Fetch 无需 DeepSeek 密钥 |
| Landlock 沙箱 | ABI 4 验证；部分能力受内核限制 |
| SenseVoice、Codex/Claude 独立子 Agent、本机 CUA | 当前 s390x 包未支持 |
| Electron 桌面壳 | 不属于服务器发行范围 |

Office 使用系统 Fontconfig/LibreOffice 字体，不提供原 WASM 缺失字体清单和私有字体缓存；表格图片采用打印页，可能不同于上游区域渲染。现有验收没有官方搜索 API 成功调用证据。

## 构建与更新

[源码构建指南](docs/building.zh-CN.md)提供 s390x 原生编译和本地 x64 交叉编译入口。补丁严格应用到锁定上游源码；冲突或未知原生依赖会中止构建。

GitHub Actions 使用 Ubuntu 24.04 x64 runner，完成 TypeScript/Web 构建、类型检查、单元、大端模拟和 s390x 交叉编译。CI **不连接 IBM，不运行 s390x 二进制、QEMU 或完整 VM**。

工作流支持代码变更、手动上游 ref、每日上游发行检查，包含预发布并排除草稿。必需检查通过后才发布。服务器由用户手动升级；程序与用户数据独立存放，任务检查、备份与恢复见部署指南。

## 文档

- [手动部署](docs/manual-deployment.zh-CN.md)：前置配置、防火墙、下载校验、HTTP/HTTPS、服务管理与升级。
- [模型与搜索](docs/configuration.zh-CN.md)：官方和自定义 provider、独立搜索凭据及排错。
- [源码构建](docs/building.zh-CN.md)：固定工具链、原生与交叉编译。
- [验收报告](https://github.com/AnnaofArendelle/deepseek-harness-s390x/blob/main/reports/build/acceptance-summary.md)：真机、模拟与模型证据。

## 许可证与上游

适配脚本和补丁使用 [MIT](LICENSE)。DeepSeek Harness 及随包依赖保留各自许可证；可选 HTTPS 安装独立下载固定 acme.sh 客户端，并保留其 GPLv3 许可证。

本仓库是独立平台适配项目。s390x 打包和部署问题请在[本仓库提交 Issue](https://github.com/AnnaofArendelle/deepseek-harness-s390x/issues)，原项目为 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。
