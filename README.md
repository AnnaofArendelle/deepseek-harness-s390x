# DeepSeek Harness for s390x

独立适配 Linux s390x 大端架构的 DeepSeek Harness。固定基线为官方 `0.2.2-rc.5` / `2e39e70496aa02986ca6a820c5d497e816b69d7e`，随包提供 Node `24.22.3` 和 pnpm `11.28.5`。

首版已完成 IBM 真机安装、功能与重启验收，独立 GitHub 托管 CI 的源码/模拟检查、交叉编译和自动发布全部成功。支持 Ubuntu 24.04 / glibc；Electron 桌面应用不在服务器包内。

[Latest 正式发行版](https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases/latest) · [IBM 原生验证首包](https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases/tag/native-0.2.2-rc.5-s390x-b6d3d87) · [自动交叉首包](https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases/tag/s390x-2e39e70496aa-2adbb3a2) · [所有发行版（含预发布）](https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases) · [成功的 CI](https://github.com/AnnaofArendelle/deepseek-harness-s390x/actions/runs/44994504488)。

当前 Latest 为 IBM 原生验证首包，是本适配仓库的正式发行版；它的上游源码仍为 `0.2.2-rc.5` 候选版。此次转正仅修改 GitHub 发行属性，版本标签、安装包及校验值不变，已有安装无需升级。后续自动发行继续跟随上游的正式版/预发布属性。

## 全新安装

以下步骤在服务器上执行，使用同一个普通用户登录和管理 DSH；只有安装系统软件、设置防火墙和启用 linger 的命令使用 `sudo`。不要用 `sudo ./install.sh`，否则程序、数据和用户服务会安装到 root 的目录。**全新安装从第 0 步开始，确认并配置前置环境后再放行端口；已有合格环境可以跳过第 0 步。** 已有本适配版安装时直接看[手动升级与恢复](#手动升级与恢复)。本页为持续更新的安装指南，首包内附 README 保留了打包时的内容，安装时优先参考本页。

### 0. 确认前置条件

| 项目 | 要求及准备方法 |
|---|---|
| 操作系统与架构 | 已验证 Ubuntu 24.04、Linux `s390x`、glibc。x86_64、aarch64 和 Alpine/musl 不能使用这个包；其他 glibc 发行版尚未验收 |
| 权限与服务管理 | 可写的普通用户主目录；安装系统依赖和开放端口需要 sudo/管理员协助。常驻运行需要 systemd 用户服务；前台启动无需 systemd |
| 资源 | 验证机器为 2 CPU / 4 GiB RAM。建议至少 5 GiB 可用磁盘，另为工作文件、会话和日志留空间；首包解压约 0.71 GiB，安装时还会复制一份。这里只是运行建议，源码编译需要更多资源 |
| 网络 | 服务器能解析域名并通过 HTTPS 访问 GitHub、所选模型/搜索服务；浏览器能访问服务器 TCP 3080。云侧安全组和本机防火墙需分别检查 |
| 模型凭据 | 准备服务商提供的 API Key、API 协议、Base URL 和准确的模型 ID；无凭据也能启动 WebUI，但不能完成 Agent 请求。搜索凭据与聊天凭据分别配置 |
| Node 与编译器 | Node 和运行依赖随包提供，安装发行包无需安装系统 Node、pnpm、Rust 或编译器 |
| Office 功能 | 文档转换、预览与表格重算另需系统 LibreOffice、python3-uno 和 Poppler；基础聊天与终端不依赖这些软件 |

先检查环境：

```bash
id -un
uname -m
cat /etc/os-release
getconf GNU_LIBC_VERSION
ps -p 1 -o comm=
df -h "$HOME"
free -h
sudo -v
```

`uname -m` 必须输出 `s390x`；本指南的后台服务步骤要求 PID 1 为 `systemd`。使用 Ubuntu 24.04 时安装基础工具及共享运行库：

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  ca-certificates curl tar gzip coreutils libstdc++6 libgcc-s1 \
  iproute2 procps dbus-user-session nano
```

再检查用户服务和端口：

```bash
systemctl --user is-system-running
ss -ltn '( sport = :3080 )'
```

用户服务管理器能响应即可；`degraded` 需要查看 `systemctl --user --failed`，不必然表示 DSH 不能运行。若提示 `Failed to connect to bus`，安装 `dbus-user-session` 后退出并重新通过 SSH 登录，使用普通用户的登录会话执行；不要改成 `sudo systemctl --user`。端口检查若出现 `LISTEN` 行，先确认现有服务，或为 DSH 选择其他端口。

可检查不携带密钥的 HTTPS 连通性：

```bash
curl -I --connect-timeout 15 --max-time 30 https://github.com/
```

模型服务也需从服务器本机能访问。接口根路径返回 401 或 404 只能说明收到 HTTP 响应，不能证明模型/搜索凭据可用。DNS、证书或连接超时应先解决；不使用 `curl -k` 跳过证书检查。

### 1. 放行服务端口

以下命令适用于由 iptables 管理 INPUT 规则的 Ubuntu 服务器，已在 IBM 测试机验证。默认端口为 TCP 3080；先在云控制台的安全组/网络规则中允许浏览器来源访问这个端口。不要改动已有的 SSH 规则。

先确认本机使用的管理工具。若使用 UFW，可用 `sudo ufw status` 检查，并用 `sudo ufw allow 3080/tcp` 放行；若使用 firewalld，请在现有 zone 中配置。下面的 iptables 方案不要混用于已有的 UFW/firewalld 配置。

```bash
sudo apt-get install -y iptables
sudo iptables -C INPUT -p tcp --dport 3080 -j ACCEPT 2>/dev/null ||
  sudo iptables -I INPUT 1 -p tcp --dport 3080 -j ACCEPT

sudo env DEBIAN_FRONTEND=noninteractive \
  apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

命令只增加规则，不清空现有规则。更换端口时同步更改云侧规则、本机防火墙、安装的 `--port` 和 public URL，例如 `--port 4080 --public-url http://你的公网IP:4080/`。服务安装完成并重启服务器后检查规则与外部访问：

```bash
sudo iptables -C INPUT -p tcp --dport 3080 -j ACCEPT
sudo systemctl status netfilter-persistent --no-pager
```

若本机监听正常但外部访问超时，请检查云侧规则及上游网络。撤销上面增加的 iptables 规则：

```bash
sudo iptables -D INPUT -p tcp --dport 3080 -j ACCEPT
sudo netfilter-persistent save
```

### 2. 安装压缩包

从本仓库 Release 下载 `deepseek-harness-VERSION-linux-s390x.tar.gz` 及对应 `.sha256`，先校验，再解压。首版可优先使用上面的 IBM 原生验证包；自动交叉包的目标运行验证限制见 CI/CD 部分。校验结果必须为 `OK`，失败时不要继续安装。

下面整段可复制执行：会创建独立下载目录，并询问浏览器实际访问的公网 URL。IBM 测试机填写 `http://148.100.112.82:3080/`；其他机器填写自己的公网 IP/域名。公网 URL 不要填写 `0.0.0.0` 或 `127.0.0.1`。

```bash
(
set -e
download_dir=$(mktemp -d "$HOME/dsh-download.XXXXXXXX")
cd "$download_dir"
release=https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases/download/native-0.2.2-rc.5-s390x-b6d3d87
curl -fLO "$release/deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz"
curl -fLO "$release/deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz.sha256"
sha256sum -c deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz.sha256
tar -xzf deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz
cd deepseek-harness-0.2.2-rc.5-linux-s390x
read -r -p '请输入公网 URL（http://你的公网IP:3080/）: ' dsh_public_url
: "${dsh_public_url:?公网 URL 不能为空}"
./install.sh --host 0.0.0.0 --port 3080 --public-url "$dsh_public_url"
)
```

安装器先检查包完整性和目标架构，再复制程序，不会自动启动服务。`--public-url` 会同时用于托管服务的认证入口和 trusted host。成功后可删除刚才的下载目录以腾出空间，保留已安装的程序和数据目录。

| 内容 | 默认位置 |
|---|---|
| 程序及版本 | `~/.local/lib/deepseek-harness-s390x/`，`current` 指向当前版本 |
| 启动参数 | `~/.local/lib/deepseek-harness-s390x/installation.json` |
| 命令链接 | `~/.local/bin/dsh` |
| 数据、凭据和配置 | `~/.local/share/deepseek-harness/` |
| 用户服务文件 | `~/.config/systemd/user/deepseek-harness-s390x.service`（下一步生成） |

已有 `~/.local/bin/dsh` 时安装会拒绝覆盖；先用 `ls -l "$HOME/.local/bin/dsh"` 和 `command -v dsh` 确认来源，保留旧安装后再安排命令链接。看到 `Use upgrade for an existing installation` 表示应使用升级流程，不要删除数据重装。数据和程序分开保存；`--data /absolute/path` 可指定数据目录，直接使用 CLI 时也要设置相同的 `DSH_HOME`。

使 `dsh` 在当前和后续 Bash 登录中可用：

```bash
export PATH="$HOME/.local/bin:$PATH"
if ! grep -Fqx 'export PATH="$HOME/.local/bin:$PATH"' "$HOME/.bashrc" 2>/dev/null; then
  printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.bashrc"
fi
command -v dsh
dsh --version
```

`command -v dsh` 应指向当前用户的 `~/.local/bin/dsh`；仍找不到时可直接使用这个绝对路径。Zsh 用户把配置写入 `~/.zshrc`。运行时版本以包内 Node 为准，不受系统 Node 版本影响。

需要 Office 预览、转换或表格重算时安装这些软件；无需现场源码编译：

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  libreoffice-writer libreoffice-calc libreoffice-impress \
  python3-uno poppler-utils fonts-dejavu-core
```

### 3. 启动

推荐使用用户级 systemd 常驻服务。先安装/启用服务，再启用用户管理器的开机运行，最后启动：

```bash
runtime="$HOME/.local/lib/deepseek-harness-s390x/current"
"$runtime/node/bin/node" "$runtime/manage-install.mjs" service
sudo loginctl enable-linger "$USER"
"$runtime/node/bin/node" "$runtime/manage-install.mjs" start
systemctl --user status deepseek-harness-s390x.service --no-pager
loginctl show-user "$USER" -p Linger
```

应看到 `active (running)` 和 `Linger=yes`。这时关闭 SSH 或退出浏览器，Web 服务及已转入后台的任务仍可运行；服务器重启后服务也会启动。首次启动请等待就绪日志出现，仅看到 systemd 的 active 状态还不能证明 WebUI 已就绪。

日常管理使用同一个普通用户，在任意目录按需执行对应命令：

| 操作 | 命令 |
|---|---|
| 启动 | `systemctl --user start deepseek-harness-s390x.service` |
| 停止 | `systemctl --user stop deepseek-harness-s390x.service` |
| 重启 | `systemctl --user restart deepseek-harness-s390x.service` |
| 状态 | `systemctl --user status deepseek-harness-s390x.service --no-pager` |
| 最近日志 | `journalctl --user -u deepseek-harness-s390x.service -n 50 --no-pager` |
| 持续跟踪日志 | `journalctl --user -u deepseek-harness-s390x.service -f` |

日志跟踪中按 Ctrl-C 仅退出查看，不停止服务。`stop` 会停止 DSH 及其进程组；有任务时请先在 WebUI 结束任务和终端。服务采用 `Restart=on-failure`，主动 `stop` 后不会立即自启，但仍保留下次开机启动。取消开机启动并停止：

```bash
systemctl --user disable --now deepseek-harness-s390x.service
```

重新启用并启动：

```bash
systemctl --user enable --now deepseek-harness-s390x.service
```

也可用管理器的 `status`、`logs`、`stop`、`restart` 等命令完成相同操作。公网安装为文件右键菜单设置 `resolutionTimeoutMs: 15000`，避免上游默认 1 秒预算在远程网络上省略下载项；可在 `profiles/web/cordis.patch.yml` 调整。

只做前台调试时执行下面的命令；它读取安装时保存的 host、port、public URL 和数据目录，Ctrl-C 停止。先停止同端口的常驻服务，否则端口会冲突：

```bash
runtime="$HOME/.local/lib/deepseek-harness-s390x/current"
"$runtime/node/bin/node" "$runtime/manage-install.mjs" foreground
```

原来的 `dsh web` 命令仍然可用，调用同一套 WebUI/Agent。它是前台命令；希望退出 SSH 后继续运行时使用上面的 systemd 服务。直接执行 `dsh web` 使用上游默认监听参数，不会自动读取 `installation.json`；公网启动应显式带上参数：

```bash
DSH_HOME="$HOME/.local/share/deepseek-harness" \
  "$HOME/.local/bin/dsh" web --no-open --host 0.0.0.0 --port 3080 \
  --public-url http://你的公网IP:3080/ --trusted-host 你的公网IP:3080
```

把两处 `你的公网IP` 换成同一个真实 IP/域名。自定义数据目录时把 `DSH_HOME` 一起换成安装时的目录。前台进程不保证在 SSH 断开后存活，也不要同时启动两份访问同一数据目录的 DSH。

### 4. 获取认证入口

启动日志中以 `dsh web: http...` 开头的 URL 带认证 token。通过该完整 URL 登录；之后浏览器使用认证 cookie。请在自己的终端查看日志，不要公开 token 或整个 service.log。

```bash
sed -n 's/^dsh web: \(http[^ ]*\)$/\1/p' \
  "$HOME/.local/share/deepseek-harness/service.log"
```

在自己电脑的浏览器打开完整 URL，接受首次欢迎提示后进入设置。重启后以当前日志的入口为准，旧入口可能失效；直接 CLI 启动时从它的终端输出获取入口。若文件尚无入口，稍等并看上一节日志；不要为了访问而关闭认证或 Host/Origin 检查。

监听地址为 `0.0.0.0`，内部自连接使用 loopback，对外地址为 `--public-url`。保留 DSH 的 token/cookie、Host/Origin 及 WebSocket 认证。默认 HTTP；公网 HTTP 会传输明文，有域名/证书时按[HTTPS](#https)配置 TLS。

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

### 7. 安装后核对与常见问题

```bash
"$HOME/.local/bin/dsh" --version
systemctl --user is-enabled deepseek-harness-s390x.service
systemctl --user is-active deepseek-harness-s390x.service
loginctl show-user "$USER" -p Linger
ss -ltn '( sport = :3080 )'
curl --connect-timeout 5 --max-time 10 -sS -o /dev/null \
  -w 'HTTP %{http_code}\n' http://127.0.0.1:3080/
```

systemd 应为 `enabled` / `active`，linger 应为 `yes`，端口应有监听。未带 token 的本机 HTTP 检查只验证收到响应，登录成功还需外部浏览器认证。确认公网可登录、发送消息、终端可用后退出 SSH，再打开浏览器验证服务仍在线；计划内重启服务器后重复检查以确认服务和防火墙持久化。

| 现象 | 排查方法 |
|---|---|
| `dsh: command not found` / 执行到旧版 | 检查 `command -v dsh` 与 PATH；使用 `~/.local/bin/dsh`，不要另装 npm 版覆盖 |
| `Exec format error` / glibc 错误 | 检查 `uname -m`、系统发行版和下载包；使用已验证的 Ubuntu 24.04 s390x 环境 |
| `EADDRINUSE` / 重复启动失败 | 用 `ss` 确认端口占用；停止现有 DSH 后再前台启动，或同步修改所有端口配置 |
| 退出 SSH 后服务关闭 | 确认使用 systemd 服务而非前台 CLI，检查 `Linger=yes` 与 service enabled/active |
| 本机响应但公网超时 | 检查 wildcard 监听、本机规则、云侧规则和公网 IP；开放服务所用 TCP 端口 |
| 登录拒绝 / WebSocket 403 | 使用当前完整认证入口，检查 URL、Host/Origin、`--trusted-host`；代理需转发 WebSocket，不关闭认证 |
| 聊天 401 | 检查当前会话的 provider、协议、Base URL、密钥来源及服务商权限；保存凭据不等于认证成功 |
| 搜索 401，聊天正常 | 看报错的搜索 endpoint；第三方聊天密钥不能用于官方搜索，按第 6 步分开配置 |
| 模型列表 404 / 模型不存在 | 按服务商给出的真实模型 ID 手动添加，并确认协议与路径；模型发现成功也不等于推理成功 |
| 模型请求 429 | 服务端额度/速率限制，降低请求密度、等候后重试；检查任务并发和账户额度 |
| 修改 `.env` 后仍用旧密钥 | 在空闲时重启；检查同名 `.credentials.yaml` 存储凭据，它优先于环境值 |
| Office 预览失败 | 确认 `libreoffice --version`、`pdftoppm -v` 和 `/usr/bin/python3 -c 'import uno'` 可用；安装第 2 步可选依赖 |

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
| Web Search / Web Fetch | 保留上游 provider；默认搜索需要官方凭据或真实兼容搜索服务，当前无官方搜索成功调用证据。第三方聊天成功不代表搜索可用；本机网页获取无需 DeepSeek 密钥 |
| Landlock | 真机 ABI 4，部分能力受内核限制；DSH 保留 partial enforcement 提示 |
| Electron 桌面壳 | 不属于服务器发行包 |

调查与分环境证据在 `reports/`，验收汇总见 [acceptance-summary.md](reports/build/acceptance-summary.md)，当前完成状态见 `reports/build/progress.md`。mock、真实模型、x64 模拟检查和 IBM 真机分别记录；QEMU 与完整 VM 未执行，已移出交付范围。没有测试证据的功能不标为支持。私钥、模型密钥、缓存、用户数据和 build/dist 不提交 Git。
