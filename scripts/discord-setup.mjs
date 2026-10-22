import { readFileSync, chmodSync, chownSync, existsSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateBotConfig } from '../server/discord-bot.js';
import { writePrivateJson } from '../server/admin-account.js';
import { registerDiscordCommands } from '../server/discord-commands.js';

if (process.getuid() !== 0) { console.error('Run through sudo bash deploy/configure-discord-bot.sh'); process.exit(64); }
try {
  const [applicationId, publicKey, guildId, channelId, users, token] = readFileSync(0, 'utf8').trim().split('\n');
  const config = validateBotConfig({ applicationId, publicKey, guildId, channelId, allowedUserIds: users.split(',').map(value => value.trim()) });
  await registerDiscordCommands(config, token);
  const path = '/etc/snappiestudio/discord-bot.json';
  if (existsSync(path)) copyFileSync(path, path + '.previous');
  writePrivateJson(path, config);
  chownSync(path, 0, Number(execFileSync('id', ['-g', 'ubuntu'], { encoding: 'utf8' }).trim())); chmodSync(path, 0o640);
  console.log('Bot configuration saved privately. Bot token is not stored.');
  console.log('Commands registered. In Discord Developer Portal, set Interactions Endpoint URL to:');
  console.log('https://snappiestudio.com/api/discord/interactions');
  console.log('Only configured users, server and channel can run commands. No message was sent to the channel.');
} catch (error) {
  console.error(error.message.startsWith('Command registration') ? error.message + '. Check application installation and run setup again.' : 'Bot setup failed. Check IDs, public key, token and permissions. No credential was printed.');
  process.exitCode = 1;
}
