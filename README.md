# DeepSeek Harness for s390x

独立适配 Linux s390x 大端架构的 DeepSeek Harness。固定基线为官方 `0.2.2-rc.5` / `2e39e70496aa02986ca6a820c5d497e816b69d7e`，随包提供 Node `24.22.3` 和 pnpm `11.28.5`。

首版已完成 IBM 真机安装、功能与重启验收，独立 GitHub 托管 CI 的源码/模拟检查、交叉编译和自动发布全部成功。支持 Ubuntu 24.04 / glibc；Electron 桌面应用不在服务器包内。

[Latest 正式发行版](https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases/latest) · [HTTPS 真机验证新版](https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases/tag/native-https-0.2.2-rc.5-s390x-45e0c674) · [IBM 原生验证首包](https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases/tag/native-0.2.2-rc.5-s390x-b6d3d87) · [自动交叉首包](https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases/tag/s390x-2e39e70496aa-2adbb3a2) · [所有发行版（含预发布）](https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases) · [成功的 CI](https://github.com/AnnaofArendelle/deepseek-harness-s390x/actions/runs/44994504488)。

新版 Latest 提供默认 HTTPS 安装向导和 `dshctl` 短命令，复用 IBM 原生验证首包的核心产物；上游源码仍为 `0.2.2-rc.5` 候选版。旧版安装需升级运行脚本后才能使用向导，原有数据保留。后续自动发行继续跟随上游的正式版/预发布属性。

## 全新安装（默认 HTTPS）

在服务器上以同一个**普通用户**执行，不要使用 `sudo ./install.sh`。本指南适用于 **Ubuntu 24.04 / s390x / systemd**，建议至少 4 GiB 内存、5 GiB 可用磁盘。Node、pnpm 和 DSH 运行依赖已经随包提供，无需编译器。

准备服务器公网 **IPv4 或域名**；域名须配置 A 记录指向服务器。先在云控制台允许 **TCP 80 和 TCP 3080**：80 用于证书申请与续期，3080 用于 HTTPS WebUI。80 必须持续保持可达。自动向导目前不配置 IPv6；域名若有 AAAA 记录，须确保同一验证服务通过 IPv6 可达，或移除错误记录。

### 1. 安装基础工具

每个代码框单独复制，报错后先处理，不拼接命令、不在行尾添加反斜杠。下面是一条完整命令：

```bash
sudo apt-get update && sudo apt-get install -y --no-install-recommends ca-certificates curl python3 tar gzip coreutils libstdc++6 libgcc-s1 dbus-user-session
```

检查架构与用户服务：

```bash
uname -m
```

```bash
systemctl --user is-system-running
```

架构须输出 `s390x`。若提示无法连接用户 bus，退出 SSH 后重新登录，再执行安装；不要改用 `sudo systemctl --user`。

### 2. 下载安装向导

```bash
curl -fL https://raw.githubusercontent.com/AnnaofArendelle/deepseek-harness-s390x/main/scripts/install-latest.sh -o install-dsh.sh
```

### 3. 安装并启动

```bash
bash install-dsh.sh
```

向导下载 Latest 包、校验 SHA-256，然后询问公网 IPv4 或域名。**只填地址，例如域名，不含 `https://`、端口或路径**。阅读提示，确认云侧端口已放行并同意 Let’s Encrypt 协议后输入 `yes`。

向导自动安装 Nginx、添加本机端口规则、申请受信任证书、配置续期、生成用户服务、启用 linger 并启动。会先通过测试 CA 验证，再申请正式证书；失败会显示错误，不能视为安装完成。修复端口或 DNS 后运行 `dshctl setup` 重试。

安装成功后在**当前 SSH 终端**执行一次：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

后续 Bash 登录会自动加载命令路径。向导会显示私密登录入口；以后查看入口只需：

```bash
dshctl url
```

在自己电脑的浏览器打开完整 HTTPS 入口。证书自动申请成功时无需导入证书、无需跳过浏览器警告。URL 中的 token 是登录凭据，不要分享或公开日志。

### 4. 日常使用

| 操作 | 命令 |
|---|---|
| 启动 | `dshctl start` |
| 停止 | `dshctl stop` |
| 重启 | `dshctl restart` |
| 状态 | `dshctl status` |
| 最近日志 | `dshctl logs` |
| 登录入口 | `dshctl url` |
| 重新配置 HTTPS / 更换地址 | `dshctl setup` |
| 手动触发续期检查 | `dshctl renew` |

**退出 SSH 后服务继续运行，服务器重启后自动启动。** `stop` 停止 DSH 和它管理的任务；请先在 WebUI 结束任务与终端。主动停止后不会立即自启，但保留下次开机启动。Nginx 与续期定时器继续运行；DSH 停止时网页会返回 502。需要取消开机启动时执行 `systemctl --user disable --now deepseek-harness-s390x.service`。

| 内容 | 默认位置 |
|---|---|
| 程序 | `~/.local/lib/deepseek-harness-s390x/current` |
| 命令 | `~/.local/bin/dsh`、`~/.local/bin/dshctl` |
| 数据与模型凭据 | `~/.local/share/deepseek-harness` |
| 启动参数 | `~/.local/lib/deepseek-harness-s390x/installation.json` |
| 系统证书与 ACME 状态 | `/etc/deepseek-harness-s390x/用户UID`（私钥仅 root 可读） |

已有本适配版安装，先按[手动升级](#手动升级与恢复)更新到包含向导的新包，再运行 `dshctl setup`。有活动任务或终端时向导拒绝切换，先结束它们。已有其他服务占用端口时先安排端口，向导不会停止它；自定义 WebUI 端口使用 `dshctl setup --port 4080`，同时在云侧放行该端口。

需要 Office 预览、转换、表格重算时另执行：

```bash
sudo apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress python3-uno poppler-utils fonts-dejavu-core
```

<details>
<summary>高级：手动 HTTP 安装、端口规则及原来的 dsh web</summary>

离线安装可手动下载 Release 的压缩包与 `.sha256`，运行 `sha256sum -c 文件名.sha256`，校验成功后解压。在包目录执行 `./install.sh` 默认开启 HTTPS 向导；显式参数则保留手动 HTTP 安装路线：

```bash
./install.sh --host 0.0.0.0 --port 3080 --public-url http://你的公网IP:3080/
```

替换地址后执行。`0.0.0.0` 是所有网卡的监听地址，不能用作浏览器访问地址。手动 HTTP 安装不会申请证书或启动服务，需要执行 `dshctl service`、`sudo loginctl enable-linger "$USER"` 和 `dshctl start`。

自动 HTTPS 向导按正在使用的 UFW / firewalld / iptables 添加规则，不清空现有规则。纯手动 iptables 部署可使用以下命令；不要混用于已有 UFW/firewalld 配置：

```bash
sudo iptables -C INPUT -p tcp --dport 3080 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 3080 -j ACCEPT
```

```bash
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
```

```bash
sudo netfilter-persistent save
```

HTTPS 时还需同样放行 TCP 80。重启后用 `sudo iptables -C INPUT -p tcp --dport 3080 -j ACCEPT` 核对，并从外部访问。撤销只删除对应规则：`sudo iptables -D INPUT -p tcp --dport 3080 -j ACCEPT`，然后 `sudo netfilter-persistent save`。云侧规则须单独修改。

原来的 `dsh web` 仍正常可用，运行同一套 WebUI/Agent；它使用上游默认参数，不读取安装器配置。它是前台命令，SSH 断开后不保证继续运行。托管配置的前台调试可用 `dshctl foreground`，先执行 `dshctl stop`，调试完 Ctrl-C 后执行 `dshctl start`；HTTPS 代理保留。

</details>

### 5. 配置模型

模型请求、网页搜索、网页获取是三个分别配置的能力。聊天成功不代表搜索成功；第三方服务的密钥应保存在它自己的 provider 下，避免官方工具把它当作 DeepSeek 官方密钥使用。

**使用 DeepSeek 官方服务：** 在 **设置 → 模型 → DeepSeek** 中填写官方 API Key，保留官方默认端点和受支持的模型列表，保存后在会话中选择该提供方。官方卡片使用 Anthropic Messages 协议，不要把普通 OpenAI 兼容中转的 `/v1` 地址和密钥填入此卡片。已有 DeepSeek 账号时也可使用 UI 提供的账号登录路线，能否请求由账号服务实际权限决定。

**使用第三方中转或自部署服务：**

1. 打开 **设置 → 模型 → 添加模型提供商 → 自定义模型 API**。首次弹出的官方密钥引导可关闭后再配置；第三方密钥不要填入官方卡片。
2. 填写唯一 Provider ID，例如 `my-gateway`；不要使用内置的 `deepseek-official` 或 `deepseek-account`。
3. 按服务商说明选择 **API 协议**。常见中转使用 **OpenAI Chat Completions**；只有服务商明确支持时才选择 Responses 或 Anthropic Messages。
4. 填写 **Base URL** 与该服务商的 **API 密钥**。Chat Completions 示例为 `https://gateway.example/v1`，不含 `/chat/completions`；自定义 Anthropic Messages 示例为 `https://gateway.example`，SDK 会追加 `/v1/messages`。这些是格式示例，须替换为真实服务地址。
5. 点击 **获取可用模型**，选择后点 **更新列表**。若服务商未实现模型列表接口，可手动输入服务商给出的准确模型 ID；至少配置一个模型。不要把显示名当作请求 ID。
6. 保存/应用，创建会话并在模型选择器中选中新 provider 和模型。先发送一个简单问题，确认有流式回复；随后让 Agent 执行 `uname -m`，检查真实工具输出为 `s390x`。

图片输入、工具调用、推理等级和流式协议必须由所选端点/模型实际支持；先使用它明确支持的配置。模型名含 `deepseek` 并不会让第三方 provider 自动变为官方模型路由。绿色凭据标志只说明已保存/已检测到密钥，不能证明服务端接受它。

UI 会把新自定义 provider 的密钥保存到独立凭据引用，配置文件只记录引用名。凭据存储默认为 `$DSH_HOME/.credentials.yaml`，权限应为 `600`。通过 UI 保存即可，无需把密钥写入 README、启动命令或公开仓库。SSH 中临时 `export` 的变量不会自动进入已经运行的 systemd 服务；已有同名存储凭据也优先于环境变量。

仓库和压缩包不携带测试密钥；真实模型验收使用用户提供的兼容 API，自报模型 `deepseek-v4.1-flash`，不代表官方 API 或 Web Search 已通过真实验收。

### 6. 单独配置 Web Search / Web Fetch

本适配保留上游实现。搜索设为 **自动选择** 时，`deepseek-official` / `deepseek-account` 模型路由优先使用 **DeepSeek 服务端搜索**（Messages）；其他路由优先使用 **DeepSeek Search API**。默认直接 Search API 地址为 `https://api.deepseek.com/v1/tools/search`；默认网页获取为 **本机直接获取**（`http`），无需 DeepSeek 密钥，但只能获取允许的公网 HTTP(S) 地址。

第三方模型页面的 `baseURL` 不会自动替换这些搜索端点。如果把第三方密钥保存为全局 `DEEPSEEK_API_KEY`，官方 Search API 可能取到它并返回 **HTTP 401 / Authentication Fails**。这是端点和凭据不匹配，不能通过 s390x 编译修复。

**选择官方搜索凭据：**

1. 打开 **侧栏插件 → 内置插件配置 → 官方分组 → 网页搜索与获取**。
2. 在 **网页搜索提供方** 选择 **DeepSeek Search API**，计费方式选择 **DeepSeek API Key** 或 **已登录的 DeepSeek 账号**。
3. Key 路线使用 Models 页 DeepSeek 卡片中的官方凭据；账号路线需先完成 DeepSeek 账号登录。该服务实际权限、额度和计费由服务商决定。
4. **网页获取提供方** 保持 **本机直接获取**，点 **保存**。下一次操作生效。
5. 新会话要求 Agent 搜索并引用来源，展开 `web_search` 工具卡，检查工具是否真正成功且返回可打开的 URL；仅看模型文字不能算搜索验收。

如已用 YAML 配置独立搜索字段，计费菜单会显示被覆盖；需先检查下面的高级配置。另一选项 **DeepSeek 服务端搜索** 使用独立 Messages 端点，默认 `https://api.deepseek.com/anthropic/v1/messages`，要求端点支持服务端 `web_search_20250305`。普通聊天兼容接口不保证支持它；只改域名不会增加搜索能力。

**搜索与第三方聊天隔离（高级配置）：** 以下也适用于服务商明确提供兼容 DeepSeek Search API 的搜索网关。请在没有活动任务时操作，Web profile 配置可能热重载。先备份，再编辑用户 patch；保留现有条目，对已有同 id 条目合并 `config`，不要覆盖整个文件或重复添加同 id。下面按默认数据目录操作，自定义安装需替换 `dsh_data`：

```bash
dsh_data="$HOME/.local/share/deepseek-harness"
dsh_patch="$dsh_data/profiles/web/cordis.patch.yml"
cp -p "$dsh_patch" "$dsh_patch.backup-$(date +%Y%m%d-%H%M%S)"
nano "$dsh_patch"
```

追加/合并下面的配置。它固定官方 Search API，并只读取独立的 `DEEPSEEK_SEARCH_API_KEY`：

```yaml
- id: web
  config:
    searchProvider: deepseek-search-api
    fetchProvider: http
- id: web-deepseek-api
  config:
    searchBaseURL: https://api.deepseek.com/v1/tools
    searchApiKeyEnv: DEEPSEEK_SEARCH_API_KEY
```

`searchBaseURL` 填包含路径前缀的基础地址，**不含最后的 `/search`**，程序会追加该路径。使用第三方搜索时，只能替换为服务商确认兼容的搜索 API 基础地址，并配上该搜索服务的密钥；普通 `/v1/chat/completions` 兼容网关不能据此假定也提供 `/v1/tools/search`。这两个字段目前只能在 YAML 中设置；只填地址而省略 `searchApiKeyEnv` 会继续复用 `DEEPSEEK_API_KEY`。

独立密钥可保存到主数据目录的 `.env`。用编辑器输入，不把密钥放进 shell 命令/历史；合并现有文件，不覆盖其他变量，也不重复同名变量：

```bash
dsh_data="$HOME/.local/share/deepseek-harness"
(umask 077; touch "$dsh_data/.env")
chmod 600 "$dsh_data/.env"
nano "$dsh_data/.env"
```

添加一行，替换右侧占位内容为真正的搜索密钥：

```dotenv
DEEPSEEK_SEARCH_API_KEY=替换为此搜索服务的真实密钥
```

保存并退出编辑器（nano：Ctrl-O、Enter、Ctrl-X），在没有活动任务时重启服务，然后再次检查搜索工具结果：

```bash
systemctl --user restart deepseek-harness-s390x.service
```

若 `.credentials.yaml` 的 `refs` 已有同名引用，该值优先于 `.env`，应在现有 `refs` 下更新/移除旧项并保持 `600` 权限；保留 `version`、其他 refs 和 records，不另建重复的 `refs` 键。`DEEPSEEK_SEARCH_BASE_URL` 是另一套 **Messages 搜索** 的环境覆盖变量，不是直接 Search API 的 `searchBaseURL`。

没有可用搜索凭据时，可先使用聊天、终端和本机网页获取，搜索仍不可用；也可安装真正可用的外部搜索 provider 插件，按其文档配置后在下拉框选择它。不要以假结果替代搜索，也不要把切换配置当作成功验收。本项目尚无当前官方搜索凭据的成功调用证据。

### 7. 常见问题

| 现象 | 处理 |
|---|---|
| `dshctl: command not found` | 执行 `export PATH="$HOME/.local/bin:$PATH"`，或用 `~/.local/bin/dshctl` |
| 证书申请超时/失败 | 核对云侧 TCP 80、本机规则、公网 IPv4、域名 A/AAAA；查看错误后用 `dshctl setup` 重试 |
| 浏览器提示证书不匹配 | 使用 `dshctl url` 显示的地址；IP/域名变更后先运行 `dshctl setup` |
| 公网超时 | 检查云侧与本机 WebUI 端口规则，执行 `dshctl status` |
| HTTPS 返回 502 | DSH 未运行或启动失败，执行 `dshctl start` / `dshctl logs` |
| 聊天 401 / 搜索 401 | 核对 provider、协议、端点及各自密钥；聊天与搜索分别配置，见上文 |
| 用户 bus 无法连接 | 普通用户重新通过 SSH 登录，确认 `dbus-user-session` 已安装 |
| 自动续期失败 | 80 端口须一直可达，执行 `dshctl renew` 查看真实结果；不能只检查定时器 enabled |

## HTTPS 原理与证书

默认部署为 **Nginx HTTPS → 本机 loopback DSH HTTP**，认证、Host/Origin 检查和 WebSocket 都保留。DSH 不直接暴露后端端口。证书续期只 reload Nginx，不重启 DSH，持续运行的 Agent、PTY 和后台任务不被中断。

Let’s Encrypt 公网 IP 证书使用 shortlived profile，有效约 160 小时，系统每 6 小时检查续期；域名使用普通 profile。服务器必须能联网访问 CA，TCP 80 持续可达。证书按实际公网 IP/域名签发，`0.0.0.0` 不能成为访问地址或证书身份。向导展示 CA 协议并要求确认。ACME 使用固定 acme.sh 3.1.7（下载源码并校验 SHA-256），保留其 GPLv3 许可证，与 DSH 独立运行。

**DSH 官方本身支持 HTTPS**，参数为 `--tls-cert` / `--tls-key`。已有证书也可直接前台启动：

```bash
DSH_HOME="$HOME/.local/share/deepseek-harness" "$HOME/.local/bin/dsh" web --no-open --host 0.0.0.0 --port 4080 --public-url https://dsh.example.com:4080/ --trusted-host dsh.example.com:4080 --tls-cert /absolute/path/fullchain.pem --tls-key /absolute/path/privkey.pem
```

替换真实域名与证书路径，先避免已有 DSH 数据目录及端口冲突。上游原生 TLS 不负责申请/续期，更新证书后需重启；默认向导采用代理解决这些运维步骤。这次修改运行管理脚本，无需重新编译 DSH WebUI 或原生模块。

## 手动升级与恢复

已安装服务器不会自动升级。结束正在运行的 Agent、后台任务并关闭终端后，下载、校验并解压新包，然后执行：

```bash
dshctl upgrade --package /absolute/path/to/new-package
```

旧版还没有 `dshctl` 时，在**解压的新包目录**执行：

```bash
./bin/dshctl upgrade --package "$PWD"
```

然后执行 `~/.local/bin/dshctl setup`，配置自动 HTTPS。当前会话找不到短命令时执行 `export PATH="$HOME/.local/bin:$PATH"`。

升级器通过现有认证 API 检查会话、终端和任务；无法检查时拒绝升级。前台服务需先停止。升级备份数据、切换程序并检查服务就绪；失败时恢复旧程序和数据备份，失败数据单独保留。发生数据迁移后不要直接用旧程序读取新数据。

恢复某次升级前状态：

```bash
dshctl restore --backup /absolute/path/to/backups/TIMESTAMP
```

卸载程序和用户服务，保留数据：

```bash
dshctl uninstall
```

HTTPS 卸载会移除本安装的代理配置与续期定时器，需要 sudo；保留证书/ACME 账户、本机端口规则和其他 Nginx 网站。无需取消用户 linger，它可能还服务于其他用户任务。

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
| Web Search / Web Fetch | 保留上游 provider；默认搜索需要官方凭据或真实兼容搜索服务，当前无官方搜索成功调用证据。第三方聊天成功不代表搜索可用；本机网页获取无需 DeepSeek 密钥 |
| Landlock | 真机 ABI 4，部分能力受内核限制；DSH 保留 partial enforcement 提示 |
| Electron 桌面壳 | 不属于服务器发行包 |

调查与分环境证据在 `reports/`，验收汇总见 [acceptance-summary.md](reports/build/acceptance-summary.md)，当前完成状态见 `reports/build/progress.md`。mock、真实模型、x64 模拟检查和 IBM 真机分别记录；QEMU 与完整 VM 未执行，已移出交付范围。没有测试证据的功能不标为支持。私钥、模型密钥、缓存、用户数据和 build/dist 不提交 Git。
