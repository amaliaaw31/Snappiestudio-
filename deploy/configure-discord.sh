#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
if [[ $EUID != 0 || $# != 0 ]]; then
  echo 'Usage: sudo bash deploy/configure-discord.sh' >&2
  exit 64
fi
IFS= read -r -s -p 'Discord webhook URL (hidden): ' discord_webhook
printf '\n'
printf '%s' "$discord_webhook" | /home/ubuntu/.nvm/versions/node/v24.21.0/bin/node --input-type=module -e '
import {readFileSync, existsSync, mkdirSync, writeFileSync, chownSync, renameSync, rmSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {discordWebhook} from "./server/notifications.js";
const path="/etc/snappiestudio/maintenance.env";
const value=readFileSync(0,"utf8").trim();
let canonical;
try { canonical=discordWebhook(value).href; } catch { console.error("Invalid Discord webhook URL. Configuration unchanged."); process.exit(1); }
const previous=existsSync(path)?readFileSync(path,"utf8"):"";
const lines=previous.split("\n").filter(line=>!/^\s*CMS_DISCORD_WEBHOOK\s*=/.test(line));
mkdirSync("/etc/snappiestudio",{recursive:true,mode:0o750});
const temporary=path+"."+randomBytes(6).toString("hex")+".tmp";
try {
 writeFileSync(temporary,lines.filter(Boolean).join("\n")+"\nCMS_DISCORD_WEBHOOK="+canonical+"\n",{flag:"wx",mode:0o640});
 chownSync(temporary,0,Number(execFileSync("id",["-g","ubuntu"],{encoding:"utf8"}).trim()));
 renameSync(temporary,path);
} finally {rmSync(temporary,{force:true});}
console.log("Discord configured privately. The monitor uses it on the next run; no message was sent.");
'
unset discord_webhook
