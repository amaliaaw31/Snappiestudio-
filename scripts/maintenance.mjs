import { DatabaseSync, backup } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, lstatSync, statSync, copyFileSync, cpSync, chmodSync, chownSync, renameSync, rmSync, existsSync, mkdtempSync, createWriteStream } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import { open as openGeoip } from 'maxmind';
import { writePrivateJson, validateAccount, decryptTotp, authenticator } from '../server/admin-account.js';

const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const files = ['visitors.sqlite', 'cms-account.json', 'cms-key.bin', 'counter.env', 'bootstrap-password.hash'];

function status(directory, name, changes) {
  const path = join(directory, name);
  let previous = {};
  try { previous = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  writePrivateJson(path, { ...previous, ...changes });
  if (process.getuid() === 0) chownSync(path, 0, statSync(directory).gid);
  chmodSync(path, 0o640);
}

export function verifyBackup(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1 || !manifest.files || !manifest.counts || !['visitors', 'visitor_activity', 'excluded_browsers'].every(name => Number.isSafeInteger(manifest.counts[name]) && manifest.counts[name] >= 0) || !['visitors.sqlite', 'cms-account.json', 'cms-key.bin'].every(name => name in manifest.files)) throw new Error('Invalid backup manifest');
  for (const name of readdirSync(directory)) {
    if (name !== 'manifest.json' && !files.includes(name)) throw new Error('Unexpected backup file');
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

export async function backupSite({ stateDirectory, backupDirectory, configurationDirectory = '/etc/snappiestudio', now = Date.now }) {
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const suffix = new Date(now()).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z-' + randomBytes(4).toString('hex');
  const staging = mkdtempSync(join(backupDirectory, '.pending-'));
  const restore = mkdtempSync(join(backupDirectory, '.restore-test-'));
  try {
    const source = new DatabaseSync(join(stateDirectory, 'visitors.sqlite'), { readOnly: true });
    try { await backup(source, join(staging, 'visitors.sqlite')); } finally { source.close(); }
    for (const name of ['cms-account.json', 'cms-key.bin']) copyFileSync(join(stateDirectory, name), join(staging, name));
    for (const [sourceName, target] of [['counter.env', 'counter.env'], ['cms-password.hash', 'bootstrap-password.hash']]) {
      const sourceFile = join(configurationDirectory, sourceName);
      if (existsSync(sourceFile)) copyFileSync(sourceFile, join(staging, target));
    }
    const db = new DatabaseSync(join(staging, 'visitors.sqlite'));
    db.exec('PRAGMA journal_mode=DELETE');
    const counts = {};
    try { for (const table of ['visitors', 'visitor_activity', 'excluded_browsers']) counts[table] = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count; }
    finally { db.close(); }
    const manifest = { format: 1, createdAt: new Date(now()).toISOString(), counts, files: {} };
    for (const name of readdirSync(staging)) {
      chmodSync(join(staging, name), 0o600);
      manifest.files[name] = hash(join(staging, name));
    }
    writePrivateJson(join(staging, 'manifest.json'), manifest);
    cpSync(staging, restore, { recursive: true });
    verifyBackup(restore);
    const target = join(backupDirectory, 'backup-' + suffix);
    renameSync(staging, target);
    const snapshots = readdirSync(backupDirectory).filter(name => /^backup-\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(name)).sort().reverse();
    for (const name of snapshots.slice(14)) rmSync(join(backupDirectory, name), { recursive: true });
    status(stateDirectory, 'backup-status.json', { ok: true, lastAttempt: manifest.createdAt, lastSuccess: manifest.createdAt,
      copies: Math.min(14, snapshots.length), retention: 14, restoreVerifiedAt: manifest.createdAt });
    return target;
  } catch (error) {
    status(stateDirectory, 'backup-status.json', { ok: false, lastAttempt: new Date(now()).toISOString() });
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(restore, { recursive: true, force: true });
  }
}

const capped = maximum => {
  let size = 0;
  return new Transform({ transform(chunk, _encoding, callback) {
    size += chunk.length;
    callback(size > maximum ? new Error('GeoIP download too large') : null, chunk);
  } });
};

export async function updateGeoip({ stateDirectory, geoPath, now = Date.now, fetchImpl = globalThis.fetch, reload } = {}) {
  mkdirSync(dirname(geoPath), { recursive: true, mode: 0o755 });
  const temporary = `${geoPath}.${randomBytes(8).toString('hex')}.tmp`;
  const previous = `${geoPath}.previous`;
  let replaced = false;
  const hadPrevious = existsSync(geoPath);
  try {
    const month = new Date(now()).toISOString().slice(0, 7);
    const response = await fetchImpl(`https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz`, { redirect: 'error', signal: AbortSignal.timeout(180000) });
    if (!response.ok || !response.body) throw new Error('GeoIP download unavailable');
    await pipeline(Readable.fromWeb(response.body), capped(128 * 1024 * 1024), createGunzip(), capped(256 * 1024 * 1024), createWriteStream(temporary, { flags: 'wx', mode: 0o644 }));
    const reader = await openGeoip(temporary);
    if (reader.metadata.databaseType !== 'DBIP-City-Lite' || !reader.get('8.8.8.8')?.country?.iso_code) throw new Error('Invalid GeoIP database');
    if (hadPrevious) copyFileSync(geoPath, previous);
    renameSync(temporary, geoPath);
    replaced = true;
    if (reload) await reload();
    const timestamp = new Date(now()).toISOString();
    status(stateDirectory, 'geoip-status.json', { ok: true, lastAttempt: timestamp, lastSuccess: timestamp, edition: month });
  } catch (error) {
    if (replaced) {
      if (hadPrevious) renameSync(previous, geoPath);
      else rmSync(geoPath, { force: true });
      if (reload) { try { await reload(); } catch {} }
    }
    status(stateDirectory, 'geoip-status.json', { ok: false, lastAttempt: new Date(now()).toISOString() });
    throw error;
  } finally { rmSync(temporary, { force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stateDirectory = dirname(process.env.VISITOR_DB_PATH || '/var/lib/snappiestudio-counter/visitors.sqlite');
  try {
    if (process.argv[2] === 'backup') {
      const directory = await backupSite({ stateDirectory, backupDirectory: process.env.CMS_BACKUP_DIRECTORY || '/var/lib/snappiestudio-backups' });
      console.log('Backup and restore verification completed:', basename(directory));
    } else if (process.argv[2] === 'verify-backup' && process.argv[3]) {
      const temporary = mkdtempSync(join(tmpdir(), 'snappie-restore-'));
      try {
        verifyBackup(process.argv[3]);
        cpSync(process.argv[3], temporary, { recursive: true });
        verifyBackup(temporary);
        console.log('Restore into temporary directory verified. Production data unchanged.');
      } finally { rmSync(temporary, { recursive: true, force: true }); }
    } else if (process.argv[2] === 'geoip') {
      await updateGeoip({ stateDirectory, geoPath: process.env.GEOIP_DB_PATH || join(stateDirectory, 'geo/dbip-city-lite.mmdb'), reload: async () => {
        const pid = Number(execFileSync('systemctl', ['show', 'snappiestudio-counter', '--property=MainPID', '--value'], { encoding: 'utf8' }).trim());
        if (!pid) throw new Error('Counter service not running');
        const start = Date.now();
        process.kill(pid, 'SIGHUP');
        for (let attempt = 0; attempt < 40; attempt++) {
          await delay(250);
          try {
            const runtime = JSON.parse(readFileSync(join(stateDirectory, 'geoip-runtime.json'), 'utf8'));
            if (Date.parse(runtime.loadedAt) >= start) return;
          } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        throw new Error('GeoIP reload not confirmed');
      } });
      console.log('GeoIP database validated, installed and reloaded.');
    } else throw new Error('Usage: maintenance.mjs backup | geoip | verify-backup DIRECTORY');
  } catch (error) {
    console.error('Maintenance failed:', error.code || error.name);
    process.exitCode = 1;
  }
}
