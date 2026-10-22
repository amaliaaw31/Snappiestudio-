"""The former Basic Auth/static-dashboard installer must not alter modern routing."""

raise SystemExit(
    'Legacy Caddy updater disabled. Configure credentials outside the web root, '
    'then run sudo bash deploy/install-visitor-counter.sh. See SECURITY.md.'
)
