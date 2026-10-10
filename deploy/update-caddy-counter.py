from pathlib import Path
import re
import sys


if len(sys.argv) != 2:
    raise SystemExit('Usage: update-caddy-counter.py <bcrypt-password-hash>')

password_hash = sys.argv[1]
if not re.fullmatch(r'\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}', password_hash):
    raise SystemExit('Expected a Caddy bcrypt password hash')

config_path = Path('/etc/caddy/Caddyfile')
config = config_path.read_text()
marker = 'snappiestudio.com, www.snappiestudio.com {'
if config.count(marker) != 1:
    raise SystemExit('Expected exactly one Snappie Studio Caddy site block')
if '@counter path /api/visitors' not in config:
    routes = f'''{marker}
    @counter path /api/visitors
    handle @counter {{
        reverse_proxy 127.0.0.1:3001
    }}

    @admin path /api/admin/*
    handle @admin {{
        basicauth {{
            admin {password_hash}
        }}
        reverse_proxy 127.0.0.1:3001
    }}

    @cmsDashboard path /cms/dashboard /cms/dashboard/ /cms-dashboard.html
    handle @cmsDashboard {{
        root * /var/www/snappie
        rewrite * /cms-dashboard.html
        file_server
    }}

    @cms path /cms /cms/ /cms.html
    handle @cms {{
        root * /var/www/snappie
        rewrite * /cms.html
        file_server
    }}'''
    config = config.replace(marker, routes, 1)

static_fallback = '''    root * /var/www/snappie

    try_files {path} /index.html

    file_server'''
wrapped_fallback = '''    handle {
        root * /var/www/snappie
        try_files {path} /index.html
        file_server
    }'''
if static_fallback in config:
    config = config.replace(static_fallback, wrapped_fallback, 1)
elif wrapped_fallback not in config:
    raise SystemExit('Could not find the Snappie static fallback to route safely')

config_path.write_text(config)
