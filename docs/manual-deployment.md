# Manual deployment

**English** | [简体中文](manual-deployment.zh-CN.md) | [Project home](../README.md)

This guide targets Ubuntu 24.04 s390x. Configure each step yourself without using the automatic HTTPS wizard; the release installer verifies and copies the application. Use the same regular user to install and manage DSH.

- [Prerequisites](#prerequisites)
- [Manual HTTP installation](#manual-http-installation)
- [Manual HTTPS](#manual-https)
- [Upgrade, restore, and uninstall](#upgrade-restore-and-uninstall)

Copy one code block at a time. When a command asks for input, enter the answer before copying the next command. Do not append backslashes or join adjacent blocks. Keep the same SSH session during setup so variables remain available. Resolve errors before continuing.

## Prerequisites

| Requirement | Preparation |
|---|---|
| OS and architecture | Ubuntu 24.04, Linux `s390x`, glibc; x86_64, ARM64, and Alpine/musl packages are incompatible |
| User and permissions | A regular user with a writable home; sudo or administrator assistance for system packages and firewall rules; systemd user services for persistent operation |
| Resources | At least 4 GiB RAM and 5 GiB free disk space recommended; allow more for workspaces, sessions, logs, and upgrade backups |
| Network | GitHub and configured model/search endpoints must be reachable; allow the WebUI port in both cloud and local firewalls, default TCP 3080 |
| HTTPS identity | A real public IP/domain covered by your certificate; a domain needs an A record; automatic HTTP-01 validation also requires public TCP 80 |
| Model and search access | Protocol, base URL, model ID, and appropriate keys; WebUI starts without a model key, and chat/search are configured separately |
| Runtime | Node.js, pnpm, and native modules are bundled; installing an archive requires no system Node.js, Rust, or compiler |
| Office | Install LibreOffice, python3-uno, and Poppler separately for conversion, preview, and recalculation |

Check the environment. This whole block may be copied together; commands execute on separate lines:

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

`uname -m` must print `s390x`; persistent services require PID 1 to be `systemd`. Install basic tools and shared libraries:

```bash
sudo apt-get update
```

```bash
sudo apt-get install -y --no-install-recommends ca-certificates curl python3 tar gzip coreutils libstdc++6 libgcc-s1 iproute2 procps dbus-user-session nano
```

Check the user service manager and default port:

```bash
systemctl --user is-system-running
```

```bash
ss -ltn '( sport = :3080 )'
```

A responsive user manager is required. For `degraded`, inspect `systemctl --user --failed`. If it cannot connect to the bus, install `dbus-user-session`, log out of SSH, and reconnect as the same regular user. Do not use `sudo systemctl --user`. If the port already has a listener, identify that service or choose another DSH port.

Check outbound HTTPS without credentials:

```bash
curl -I --connect-timeout 15 --max-time 30 https://github.com/
```

A model endpoint returning 401/404 proves only that it returned an HTTP response, not that the key works. Resolve DNS, TLS, and connection errors first. For Office features, also install:

```bash
sudo apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress python3-uno poppler-utils fonts-dejavu-core
```

## Manual HTTP installation

### 1. Allow the service port

Allow TCP 3080 in the cloud firewall first. The following iptables commands were verified on the IBM Ubuntu test environment and apply only when iptables manages INPUT rules. With UFW/firewalld, configure that tool instead; for example, use `sudo ufw allow 3080/tcp` for UFW. Keep existing SSH rules.

Install iptables:

```bash
sudo apt-get install -y iptables
```

Add only the DSH port rule:

```bash
sudo iptables -C INPUT -p tcp --dport 3080 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 3080 -j ACCEPT
```

Install persistence support:

```bash
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
```

Save the existing rules:

```bash
sudo netfilter-persistent save
```

These commands do not flush rules. For another WebUI port, update the cloud firewall, local rule, installer `--port`, and public URL together.

### 2. Download, verify, and extract

This example pins the stable package tested on s390x with HTTPS, so the archive and checksum come from the same release. For another version, change both the release URL and filenames.

Create and enter a download directory:

```bash
download_dir=$(mktemp -d "$HOME/dsh-download.XXXXXXXX")
```

```bash
cd "$download_dir"
```

Set the release URL:

```bash
release=https://github.com/AnnaofArendelle/deepseek-harness-s390x/releases/download/native-https-0.2.2-rc.5-s390x-45e0c674
```

Download the archive and checksum separately:

```bash
curl -fLO "$release/deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz"
```

```bash
curl -fLO "$release/deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz.sha256"
```

Extract only after a successful checksum. Expect `OK` and no extraction errors:

```bash
sha256sum -c deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz.sha256 && tar -xzf deepseek-harness-0.2.2-rc.5-linux-s390x.tar.gz
```

```bash
cd deepseek-harness-0.2.2-rc.5-linux-s390x
```

### 3. Set the public URL and install

Copy this prompt alone. Enter your full HTTP URL, such as `http://YOUR_PUBLIC_IP:3080/`, then press Enter. Do not paste the next installer command into the prompt:

```bash
read -r -p 'Public URL (http://YOUR_PUBLIC_IP:3080/): ' dsh_public_url
```

Then run the installer with explicit arguments:

```bash
./install.sh --host 0.0.0.0 --port 3080 --public-url "$dsh_public_url"
```

**Installation with explicit arguments verifies and installs the application without running the HTTPS wizard or starting a service.** Running `./install.sh` without arguments opens the automatic HTTPS wizard. This manual path starts with HTTP; see [Manual HTTPS](#manual-https) to use an existing certificate. Changing only the public URL to `https://` does not enable TLS.

| Argument | Purpose | Value in this example |
|---|---|---|
| `--host` | Local bind address | `0.0.0.0`, all IPv4 interfaces |
| `--port` | DSH listening port | `3080`, matching the firewall and URL |
| `--public-url` | Browser entry and advertised address | The full HTTP URL browsers actually reach |
| `--trusted-host` | Allowed request Host/Origin | Derived from the public URL by the service launcher; set explicitly when using `dsh web` directly |

`0.0.0.0` means all local interfaces and cannot be a browser destination or certificate identity. Public IPs may be mapped through NAT or represented by a proxy domain; configure the reachable public URL once, then reuse the saved configuration.

The installer creates `~/.local/bin/dsh` and `~/.local/bin/dshctl`. Existing links are not overwritten; identify their source first. If it reports `Use upgrade for an existing installation`, follow the [upgrade procedure](#upgrade-restore-and-uninstall) rather than deleting data.

Enable the commands in the current shell:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

The new installer adds this line to `.bashrc`. For an older installation, save it manually:

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

The command should resolve to `~/.local/bin/dsh`. Zsh users can add the PATH line to `.zshrc`.

| Installed item | Default location |
|---|---|
| Application releases | `~/.local/lib/deepseek-harness-s390x/`, with `current` pointing to the active release |
| Installation configuration | `~/.local/lib/deepseek-harness-s390x/installation.json` |
| User data and credentials | `~/.local/share/deepseek-harness/` |
| Commands | `~/.local/bin/dsh`, `~/.local/bin/dshctl` |
| User service | `~/.config/systemd/user/deepseek-harness-s390x.service` (generated in the next step) |

Use `--data /absolute/path` during installation for a custom data directory. Direct CLI launches must set `DSH_HOME` to the same directory.

### 4. Configure a persistent service

The original manager commands remain supported. Set the runtime path:

```bash
runtime="$HOME/.local/lib/deepseek-harness-s390x/current"
```

Generate and enable the user systemd service without starting DSH:

```bash
"$runtime/node/bin/node" "$runtime/manage-install.mjs" service
```

Enable startup without an SSH login and continued operation after logout:

```bash
sudo loginctl enable-linger "$USER"
```

Start DSH and wait for readiness:

```bash
"$runtime/node/bin/node" "$runtime/manage-install.mjs" start
```

Check the service, startup setting, and linger:

```bash
systemctl --user status deepseek-harness-s390x.service --no-pager
```

```bash
systemctl --user is-enabled deepseek-harness-s390x.service
```

```bash
loginctl show-user "$USER" -p Linger
```

Expect `active (running)`, `enabled`, and `Linger=yes`. DSH and background tasks now continue after SSH logout; the service starts after a server reboot. In a new SSH session, set `runtime` again or use the systemctl/dshctl commands below.

### 5. Login and service control

The original private-log command remains available:

```bash
sed -n 's/^dsh web: \(http[^ ]*\)$/\1/p' "$HOME/.local/share/deepseek-harness/service.log"
```

New packages also provide `dshctl url`. Open the full URL in your browser, then [configure a model](configuration.md). The token is a login credential; do not share it or the private log. Obtain a new entry after restarting. HTTP carries unencrypted traffic; configure HTTPS if you need encryption.

| Action | Original command | Short command |
|---|---|---|
| Start | `systemctl --user start deepseek-harness-s390x.service` | `dshctl start` |
| Stop | `systemctl --user stop deepseek-harness-s390x.service` | `dshctl stop` |
| Restart | `systemctl --user restart deepseek-harness-s390x.service` | `dshctl restart` |
| Status | `systemctl --user status deepseek-harness-s390x.service --no-pager` | `dshctl status` |
| Logs | `tail -n 50 "$HOME/.local/share/deepseek-harness/service.log"` | `dshctl logs` |
| Follow logs | `tail -f "$HOME/.local/share/deepseek-harness/service.log"` | Same; Ctrl-C stops viewing |

You can also use `journalctl --user -u deepseek-harness-s390x.service -n 50 --no-pager`; available history depends on the system's journal configuration. End active Agent/background tasks and close terminals before stopping or restarting. `Restart=on-failure` does not immediately restart an explicitly stopped service, but the boot startup setting remains enabled.

Disable boot startup and stop:

```bash
systemctl --user disable --now deepseek-harness-s390x.service
```

Enable and start again:

```bash
systemctl --user enable --now deepseek-harness-s390x.service
```

### 6. Reboot checks and foreground operation

After a planned reboot, repeat the status checks from step 4 and verify persistent rules:

```bash
sudo iptables -C INPUT -p tcp --dport 3080 -j ACCEPT
```

```bash
sudo systemctl status netfilter-persistent --no-pager
```

Log in from an external browser and verify sessions and terminals. If DSH listens locally but public access times out, check the cloud rules and public address.

<details>
<summary>Optional: foreground debugging, dsh web, and port-rule removal</summary>

End tasks and close terminals before stopping the service. Do not run two DSH processes against the same data directory. To run the saved installation configuration in the foreground:

```bash
systemctl --user stop deepseek-harness-s390x.service
```

```bash
runtime="$HOME/.local/lib/deepseek-harness-s390x/current"
```

```bash
"$runtime/node/bin/node" "$runtime/manage-install.mjs" foreground
```

The original `dsh web` command uses upstream defaults and its arguments, not `installation.json`. For direct public HTTP, replace both public-IP placeholders:

```bash
DSH_HOME="$HOME/.local/share/deepseek-harness" "$HOME/.local/bin/dsh" web --no-open --host 0.0.0.0 --port 3080 --public-url http://YOUR_PUBLIC_IP:3080/ --trusted-host YOUR_PUBLIC_IP:3080
```

Ctrl-C stops the foreground process. Resume the service with `systemctl --user start deepseek-harness-s390x.service`. Foreground operation may end with SSH logout. For an existing HTTPS proxy, prefer the saved-config `foreground` command to avoid conflicting with the proxy port.

When no longer serving TCP 3080, remove only its rule:

```bash
sudo iptables -D INPUT -p tcp --dport 3080 -j ACCEPT
```

```bash
sudo netfilter-persistent save
```

Remove the cloud rule separately. Do not remove TCP 80 while it is still needed for automatic certificate renewal.

</details>

## Manual HTTPS

Upstream DSH provides `--tls-cert` and `--tls-key`; no rebuild is needed. The certificate must be trusted by the browser and cover the actual domain/public IP. Changing only `--public-url` does not enable TLS.

### Option A: DSH with an existing certificate

Use this for foreground operation or a systemd service you manage yourself. End tasks and close terminals, stop the current service, and ensure Nginx or another service does not occupy port 3080. Replace the domain and both certificate paths:

```bash
systemctl --user stop deepseek-harness-s390x.service
```

```bash
DSH_HOME="$HOME/.local/share/deepseek-harness" "$HOME/.local/bin/dsh" web --no-open --host 0.0.0.0 --port 3080 --public-url https://dsh.example.com:3080/ --trusted-host dsh.example.com:3080 --tls-cert /absolute/path/fullchain.pem --tls-key /absolute/path/privkey.pem
```

The running user needs read access to the certificate and private key; keep the key private. Open the authentication entry printed in the terminal. Ctrl-C stops DSH; the process is not guaranteed to survive SSH logout.

This command does not read the installer configuration. You manage certificate issuance, renewal, and systemd arguments for direct TLS; restart DSH after replacing a certificate. The package manager currently inspects health/tasks over loopback HTTP, so its saved-config startup and running-service upgrade checks cannot be applied directly to this custom TLS service. For the existing managed-service workflow, use Nginx below.

### Option B: An existing certificate with manual Nginx configuration

Nginx serves public HTTPS on 3080; DSH serves HTTP only on `127.0.0.1:3081`. This preserves health, task, and upgrade checks. Certificate renewal can reload Nginx without restarting DSH. Replace `dsh.example.com` with the domain/public IP covered by your certificate.

1. Complete the manual application installation above. Check that backend port 3081 is free, end active tasks/terminals, and stop DSH:

```bash
ss -ltn '( sport = :3081 )'
```

```bash
systemctl --user stop deepseek-harness-s390x.service
```

2. Edit the installation configuration, preserving `prefix`, `data`, and other existing fields. Change only the following three fields:

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

This shows fields to edit; **do not replace the whole file with this fragment**. A manually managed proxy does not use the wizard's `https` field or `dshctl renew`; use your own certificate-management tool.

3. Install Nginx and your existing certificate. Replace the source paths; do not overwrite another site's certificate:

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

4. Create a separate site configuration:

```bash
sudo nano /etc/nginx/conf.d/dsh-manual.conf
```

Use this configuration with your real domain/IP. Preserve Host, Origin, and WebSocket-upgrade semantics:

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

5. Verify and start the services. If the user service has not been generated yet, complete step 4 of the HTTP guide. Backend port 3081 is local-only and does not need a cloud/local firewall exception:

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

Open the HTTPS entry from an external browser; check trust, login, terminals, and refresh. The DSH user service and Nginx system service start independently at boot and continue after SSH logout.

After renewal, your certificate tool must update these files and run `sudo nginx -t && sudo systemctl reload nginx`. This example uses an existing certificate and **does not issue or renew certificates automatically**. HTTP-01 also needs public TCP 80 and the certificate tool's challenge route. Short-lived public-IP certificates require frequent automated renewal according to the CA's policy. For automatic configuration, use the [optional HTTPS wizard](../README.md#quick-start-optional).

## Upgrade, restore, and uninstall

Installed servers do not upgrade automatically. End active Agent/background tasks and close terminals, then download, verify, and extract a new package:

```bash
dshctl upgrade --package /absolute/path/to/new-package
```

For an older package without `dshctl`, run this from the extracted **new package directory**:

```bash
./bin/dshctl upgrade --package "$PWD"
```

If you want automatic HTTPS after upgrading, run `~/.local/bin/dshctl setup`. For manual HTTP or your own proxy, retain that configuration. Enable the command PATH in the current shell if needed: `export PATH="$HOME/.local/bin:$PATH"`.

The manager checks sessions, terminals, and jobs through the existing authentication API and refuses an upgrade when inspection fails. Stop foreground instances first. Upgrades back up data, switch the application, and check readiness; a failed startup restores the previous program and data snapshot. Do not downgrade directly into data migrated by a newer program.

Restore a previous snapshot:

```bash
dshctl restore --backup /absolute/path/to/backups/TIMESTAMP
```

Remove the application and user service while keeping data:

```bash
dshctl uninstall
```

Wizard-managed HTTPS uninstall needs sudo to remove its proxy configuration and certificate timer. It retains certificate/ACME state, local port rules, and other Nginx sites. Remove a manually created Nginx configuration separately. User linger may serve other tasks and is not disabled.
