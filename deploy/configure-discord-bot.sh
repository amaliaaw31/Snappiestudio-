#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
if [[ $EUID != 0 || $# -gt 1 || ( $# == 1 && $1 != --plan-phase1 && $1 != --register-phase1 && $1 != --plan-phase2 && $1 != --register-phase2 ) ]]; then
  echo 'Usage: sudo bash deploy/configure-discord-bot.sh [--plan-phase1|--register-phase1|--plan-phase2|--register-phase2]' >&2
  exit 64
fi
if [[ $# == 1 ]]; then
  IFS= read -r -s -p 'Bot token (hidden, not stored): ' discord_token
  printf '\n'
  printf '%s\n' "$discord_token" | /home/ubuntu/.nvm/versions/node/v24.21.0/bin/node scripts/discord-setup.mjs "$1"
  unset discord_token
  exit 0
fi
read -r -p 'Application ID: ' discord_application
read -r -p 'Public Key: ' discord_public_key
read -r -p 'Discord server ID: ' discord_guild
read -r -p 'Allowed channel ID: ' discord_channel
read -r -p 'Allowed user IDs (comma separated): ' discord_users
for discord_id in "$discord_application" "$discord_guild" "$discord_channel"; do
  if [[ ! $discord_id =~ ^[0-9]{15,22}$ ]]; then echo 'Invalid Discord ID.' >&2; exit 1; fi
done
if [[ ! $discord_public_key =~ ^[a-fA-F0-9]{64}$ || ! $discord_users =~ ^[0-9,\ ]+$ ]]; then
  echo 'Invalid public key or user IDs.' >&2
  exit 1
fi
printf 'Add the application to your Discord server using this URL:\nhttps://discord.com/oauth2/authorize?client_id=%s&scope=applications.commands&guild_id=%s&disable_guild_select=true\n' "$discord_application" "$discord_guild"
read -r -p 'After adding the application, press Enter to continue: ' discord_continue
IFS= read -r -s -p 'Bot token (hidden, not stored): ' discord_token
printf '\n'
printf '%s\n' "$discord_application" "$discord_public_key" "$discord_guild" "$discord_channel" "$discord_users" "$discord_token" | /home/ubuntu/.nvm/versions/node/v24.21.0/bin/node scripts/discord-setup.mjs
unset discord_token
