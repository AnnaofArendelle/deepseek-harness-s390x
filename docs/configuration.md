# Model and search configuration

**English** | [简体中文](configuration.zh-CN.md) | [Project home](../README.md)

Complete deployment and sign in through the full authentication URL before configuring these features.

## Model providers

Model requests, Web Search, and Web Fetch are separate capabilities. A working chat provider does not establish search access. Keep third-party credentials in their own provider so official tools do not consume them as DeepSeek keys.

### Official DeepSeek service

In **Settings → Models → DeepSeek**, enter an official API key and keep the official endpoint and supported model list, then select that provider in a session. The official card uses the Anthropic Messages protocol; do not put a generic OpenAI-compatible gateway URL/key into that card. Account login is also available in the UI; actual access depends on the account service.

### Third-party or self-hosted service

1. Open **Settings → Models → Add model provider → Custom model API**. Dismiss the initial official-key prompt if needed; do not enter a gateway key in the official card.
2. Choose a unique provider ID, such as `my-gateway`. Do not use the reserved `deepseek-official` or `deepseek-account` IDs.
3. Select the protocol documented by the service. A typical gateway uses **OpenAI Chat Completions**; select Responses or Anthropic Messages only if explicitly supported.
4. Enter the **Base URL** and **API key**. A Chat Completions example is `https://gateway.example/v1`, without `/chat/completions`. For custom Anthropic Messages, `https://gateway.example` lets the SDK append `/v1/messages`. Replace these examples with your service's actual address.
5. Fetch available models, choose them, and update the list. If discovery is unavailable, enter the service's exact model ID manually. Configure at least one model; a display name is not necessarily its request ID.
6. Save/apply. Create a session and select the new provider/model. First verify a streamed reply; then ask the Agent to run `uname -m` and inspect the actual tool output for `s390x`.

Image input, tools, reasoning options, and streaming must be supported by the actual endpoint/model. A model name containing `deepseek` does not make its custom provider an official route. A saved-credential indicator does not prove remote authentication works.

The UI stores custom-provider keys under separate credential references. The default credential store is `$DSH_HOME/.credentials.yaml`, with mode `600`; use the UI rather than public commands or documents. An SSH `export` does not affect an already running systemd service. Existing stored credentials take precedence over environment variables with the same name.

Release packages contain no test credentials. Previous real-model acceptance used a user-provided compatible service reporting model `deepseek-v4.1-flash`; this does not establish official API or official Web Search access.

## Web Search / Web Fetch

The adaptation retains upstream providers. In automatic mode, `deepseek-official`/`deepseek-account` routes prefer **DeepSeek server-side search** via Messages; other routes prefer **DeepSeek Search API**. The direct Search API defaults to `https://api.deepseek.com/v1/tools/search`. Web Fetch defaults to local direct HTTP fetching and needs no DeepSeek key, but fetches only allowed public HTTP(S) destinations.

A chat provider's `baseURL` does not replace these search endpoints. A third-party key saved as global `DEEPSEEK_API_KEY` may be sent to the official Search API, producing **HTTP 401 / Authentication Fails**. This endpoint/credential mismatch also affects other CPU architectures.

### Configure official search access

1. Open **Sidebar plugins → Built-in plugin configuration → Official → Web search and fetch**.
2. Select **DeepSeek Search API**, and choose billing via a **DeepSeek API key** or a **signed-in DeepSeek account**.
3. The key route uses the official Models-page credentials; the account route requires successful account login. The service determines eligibility, quota, and billing.
4. Keep **local direct fetching** as the Web Fetch provider, then save. Changes apply to subsequent operations.
5. Ask the Agent to search and cite sources in a new session. Expand the `web_search` tool result and verify real URLs and a successful response; model prose alone is not acceptance evidence.

Independent YAML fields can override billing selection. **DeepSeek server-side search** uses a separate Messages endpoint, default `https://api.deepseek.com/anthropic/v1/messages`, requiring support for `web_search_20250305`. A generic chat-compatible endpoint does not imply this capability; changing its hostname does not add search support.

### Separate search credentials from third-party chat

These settings also apply to a gateway explicitly compatible with the DeepSeek Search API. Change the Web profile while tasks are idle, since it may hot-reload. Back up and edit the existing patch; merge configuration into an existing matching `id` instead of replacing the file or adding duplicate entries. For the default data directory:

```bash
dsh_data="$HOME/.local/share/deepseek-harness"
dsh_patch="$dsh_data/profiles/web/cordis.patch.yml"
cp -p "$dsh_patch" "$dsh_patch.backup-$(date +%Y%m%d-%H%M%S)"
nano "$dsh_patch"
```

Merge these entries to use the official direct search endpoint with a separate `DEEPSEEK_SEARCH_API_KEY`:

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

`searchBaseURL` includes the path prefix but **omits the final `/search`**, which the provider appends. Only use a third-party endpoint if its operator confirms the search protocol. Chat Completions compatibility does not imply `/v1/tools/search` support. These two fields are configured in YAML; omitting `searchApiKeyEnv` continues to use `DEEPSEEK_API_KEY`.

Save the separate key in the data directory's `.env` using an editor, keeping existing variables. Do not put the secret in shell history:

```bash
dsh_data="$HOME/.local/share/deepseek-harness"
(umask 077; touch "$dsh_data/.env")
chmod 600 "$dsh_data/.env"
nano "$dsh_data/.env"
```

Add a single entry with the actual search-service key:

```dotenv
DEEPSEEK_SEARCH_API_KEY=REPLACE_WITH_YOUR_SEARCH_SERVICE_KEY
```

Save the file, end active tasks, and restart:

```bash
systemctl --user restart deepseek-harness-s390x.service
```

If `.credentials.yaml` already has the same reference in `refs`, that value takes precedence over `.env`; update/remove the old value while preserving other records and mode `600`. `DEEPSEEK_SEARCH_BASE_URL` belongs to the separate Messages search provider, not the direct Search API's `searchBaseURL`.

Without working search credentials, chat, terminals, and local Web Fetch can still work, but search remains unavailable. Alternatively, install a working external search-provider plugin and configure it according to its documentation. This project currently has no successful official search API call in its acceptance evidence.

## Troubleshooting

| Symptom | Check |
|---|---|
| `dshctl: command not found` | Run `export PATH="$HOME/.local/bin:$PATH"`, or use `~/.local/bin/dshctl` |
| Certificate validation fails | Check cloud TCP 80, local rules, public IPv4, A/AAAA records; fix the reported issue before retrying `dshctl setup` |
| Browser reports a certificate mismatch | Use the address from `dshctl url`; rerun setup after an IP/domain change |
| Public connection times out | Check cloud/local WebUI port rules and `dshctl status` |
| HTTPS returns 502 | Start DSH and inspect `dshctl logs` |
| Chat/search returns 401 | Check the provider, protocol, endpoint, and each service's credential source |
| User bus unavailable | Reconnect through SSH as the regular user and verify `dbus-user-session` is installed |
| Automatic renewal fails | Keep TCP 80 reachable; run `dshctl renew` and inspect the actual result, not only timer enablement |
| Models endpoint returns 404 | Configure the exact model ID manually if supported; verify protocol and URL format |
| Office preview fails | Check `libreoffice --version`, `pdftoppm -v`, and `/usr/bin/python3 -c 'import uno'`; install the deployment guide's Office packages |
