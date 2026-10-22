#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."

if [[ $EUID != 0 || $# != 0 ]]; then
  echo 'Usage: sudo -n bash scripts/deploy.sh' >&2
  exit 64
fi
if [[ ! -s dist/index.html || ! -s dist/snappie-app-csp.caddy ]]; then
  echo 'Build the site before deploying.' >&2
  exit 1
fi
if ! grep -Fq 'import /etc/caddy/snappie-security.caddy' /etc/caddy/Caddyfile; then
  echo 'Add the Snappie security import to its Caddy site block first. See SECURITY.md.' >&2
  exit 1
fi

install -d -m 0700 /var/backups/snappiestudio
backup=$(mktemp -d /var/backups/snappiestudio/deploy-XXXXXXXX)
for name in snappie-security.caddy snappie-app-csp.caddy; do
  if [[ -f /etc/caddy/$name ]]; then cp -a "/etc/caddy/$name" "$backup/$name"; fi
done
if [[ -d /var/www/snappie ]]; then cp -a /var/www/snappie "$backup/site"; fi

rollback() {
  trap - ERR
  set +e
  for name in snappie-security.caddy snappie-app-csp.caddy; do
    if [[ -f $backup/$name ]]; then cp -a "$backup/$name" "/etc/caddy/$name"; fi
  done
  if [[ -d $backup/site ]]; then cp -a "$backup/site/." /var/www/snappie/; fi
  caddy validate --config /etc/caddy/Caddyfile && caddy reload --config /etc/caddy/Caddyfile
  echo "Deploy failed. Previous files restored from $backup" >&2
  exit 1
}
trap rollback ERR
install -m 0644 dist/snappie-app-csp.caddy /etc/caddy/snappie-app-csp.caddy
install -m 0644 deployment/snappie.caddy /etc/caddy/snappie-security.caddy
caddy validate --config /etc/caddy/Caddyfile
install -d /var/www/snappie
cp -a dist/. /var/www/snappie/
caddy reload --config /etc/caddy/Caddyfile
curl --fail --silent --show-error https://snappiestudio.com/ -o /dev/null
trap - ERR
echo "Site deployed. Previous files: $backup"
