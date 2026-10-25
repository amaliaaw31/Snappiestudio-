import { readFileSync, chmodSync, chownSync, existsSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateBotConfig, loadBotConfig } from '../server/discord-bot.js';
import { writePrivateJson } from '../server/admin-account.js';
import { registerDiscordCommands, phaseOneCommands, phaseTwoCommands, phaseThreeCommands } from '../server/discord-commands.js';

if (process.getuid() !== 0) { console.error('Run through sudo bash deploy/configure-discord-bot.sh'); process.exit(64); }
try {
  const mode = process.argv[2];
  if (mode) {
    if (!['--plan-phase1', '--register-phase1', '--plan-phase2', '--register-phase2', '--plan-phase3', '--register-phase3'].includes(mode) || process.argv.length !== 3) throw new Error('Invalid setup mode');
    const config = loadBotConfig();
    if (!config) throw new Error('Bot configuration missing');
    const token = readFileSync(0, 'utf8').trim();
    const plan = await registerDiscordCommands(config, token, fetch, { names: mode.endsWith('phase3') ? phaseThreeCommands : mode.endsWith('phase2') ? phaseTwoCommands : phaseOneCommands, dryRun: mode.startsWith('--plan-') });
    console.log(JSON.stringify(plan));
    console.log(mode.startsWith('--plan-') ? 'Read-only plan. No command or server configuration was changed.' : 'Selected commands synchronized. Server configuration was not changed.');
    process.exit(0);
  }
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
