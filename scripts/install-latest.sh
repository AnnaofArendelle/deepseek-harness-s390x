#!/usr/bin/env bash
# Download the current Latest package, verify it, then open its setup wizard.
set -euo pipefail
[[ $(uname -m) == s390x ]] || { echo '需要 Ubuntu 24.04 s390x 服务器。' >&2; exit 1; }
for tool in curl python3 tar sha256sum; do
  command -v "$tool" >/dev/null || { echo "缺少 $tool，请先执行 README 的基础工具安装命令。" >&2; exit 1; }
done
download_dir=$(mktemp -d "$HOME/dsh-download.XXXXXXXX")
cd "$download_dir"
curl -fsSL https://api.github.com/repos/AnnaofArendelle/deepseek-harness-s390x/releases/latest -o release.json
python3 - <<'PY' > assets.txt
import json
release=json.load(open('release.json'))
package=next(a for a in release['assets'] if a['name'].startswith('deepseek-harness-') and a['name'].endswith('-linux-s390x.tar.gz'))
checksum=next(a for a in release['assets'] if a['name']==package['name']+'.sha256')
print(package['browser_download_url'])
print(checksum['browser_download_url'])
print(package['name'])
PY
mapfile -t assets < assets.txt
curl -fL "${assets[0]}" -o "${assets[2]}"
curl -fL "${assets[1]}" -o "${assets[2]}.sha256"
sha256sum -c "${assets[2]}.sha256"
tar -xzf "${assets[2]}"
cd "${assets[2]%.tar.gz}"
./install.sh
printf '\n当前 SSH 终端请执行：export PATH="$HOME/.local/bin:$PATH"\n下载目录可在安装成功后删除：%s\n' "$download_dir"
