import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { validateAccount, decryptTotp, authenticator } from './admin-account.js';
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const files = ['visitors.sqlite', 'cms-account.json', 'cms-key.bin', 'counter.env', 'bootstrap-password.hash', 'site-content.json', 'discord-bot.json'];

export function verifyBackup(directory) {
  if (!lstatSync(directory).isDirectory() || !lstatSync(join(directory, 'manifest.json')).isFile()
    || lstatSync(join(directory, 'manifest.json')).size > 65536) throw new Error('Invalid backup manifest');
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1 || !manifest.files || !manifest.counts || !['visitors', 'visitor_activity', 'excluded_browsers'].every(name => Number.isSafeInteger(manifest.counts[name]) && manifest.counts[name] >= 0) || !['visitors.sqlite', 'cms-account.json', 'cms-key.bin'].every(name => name in manifest.files)) throw new Error('Invalid backup manifest');
  for (const name of readdirSync(directory)) {
    if (name !== 'manifest.json' && (!files.includes(name) || !(name in manifest.files))) throw new Error('Unexpected backup file');
    if (!lstatSync(join(directory, name)).isFile()) throw new Error('Backup must contain regular files only');
  }
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (!files.includes(name) || hash(join(directory, name)) !== expected) throw new Error('Backup checksum mismatch');
  }
  const account = validateAccount(JSON.parse(readFileSync(join(directory, 'cms-account.json'), 'utf8')));
  const key = readFileSync(join(directory, 'cms-key.bin'));
  if (key.length !== 32) throw new Error('Invalid backup encryption key');
  if (account.totp) authenticator(decryptTotp(account.totp, key), account.username);
  const db = new DatabaseSync(join(directory, 'visitors.sqlite'), { readOnly: true });
  try {
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Backup integrity check failed');
    for (const [table, count] of Object.entries(manifest.counts)) {
      if (!['visitors', 'visitor_activity', 'excluded_browsers'].includes(table)
        || db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count !== count) throw new Error('Restored row count mismatch');
    }
  } finally { db.close(); }
  return manifest;
}

