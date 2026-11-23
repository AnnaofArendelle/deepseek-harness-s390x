#!/usr/bin/env bash
# Root-owned HTTPS integration: nginx terminates TLS without restarting Agent/PTY jobs.
set -euo pipefail
action=$1
uid=$2
state="/etc/deepseek-harness-s390x/$uid"

write_proxy() {
  local tls=$1
  cat > "/etc/nginx/conf.d/dsh-acme-$uid.conf" <<EOF
server {
    listen 80;
    server_name $address;
    location /.well-known/acme-challenge/ { root $state/webroot; }
    location / { return 301 https://\$host:$public_port\$request_uri; }
}
EOF
  if [[ $tls == yes ]]; then
    cat > "/etc/nginx/conf.d/dsh-s390x-$uid.conf" <<EOF
map \$http_upgrade \$dsh_connection_$uid {
    default upgrade;
    '' close;
}
server {
    listen $public_port ssl;
    server_name $address;
    ssl_certificate $state/tls/$address/fullchain.pem;
    ssl_certificate_key $state/tls/$address/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 0;
    location / {
        proxy_pass http://127.0.0.1:$backend_port;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$dsh_connection_$uid;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 3600s;
        proxy_cookie_flags ~ secure;
    }
}
EOF
  elif [[ $tls == no ]]; then
    rm -f "/etc/nginx/conf.d/dsh-s390x-$uid.conf"
  fi
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
}

case "$action" in
  prepare)
    # Arguments have been normalized once by the setup command.
    address=$3
    public_port=$4
    backend_port=$5
    env DEBIAN_FRONTEND=noninteractive apt-get update
    env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nginx openssl curl ca-certificates libstdc++6 libgcc-s1
    install -d -m 755 "$state/webroot/.well-known/acme-challenge" "$state/tls"
    install -d -m 700 "$state/acme"
    umask 077
    printf 'address=%q\npublic_port=%q\nbackend_port=%q\n' "$address" "$public_port" "$backend_port" > "$state/settings"
    install -m 700 "${BASH_SOURCE[0]}" "$state/https-system.sh"
    acme_commit=5567d7fe7298fd37aca53194885ba444c6678669
    curl -fL "https://raw.githubusercontent.com/acmesh-official/acme.sh/$acme_commit/acme.sh" -o "$state/acme/acme.sh"
    printf '%s  %s\n' 35bf6b947478666be137f938f77c5089954f120798220e6fff390949c5ea5692 "$state/acme/acme.sh" | sha256sum -c -
    curl -fL "https://raw.githubusercontent.com/acmesh-official/acme.sh/$acme_commit/LICENSE.md" -o "$state/acme/LICENSE.md"
    printf '%s  %s\n' 3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986 "$state/acme/LICENSE.md" | sha256sum -c -
    # The running DSH service is left untouched during certificate validation.
    write_proxy keep
    bash "$state/https-system.sh" firewall "$uid" "$public_port"
    printf 'dsh-https-ready\n' > "$state/webroot/.well-known/acme-challenge/dsh-setup-probe"
    chmod 644 "$state/webroot/.well-known/acme-challenge/dsh-setup-probe"
    ;;
  issue)
    source "$state/settings"
    install -d -m 755 "$state/tls/$address"
    profile=classic
    days=30
    if [[ $address =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then profile=shortlived; days=2; fi
    # Use the staging CA first to check public HTTP-01 reachability.
    staging="$state/staging"
    install -d -m 700 "$staging"
    bash "$state/acme/acme.sh" --issue --home "$staging" --server letsencrypt_test --webroot "$state/webroot" -d "$address" --keylength 2048 --certificate-profile "$profile" --days "$days" || {
      result=$?
      [[ $result == 2 && -f "$staging/$address/fullchain.cer" ]] || exit "$result"
    }
    bash "$state/acme/acme.sh" --issue --home "$state/acme" --server letsencrypt --webroot "$state/webroot" -d "$address" --keylength 2048 --certificate-profile "$profile" --days "$days" || {
      result=$?
      [[ $result == 2 && -f "$state/acme/$address/fullchain.cer" ]] || exit "$result"
    }
    bash "$state/acme/acme.sh" --install-cert --home "$state/acme" -d "$address" --key-file "$state/tls/$address/key.pem" --fullchain-file "$state/tls/$address/fullchain.pem" --reloadcmd 'systemctl reload nginx'
    chmod 600 "$state/tls/$address/key.pem"
    chmod 644 "$state/tls/$address/fullchain.pem"
    ;;
  enable)
    if [[ $# == 5 ]]; then
      printf 'address=%q\npublic_port=%q\nbackend_port=%q\n' "$3" "$4" "$5" > "$state/settings"
    fi
    source "$state/settings"
    write_proxy yes
    cat > "/etc/systemd/system/dsh-s390x-cert-$uid.service" <<EOF
[Unit]
Description=Renew DeepSeek Harness HTTPS certificate
After=network-online.target nginx.service
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/bin/bash $state/acme/acme.sh --cron --home $state/acme --server letsencrypt
EOF
    cat > "/etc/systemd/system/dsh-s390x-cert-$uid.timer" <<EOF
[Unit]
Description=Check DeepSeek Harness certificate renewal every six hours
[Timer]
OnCalendar=*-*-* 00,06,12,18:00:00
RandomizedDelaySec=900
Persistent=true
[Install]
WantedBy=timers.target
EOF
    systemctl daemon-reload
    systemctl enable --now "dsh-s390x-cert-$uid.timer"
    ;;
  firewall)
    public_port=$3
    if command -v ufw >/dev/null && LC_ALL=C ufw status | grep -q '^Status: active'; then
      ufw allow 80/tcp
      ufw allow "$public_port/tcp"
    elif systemctl is-active --quiet firewalld; then
      firewall-cmd --permanent --add-port=80/tcp
      firewall-cmd --permanent --add-port="$public_port/tcp"
      firewall-cmd --reload
    else
      env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends iptables iptables-persistent
      for port in 80 "$public_port"; do
        iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
      done
      netfilter-persistent save
    fi
    ;;
  disable)
    source "$state/settings"
    write_proxy no
    ;;
  remove)
    systemctl disable --now "dsh-s390x-cert-$uid.timer"
    rm -f "/etc/systemd/system/dsh-s390x-cert-$uid.service" "/etc/systemd/system/dsh-s390x-cert-$uid.timer" "/etc/nginx/conf.d/dsh-s390x-$uid.conf" "/etc/nginx/conf.d/dsh-acme-$uid.conf"
    systemctl daemon-reload
    nginx -t
    systemctl reload nginx
    # Retain private ACME account/certificates for a later reinstall.
    ;;
  renew)
    systemctl start "dsh-s390x-cert-$uid.service"
    ;;
  *) echo 'Unsupported HTTPS administration command' >&2; exit 1 ;;
esac
