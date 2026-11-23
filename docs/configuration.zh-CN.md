# 模型、搜索与配置

[English](configuration.md) | **简体中文** | [项目首页](../README.zh-CN.md)

完成部署并使用完整认证入口登录后，再配置以下功能。

## 模型提供方

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

## Web Search / Web Fetch

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

## 常见问题

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
| 模型列表接口 404 | 服务支持时可手动输入准确模型 ID；核对协议与 URL 格式 |
| Office 预览失败 | 检查 `libreoffice --version`、`pdftoppm -v`、`/usr/bin/python3 -c 'import uno'`；安装部署指南的 Office 软件 |
