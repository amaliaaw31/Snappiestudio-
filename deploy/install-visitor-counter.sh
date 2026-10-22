#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."

if [[ $EUID != 0 || $# != 0 ]]; then
  echo 'Usage: sudo bash deploy/install-visitor-counter.sh' >&2
  echo 'Configure /etc/snappiestudio/counter.env and its private bcrypt file first. See SECURITY.md.' >&2
  exit 64
fi
if [[ ! -s /etc/snappiestudio/counter.env || ! -s /etc/snappiestudio/cms-password.hash ]]; then
  echo 'Missing private CMS configuration. No credentials or routes were changed.' >&2
  exit 1
fi
read -r cms_hash < /etc/snappiestudio/cms-password.hash
if [[ ! $cms_hash =~ ^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$ ]]; then
  echo 'Invalid bcrypt configuration. No credentials or routes were changed.' >&2
  exit 1
fi
unset cms_hash

bash scripts/deploy.sh
if [[ -f /etc/systemd/system/snappiestudio-counter.service ]]; then
  cp -a /etc/systemd/system/snappiestudio-counter.service /var/backups/snappiestudio/counter-before-install.service
fi
install -m 0644 deploy/snappiestudio-counter.service /etc/systemd/system/snappiestudio-counter.service
systemctl daemon-reload
systemctl enable snappiestudio-counter
systemctl restart snappiestudio-counter
curl --retry 5 --retry-connrefused --retry-delay 1 --fail --silent --show-error http://127.0.0.1:3001/api/visitors >/dev/null
echo 'Counter service and session-protected CMS installed. Existing account configuration was preserved.'
