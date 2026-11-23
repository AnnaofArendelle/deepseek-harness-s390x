# DeepSeek Harness for s390x

**English** · [简体中文](README.zh-CN.md)

Linux s390x support for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), with reproducible source patches, bundled runtime packages, and independent cross-compilation CI.

Run the WebUI, Agent, persistent terminals, background jobs, and plugins on IBM LinuxONE. Release packages include Node.js and the runtime dependencies; installation does not require a compiler.

[Latest release](https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases/latest) · [Build workflow](https://github.com/AnnaofArendelle/deepseek-harness-s390x/actions/workflows/build-s390x.yml) · [Manual deployment](docs/manual-deployment.md) · [Model and search configuration](docs/configuration.md)

## Project status

The current release uses upstream **0.2.2-rc.5**, commit `2e39e70496aa02986ca6a820c5d497e816b69d7e`, with Node.js **24.22.3** and pnpm **11.28.5**. The adaptation's Latest release is stable; its upstream baseline remains a release candidate.

The pinned native package has passed installation and runtime testing on Ubuntu 24.04 s390x. The latest deployment update adds trusted HTTPS, certificate renewal, and `dshctl` service commands, with installation, upgrade recovery, public WebSocket, and reboot checks on real hardware.

Automatically cross-compiled packages are labeled `targetRuntimeTested: false`. Their source, types, host simulations, and ELF checks do not establish runtime compatibility for future upstream versions. See the [acceptance summary](https://github.com/AnnaofArendelle/deepseek-harness-s390x/blob/main/reports/build/acceptance-summary.md) and [HTTPS deployment report](https://github.com/AnnaofArendelle/deepseek-harness-s390x/blob/main/reports/build/https-deployment.md) for the scope of each test.

## Requirements

| Requirement | Details |
|---|---|
| Operating system | Ubuntu 24.04, Linux s390x, glibc; packages do not run on x86_64, ARM64, or Alpine/musl |
| Service management | A regular user with a writable home directory; systemd user services for persistent operation; sudo for system dependencies and firewall rules |
| Resources | Recommended: at least 4 GiB RAM and 5 GiB free disk space, plus room for user data and backups |
| Network | Access to GitHub and the configured model/search providers; incoming TCP 3080 for the default WebUI |
| Automatic HTTPS | A public IPv4 address or domain, incoming TCP 80 for validation and renewal, and acceptance of the certificate authority's terms |
| Model access | A working API key, API protocol, base URL, and model ID; chat and search credentials are configured separately |

Node.js, pnpm, and native runtime modules are included. Office conversion requires additional system packages listed in the deployment guide.

## Installation options

| Option | Guide | Behavior |
|---|---|---|
| Manual deployment | [Step-by-step instructions](docs/manual-deployment.md) | Download and verify a release, configure ports and services, and optionally add HTTPS with your own certificate |
| Optional setup script | [Quick start below](#quick-start-optional) | Download Latest and configure trusted HTTPS, renewal, and a persistent user service through a wizard |

Use either method as the same regular user. Existing installations use the [upgrade procedure](docs/manual-deployment.md#upgrade-restore-and-uninstall).

## Quick start (optional)

Run these commands on the Ubuntu 24.04 s390x server, one code block at a time. First allow **TCP 80 and 3080** in the cloud firewall. For a domain, point its A record to the server; any AAAA record must also reach the validation service. The wizard does not configure IPv6.

Install the basic tools:

```bash
sudo apt-get update
```

```bash
sudo apt-get install -y --no-install-recommends ca-certificates curl python3 tar gzip coreutils libstdc++6 libgcc-s1 dbus-user-session
```

Download the optional installer for inspection:

```bash
curl -fL https://raw.githubusercontent.com/AnnaofArendelle/deepseek-harness-s390x/main/scripts/install-latest.sh -o install-dsh.sh
```

Run it as your regular user:

```bash
bash install-dsh.sh
```

Enter a public IPv4 address or domain **without a scheme, port, or path**. Confirm the cloud rules and Let's Encrypt terms when prompted. The script verifies the package checksum, installs Nginx, adds local port rules, obtains a trusted certificate, and enables renewal and startup without an SSH session.

After installation, enable the commands in the current shell:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Print the private login URL and open it in your browser:

```bash
dshctl url
```

Configure a model using the [configuration guide](docs/configuration.md). The URL contains an authentication token; keep it private. If setup fails, resolve the reported network, DNS, or service issue before retrying `dshctl setup`.

## Service commands

| Action | Command |
|---|---|
| Start | `dshctl start` |
| Stop | `dshctl stop` |
| Restart | `dshctl restart` |
| Status | `dshctl status` |
| Recent logs | `dshctl logs` |
| Login URL | `dshctl url` |
| Configure automatic HTTPS | `dshctl setup` |
| Check certificate renewal | `dshctl renew` |

The wizard enables a user systemd service and linger: DSH continues after SSH logout and starts after a server reboot. Manual deployments can enable the same behavior using the [service instructions](docs/manual-deployment.md#4-configure-a-persistent-service).

Stop active tasks and close terminals before restarting or upgrading. An explicit stop remains stopped until you start the service or reboot. With HTTPS configured, Nginx and the certificate timer remain active; requests return 502 while DSH is stopped.

The original `dsh web` command remains available for foreground operation. It uses its CLI arguments rather than the installer's saved configuration; see [foreground operation](docs/manual-deployment.md#6-reboot-checks-and-foreground-operation).

## Supported features

| Feature | Status |
|---|---|
| WebUI, Agent, persistent terminals, background jobs | Verified on s390x hardware; real compatible-model testing in the pinned native release, additional mock-model tool and job checks over HTTPS |
| Session storage, SQLite, Zstd, file locks | Verified with the target runtime |
| Plugins and hot reload | Loading, code changes, disable/remove, cache invalidation, and resource release verified |
| Images and browser PDF | Sharp processing, upload/display, PDF.js preview, and downloads verified |
| Office conversion and spreadsheet recalculation | System LibreOffice, UNO, and Poppler provider verified; the upstream WASM requires little-endian memory |
| Browser control | External Chrome DevTools MCP/CDP verified; no local Chromium binary is included for s390x |
| DSH child agents | Verified with a real compatible model |
| Web Search / Web Fetch | Upstream providers retained; search needs separate official or compatible search credentials. Local Web Fetch does not require a DeepSeek key |
| Landlock sandbox | Verified with ABI 4; some kernel capabilities remain partially enforced |
| SenseVoice, Codex/Claude standalone subagents, local CUA | Not supported by the current s390x package |
| Electron desktop shell | Outside the server package scope |

Office fonts use system Fontconfig/LibreOffice; the original WASM missing-font inventory and private font cache are not provided. Spreadsheet images use printed pages and may differ from upstream range rendering. Current search-provider testing does not include a successful official search API call.

## Build and updates

[Source build instructions](docs/building.md) cover native s390x builds and the local x64 cross-compilation entry point. Patches apply to the locked upstream source with exact context; conflicts or unreviewed native dependencies stop the build.

GitHub Actions uses Ubuntu 24.04 x64 runners for TypeScript/Web builds, type checks, host unit tests, big-endian simulations, and s390x cross-compilation. CI does **not** connect to an IBM server or run s390x binaries, QEMU, or a VM.

The workflow supports code changes, manual upstream refs, and daily upstream release checks, including prereleases and excluding drafts. Required checks must pass before publication. Installed servers are upgraded manually; programs and user data are stored separately, with task checks, backups, and recovery described in the deployment guide.

## Documentation

- [Manual deployment](docs/manual-deployment.md): prerequisites, port rules, verified downloads, HTTP/HTTPS, service management, and upgrades.
- [Model and search configuration](docs/configuration.md): official and custom providers, separate search credentials, and troubleshooting.
- [Building from source](docs/building.md): pinned toolchains, native builds, and cross-compilation.
- [Acceptance reports](https://github.com/AnnaofArendelle/deepseek-harness-s390x/blob/main/reports/build/acceptance-summary.md): hardware, host simulation, and model evidence.

## License and upstream

The adaptation scripts and patches are licensed under [MIT](LICENSE). DeepSeek Harness and bundled dependencies retain their respective licenses. The optional HTTPS setup downloads the pinned acme.sh client separately and preserves its GPLv3 license.

This is an independent platform adaptation. Report s390x packaging or deployment issues in [this repository](https://github.com/AnnaofArendelle/deepseek-harness-s390x/issues); the original project is [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).
