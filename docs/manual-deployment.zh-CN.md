# 手动部署指南

[English](manual-deployment.md) | **简体中文** | [项目首页](../README.zh-CN.md)

适用于 Ubuntu 24.04 s390x。以下步骤由用户逐项配置，无需一键 HTTPS 向导；发行包安装器负责校验和复制程序。使用同一个普通用户登录与管理 DSH。

- [前置环境](#前置环境)
- [手动 HTTP 安装与运行](#手动-http-安装与运行)
- [手动 HTTPS](#手动-https)
- [升级、恢复与卸载](#升级恢复与卸载)

每个代码框单独复制；提示命令出现输入框后先输入答案，再执行下一条命令。不在行尾添加反斜杠，不把相邻代码框拼接起来。配置期间保留同一 SSH 会话，变量才会继续有效。遇到报错先处理，不继续执行后续步骤。

## 前置环境

| 项目 | 要求及配置方法 |
|---|---|
| 系统与架构 | 已验证 Ubuntu 24.04、Linux `s390x`、glibc；x86_64、aarch64、Alpine/musl 不能使用此包 |
| 用户与权限 | 可写的普通用户主目录；系统软件和端口规则需要 sudo/管理员协助；常驻运行使用 systemd 用户服务 |
| 资源 | 建议至少 4 GiB 内存、5 GiB 可用磁盘，另为工作文件、会话、日志和升级备份留空间 |
| 网络 | 服务器能访问 GitHub 和模型/搜索端点；云侧与本机分别放行 WebUI 端口，默认 TCP 3080 |
| HTTPS 身份 | 使用真实公网 IP/域名；域名配置 A 记录；自动证书还需要公网 TCP 80 持续可达 |
| 模型与搜索 | 准备协议、Base URL、准确模型 ID 和对应密钥；没有密钥也可启动 WebUI，聊天与搜索分别配置 |
| 运行时 | Node、pnpm、原生模块已随包提供，安装压缩包无需系统 Node、Rust 或编译器 |
| Office | 预览、转换和表格重算另外安装 LibreOffice、python3-uno、Poppler，见下方可选命令 |

先检查环境（下面整个代码框可一次复制，命令仍按行执行）：

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

`uname -m` 须输出 `s390x`，后台服务流程要求 PID 1 为 `systemd`。安装基础工具与共享运行库：

```bash
sudo apt-get update
```

```bash
sudo apt-get install -y --no-install-recommends ca-certificates curl python3 tar gzip coreutils libstdc++6 libgcc-s1 iproute2 procps dbus-user-session nano
```

检查用户服务与默认端口：

```bash
systemctl --user is-system-running
```

```bash
ss -ltn '( sport = :3080 )'
```

用户服务管理器能响应即可；`degraded` 可通过 `systemctl --user --failed` 排查。若提示 `Failed to connect to bus`，安装 `dbus-user-session` 后退出 SSH，再以同一普通用户重新登录；不要使用 `sudo systemctl --user`。端口已有 `LISTEN` 时，先确认占用的服务，或为 DSH 选择其他端口。

可检查不携带密钥的 HTTPS 连通性：

```bash
curl -I --connect-timeout 15 --max-time 30 https://github.com/
```

模型接口返回 401/404 只说明收到 HTTP 响应，不能证明密钥可用；DNS、证书或连接超时需先处理。需要 Office 功能时额外安装：

```bash
sudo apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress python3-uno poppler-utils fonts-dejavu-core
```

## 手动 HTTP 安装与运行

### 1. 放行服务端口

先在云控制台放行 TCP 3080。下面是已在 IBM Ubuntu 测试机验证的 iptables 配置，**只用于由 iptables 管理 INPUT 的服务器**；已有 UFW/firewalld 时使用该工具配置，例如 UFW 使用 `sudo ufw allow 3080/tcp`，不混用不同工具。保留现有 SSH 规则。

安装 iptables：

```bash
sudo apt-get install -y iptables
```

只添加 DSH 端口规则：

```bash
sudo iptables -C INPUT -p tcp --dport 3080 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 3080 -j ACCEPT
```

安装规则持久化工具：

```bash
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
```

保存现有规则：

```bash
sudo netfilter-persistent save
```

这些命令不会清空现有规则。修改 WebUI 端口时，同时调整云侧、本机规则、安装的 `--port` 和公网 URL。

### 2. 下载、校验与解压

以下固定下载已通过 HTTPS 真机验收的正式包，便于压缩包和校验文件来自同一版本。下载其他版本时，按对应 Release 同时替换地址和文件名。

创建并进入下载目录：

```bash
download_dir=$(mktemp -d "$HOME/dsh-download.XXXXXXXX")
```

```bash
cd "$download_dir"
```

保存下载地址：

```bash
release=https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases/download/native-https-0.2.2-rc.5-s390x-45e0c674
```

分别下载压缩包和校验文件：

```bash
curl -fLO "$release/deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz"
```

```bash
curl -fLO "$release/deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz.sha256"
```

只在校验成功后解压，须看到 `OK` 且没有解压错误：

```bash
sha256sum -c deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz.sha256 && tar -xzf deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz
```

```bash
cd deepseek-harness-0.2.2-rc.5-linux-s390x
```

### 3. 输入公网地址并手动安装

这条提示命令**单独复制**，出现提示后输入完整 HTTP URL，例如 `http://你的公网IP:3080/`，按 Enter。不要把下一条安装命令当作输入：

```bash
read -r -p '请输入公网 URL（http://你的公网IP:3080/）: ' dsh_public_url
```

输入完成后，单独执行带显式参数的安装命令：

```bash
./install.sh --host 0.0.0.0 --port 3080 --public-url "$dsh_public_url"
```

**带参数的安装只校验并安装程序，不调用 HTTPS 向导，不启动服务。** 无参数 `./install.sh` 才进入一键 HTTPS 向导。手动流程先部署 HTTP；已有证书时可按[手动 HTTPS](#手动-https)切换。仅把 public URL 改成 `https://` 不会启用 TLS。

| 参数 | 作用 | 此处填写 |
|---|---|---|
| `--host` | 本机监听地址 | `0.0.0.0`，监听所有 IPv4 网卡 |
| `--port` | DSH 监听端口 | `3080`，与规则及 URL 一致 |
| `--public-url` | 浏览器登录入口与对外公告地址 | 浏览器实际可达的完整 HTTP URL |
| `--trusted-host` | 允许的请求 Host/Origin | 托管脚本从 public URL 自动配置；直接 `dsh web` 时手动填写 |

`0.0.0.0` 是监听所有网卡的地址，不能作为浏览器访问地址或证书身份。公网 IP 可能由 NAT 映射，也可能使用代理域名，因此 public URL 填一次真实地址并保存，后续启动不用重填。

安装会创建 `~/.local/bin/dsh` 和 `~/.local/bin/dshctl`。已有同名链接时不会覆盖，应先确认来源；看到 `Use upgrade for an existing installation` 时使用[升级流程](#升级恢复与卸载)，不要删除数据重装。

在当前终端启用命令路径：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

新版安装器已将此行写入 `.bashrc`。旧版可手动保存到后续 Bash 会话：

```bash
if ! grep -Fqx 'export PATH="$HOME/.local/bin:$PATH"' "$HOME/.bashrc" 2>/dev/null; then
  printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$HOME/.bashrc"
fi
```

```bash
command -v dsh
```

```bash
dsh --version
```

命令应指向 `~/.local/bin/dsh`；Zsh 用户将路径配置写入 `.zshrc`。

| 安装内容 | 默认位置 |
|---|---|
| 程序版本 | `~/.local/lib/deepseek-harness-s390x/`，`current` 指向当前版本 |
| 启动配置 | `~/.local/lib/deepseek-harness-s390x/installation.json` |
| 用户数据与凭据 | `~/.local/share/deepseek-harness/` |
| 命令链接 | `~/.local/bin/dsh`、`~/.local/bin/dshctl` |
| 用户服务 | `~/.config/systemd/user/deepseek-harness-s390x.service`（下一步生成） |

自定义数据目录可在安装时传入 `--data /absolute/path`；直接 CLI 启动时也要将 `DSH_HOME` 指向相同目录。

### 4. 手动配置常驻服务与开机启动

保留原来的管理器调用方式。先保存运行目录：

```bash
runtime="$HOME/.local/lib/deepseek-harness-s390x/current"
```

生成并启用用户级 systemd 服务，此命令不启动 DSH：

```bash
"$runtime/node/bin/node" "$runtime/manage-install.mjs" service
```

允许用户服务退出 SSH 后继续运行、开机后无需登录即可启动：

```bash
sudo loginctl enable-linger "$USER"
```

启动并等待 DSH 就绪：

```bash
"$runtime/node/bin/node" "$runtime/manage-install.mjs" start
```

核对服务、开机启动和 linger：

```bash
systemctl --user status deepseek-harness-s390x.service --no-pager
```

```bash
systemctl --user is-enabled deepseek-harness-s390x.service
```

```bash
loginctl show-user "$USER" -p Linger
```

应分别看到 `active (running)`、`enabled`、`Linger=yes`。之后退出 SSH，DSH 与后台任务仍运行；服务器重启后自动启动。换一个 SSH 终端使用管理器时，重新赋值 `runtime`，或直接用下表的 systemctl / dshctl 命令。

### 5. 获取认证入口、日常启停

原来的日志读取方式仍可用：

```bash
sed -n 's/^dsh web: \(http[^ ]*\)$/\1/p' "$HOME/.local/share/deepseek-harness/service.log"
```

新版也可执行 `dshctl url`。在自己电脑的浏览器打开完整 URL，登录后配置模型。token 是登录凭据，不分享完整 URL 或私有日志；重启后使用新入口。HTTP 链路是明文，需要加密时继续配置 HTTPS。

| 操作 | 原来的手动命令 | 新版短命令 |
|---|---|---|
| 启动 | `systemctl --user start deepseek-harness-s390x.service` | `dshctl start` |
| 停止 | `systemctl --user stop deepseek-harness-s390x.service` | `dshctl stop` |
| 重启 | `systemctl --user restart deepseek-harness-s390x.service` | `dshctl restart` |
| 状态 | `systemctl --user status deepseek-harness-s390x.service --no-pager` | `dshctl status` |
| 日志 | `tail -n 50 "$HOME/.local/share/deepseek-harness/service.log"` | `dshctl logs` |
| 跟踪日志 | `tail -f "$HOME/.local/share/deepseek-harness/service.log"` | 同左，Ctrl-C 退出查看 |

也可使用 `journalctl --user -u deepseek-harness-s390x.service -n 50 --no-pager`，可见历史取决于系统 journal 配置。停止/重启前先结束正在运行的 Agent、后台任务与终端。`Restart=on-failure` 不会在主动 `stop` 后立即重启，但保留下次开机启动。

取消开机启动并停止：

```bash
systemctl --user disable --now deepseek-harness-s390x.service
```

重新启用并启动：

```bash
systemctl --user enable --now deepseek-harness-s390x.service
```

### 6. 重启核对与可选前台调试

计划内重启服务器后，重复第 4 步状态检查，并核对持久化规则：

```bash
sudo iptables -C INPUT -p tcp --dport 3080 -j ACCEPT
```

```bash
sudo systemctl status netfilter-persistent --no-pager
```

再从外部浏览器登录，确认终端和会话正常。若本机有监听但公网超时，检查云侧规则和公网地址。

<details>
<summary>可选：前台调试、原来的 dsh web 和撤销端口规则</summary>

先结束任务和终端，再停止常驻服务；不要同时启动两份 DSH 访问同一数据目录。前台读取安装配置：

```bash
systemctl --user stop deepseek-harness-s390x.service
```

```bash
runtime="$HOME/.local/lib/deepseek-harness-s390x/current"
```

```bash
"$runtime/node/bin/node" "$runtime/manage-install.mjs" foreground
```

原来的 `dsh web` 仍可用，使用上游默认参数而非 `installation.json`。手动 HTTP 公网启动示例，替换两处公网地址：

```bash
DSH_HOME="$HOME/.local/share/deepseek-harness" "$HOME/.local/bin/dsh" web --no-open --host 0.0.0.0 --port 3080 --public-url http://你的公网IP:3080/ --trusted-host 你的公网IP:3080
```

Ctrl-C 停止前台进程，再执行 `systemctl --user start deepseek-harness-s390x.service` 恢复常驻服务。前台进程不保证退出 SSH 后仍运行；已配置 HTTPS 代理时，优先用读取保存参数的 `foreground`，避免与代理端口冲突。

不再开放 3080 时，只撤销这一条规则，不清空防火墙：

```bash
sudo iptables -D INPUT -p tcp --dport 3080 -j ACCEPT
```

```bash
sudo netfilter-persistent save
```

云侧规则需另行撤销；自动证书仍需要 80 时不要撤销它。

</details>

## 手动 HTTPS

DSH 上游自带 `--tls-cert` / `--tls-key`，无需重新编译。证书需由浏览器信任，且覆盖实际访问的域名或公网 IP。仅修改 `--public-url` 为 HTTPS 不会打开 TLS。

### 方式 A：使用已有证书直接启动 DSH

适合前台运行或自行管理 systemd 的用户。先结束任务与终端，再停止当前 DSH 服务；确认 3080 没有被 Nginx 等其他服务占用。下例中的域名和两条证书路径都要替换：

```bash
systemctl --user stop deepseek-harness-s390x.service
```

```bash
DSH_HOME="$HOME/.local/share/deepseek-harness" "$HOME/.local/bin/dsh" web --no-open --host 0.0.0.0 --port 3080 --public-url https://dsh.example.com:3080/ --trusted-host dsh.example.com:3080 --tls-cert /absolute/path/fullchain.pem --tls-key /absolute/path/privkey.pem
```

运行用户须能读取证书和私钥，私钥不要开放给其他用户。浏览器打开终端输出的完整认证入口。Ctrl-C 停止；前台运行不保证 SSH 断开后存活。

此命令不读取安装器配置。直接 TLS 的证书申请、续期及 systemd 参数由用户管理；证书更新后需重启 DSH。当前管理器的健康/任务检查走 loopback HTTP，因此直接 TLS 服务不能直接套用 `dshctl start` 或升级器的运行中检查。需要继续使用现有托管管理流程，可选择下方 Nginx 方式。

### 方式 B：已有证书 + 手动 Nginx 代理

公网 Nginx 监听 HTTPS 3080，DSH 只在 `127.0.0.1:3081` 提供 HTTP。此方式保留安装器的健康、任务和升级检查；续期只重载 Nginx，不重启 DSH。以下示例使用 `dsh.example.com`，替换为真实证书域名或公网 IP。

1. 按上面的手动安装流程安装程序。确认 backend 3081 空闲，结束任务和终端，再停止 DSH：

```bash
ss -ltn '( sport = :3081 )'
```

```bash
systemctl --user stop deepseek-harness-s390x.service
```

2. 编辑安装配置，保留原来的 `prefix`、`data` 与其他字段，只修改下面三个字段：

```bash
nano "$HOME/.local/lib/deepseek-harness-s390x/installation.json"
```

```json
{
  "host": "127.0.0.1",
  "port": 3081,
  "publicUrl": "https://dsh.example.com:3080/"
}
```

这是待修改字段的示意，**不要用它替换整个配置文件**。由用户手动管理的代理不添加向导的 `https` 字段，不调用 `dshctl renew`；证书续期交给现有 ACME/证书管理工具。

3. 安装 Nginx，保存已有证书。替换源文件的绝对路径；不要改写其他网站的证书：

```bash
sudo apt-get install -y --no-install-recommends nginx
```

```bash
sudo install -d -m 755 /etc/nginx/dsh
```

```bash
sudo install -m 644 /absolute/path/fullchain.pem /etc/nginx/dsh/fullchain.pem
```

```bash
sudo install -m 600 /absolute/path/privkey.pem /etc/nginx/dsh/privkey.pem
```

4. 创建独立站点配置：

```bash
sudo nano /etc/nginx/conf.d/dsh-manual.conf
```

填入以下内容，替换 `dsh.example.com`；保留 Host、Origin 和 WebSocket 升级头的语义：

```nginx
map $http_upgrade $dsh_manual_connection {
    default upgrade;
    '' close;
}
server {
    listen 3080 ssl;
    server_name dsh.example.com;
    ssl_certificate /etc/nginx/dsh/fullchain.pem;
    ssl_certificate_key /etc/nginx/dsh/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 0;
    location / {
        proxy_pass http://127.0.0.1:3081;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $dsh_manual_connection;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 3600s;
        proxy_cookie_flags ~ secure;
    }
}
```

5. 检查并启动服务。若手动 HTTP 流程尚未生成用户服务，先完成其第 4 步。3081 仅在 loopback 使用，云侧和本机无需放行：

```bash
sudo nginx -t
```

```bash
sudo systemctl enable --now nginx
```

```bash
sudo systemctl reload nginx
```

```bash
dshctl start
```

```bash
dshctl url
```

在外部浏览器打开 HTTPS 登录入口，检查证书、登录、终端与刷新。DSH 用户服务和 Nginx 系统服务分别开机启动；退出 SSH 后继续运行。

证书管理工具需在续期后更新上述文件并执行 `sudo nginx -t && sudo systemctl reload nginx`。此手动示例使用已有证书，**不会自动申请或续期**。如果选择 HTTP-01 验证，还需要公网 TCP 80 和该工具要求的 challenge 路由；公网 IP 的短期证书须按 CA 要求配置频繁自动续期。需要自动完成这些步骤，可使用[可选一键 HTTPS 向导](../README.zh-CN.md#快速安装可选)。

## 升级、恢复与卸载

已安装服务器不会自动升级。结束正在运行的 Agent、后台任务并关闭终端后，下载、校验并解压新包，然后执行：

```bash
dshctl upgrade --package /absolute/path/to/new-package
```

旧版还没有 `dshctl` 时，在**解压的新包目录**执行：

```bash
./bin/dshctl upgrade --package "$PWD"
```

希望升级后使用自动 HTTPS 时，执行 `~/.local/bin/dshctl setup`；保留手动 HTTP 或已有代理时沿用原配置。当前会话找不到短命令时执行 `export PATH="$HOME/.local/bin:$PATH"`。

升级器通过现有认证 API 检查会话、终端和任务；无法检查时拒绝升级。前台服务需先停止。升级备份数据、切换程序并检查服务就绪；失败时恢复旧程序和数据备份，失败数据单独保留。发生数据迁移后不要直接用旧程序读取新数据。

恢复某次升级前状态：

```bash
dshctl restore --backup /absolute/path/to/backups/TIMESTAMP
```

卸载程序和用户服务，保留数据：

```bash
dshctl uninstall
```

HTTPS 卸载会移除本安装的代理配置与续期定时器，需要 sudo；保留证书/ACME 账户、本机端口规则和其他 Nginx 网站。手动创建的 Nginx 站点需自行移除。无需取消用户 linger，它可能还服务于其他用户任务。

