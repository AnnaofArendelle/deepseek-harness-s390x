#!/usr/bin/env bash
set -euo pipefail
package_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ $(uname -m) == s390x ]] || { echo 'This package requires Linux s390x.' >&2; exit 1; }
if [[ $# == 0 ]]; then
  exec "$package_root/node/bin/node" "$package_root/manage-install.mjs" install --package "$package_root" --setup
fi
exec "$package_root/node/bin/node" "$package_root/manage-install.mjs" install --package "$package_root" "$@"
