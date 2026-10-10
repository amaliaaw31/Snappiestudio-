#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 1 ]]; then
  echo "Usage: sudo bash deploy/install-visitor-counter.sh <bcrypt-password-hash>" >&2
  exit 2
fi

hash="$1"
backup="/etc/caddy/Caddyfile.backup-counter-$(date +%Y%m%d%H%M%S)"
cp -a /etc/caddy/Caddyfile "$backup"
install -m 0644 deploy/snappiestudio-counter.service /etc/systemd/system/snappiestudio-counter.service
systemctl daemon-reload
systemctl enable --now snappiestudio-counter
python3 deploy/update-caddy-counter.py "$hash"

if ! caddy validate --config /etc/caddy/Caddyfile; then
  cp -a "$backup" /etc/caddy/Caddyfile
  caddy reload --config /etc/caddy/Caddyfile
  exit 1
fi

cp -a dist/. /var/www/snappie/
caddy reload --config /etc/caddy/Caddyfile
curl --fail --silent http://127.0.0.1:3001/api/visitors >/dev/null
echo "Counter service and protected CMS are installed. Caddy backup: $backup"
