#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
if [[ $EUID != 0 || $# != 0 ]]; then
  echo 'Usage: sudo bash deploy/install-maintenance.sh' >&2
  exit 64
fi
for file in cms-account.json cms-key.bin; do
  test -s "/var/lib/snappiestudio-counter/$file"
done
install -d -o ubuntu -g ubuntu -m 0700 /var/lib/snappiestudio-backups
install -d -o ubuntu -g ubuntu -m 0755 /var/lib/snappiestudio-counter/geo
for unit in snappiestudio-backup.service snappiestudio-backup.timer snappiestudio-geoip.service snappiestudio-geoip.timer snappiestudio-reports.service snappiestudio-reports.timer snappiestudio-monitor.service snappiestudio-monitor.timer; do
  install -m 0644 "deploy/$unit" "/etc/systemd/system/$unit"
done
systemctl daemon-reload
systemctl enable --now snappiestudio-backup.timer snappiestudio-geoip.timer snappiestudio-reports.timer snappiestudio-monitor.timer
echo 'Verified backups, GeoIP updates, report archives and service monitoring scheduled. External destinations require private configuration.'
