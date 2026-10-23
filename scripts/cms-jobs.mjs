import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, readFileSync, writeFileSync, appendFileSync, statSync, statfsSync, mkdtempSync, rmSync, renameSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { runMigrationSchedule } from '../server/discord-scheduler.js';
import { sendNotification } from '../server/notifications.js';
import { createAnalytics, reportFilters } from '../server/analytics.js';
import { createAudit, readState } from '../server/cms-operations.js';
import { writePrivateJson } from '../server/admin-account.js';
import { verifyBackup } from '../server/backup-verifier.js';
import { backupIsLate } from '../server/backup-health.js';
const run = promisify(execFile);

export async function encryptArchive(source, target, key) {
  if (key.length !== 32) throw new Error('Backup key must contain 32 bytes');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  writeFileSync(target, Buffer.concat([Buffer.from('SNAP1'), iv]), { flag: 'wx', mode: 0o600 });
  await pipeline(createReadStream(source), cipher, createWriteStream(target, { flags: 'a', mode: 0o600 }));
  appendFileSync(target, cipher.getAuthTag());
}

export async function decryptArchive(source, target, key) {
  const size = statSync(source).size;
  const header = Buffer.alloc(17), tag = Buffer.alloc(16);
  const { open } = await import('node:fs/promises');
  const file = await open(source);
  try { await file.read(header, 0, 17, 0); await file.read(tag, 0, 16, size - 16); } finally { await file.close(); }
  if (size < 34 || header.subarray(0, 5).toString() !== 'SNAP1' || key.length !== 32) throw new Error('Invalid encrypted backup');
  const temporary = target + '.' + randomBytes(6).toString('hex') + '.tmp';
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(5)); decipher.setAuthTag(tag);
    await pipeline(createReadStream(source, { start: 17, end: size - 17 }), decipher, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
    // Reserve the destination before publishing authenticated plaintext.
    writeFileSync(target, '', { flag: 'wx', mode: 0o600 });
    renameSync(temporary, target);
  } finally { rmSync(temporary, { force: true }); }
}

export async function uploadOffsite(snapshot, stateDirectory, env = process.env, execute = run) {
  if (!env.CMS_OFFSITE_DESTINATION) {
    writePrivateJson(join(stateDirectory, 'offsite-status.json'), { configured: false, ok: null }); return;
  }
  const destination = env.CMS_OFFSITE_DESTINATION;
  const temporary = mkdtempSync(join(tmpdir(), 'snappie-offsite-'));
  try {
    if (!/^[a-z_][a-z0-9_-]*@[a-zA-Z0-9.-]+:\/[a-zA-Z0-9/_-]+$/.test(destination)) throw new Error('Invalid SFTP backup destination');
    verifyBackup(snapshot);
    const archive = join(temporary, 'snapshot.tar');
    await execute('tar', ['-cf', archive, '-C', snapshot, '.'], { timeout: 60000 });
    const encrypted = join(temporary, basename(snapshot) + '.tar.enc');
    await encryptArchive(archive, encrypted, readFileSync(env.CMS_BACKUP_KEY_FILE));
    await execute('scp', ['-B', '-oBatchMode=yes', '-oStrictHostKeyChecking=yes', '-i', env.CMS_OFFSITE_SSH_KEY,
      encrypted, destination.replace(/\/$/, '') + '/' + basename(encrypted)], { timeout: 120000 });
    writePrivateJson(join(stateDirectory, 'offsite-status.json'), { configured: true, ok: true, lastSuccess: new Date().toISOString() });
  } catch (error) {
    const previous = await readState(stateDirectory, 'offsite-status.json', {});
    writePrivateJson(join(stateDirectory, 'offsite-status.json'), { ...previous, configured: true, ok: false, lastAttempt: new Date().toISOString() });
    throw error;
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

export function generateReports(dbPath, now = Date.now) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA busy_timeout=5000'); createAudit(db, now);
    const analytics = createAnalytics(db, now);
    const today = new Date(now() + 7 * 3600000); today.setUTCHours(0, 0, 0, 0);
    const monday = new Date(today); monday.setUTCDate(today.getUTCDate() - (today.getUTCDay() + 6) % 7);
    const lastMonday = new Date(monday); lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
    const first = new Date(today); first.setUTCDate(1);
    const lastFirst = new Date(first); lastFirst.setUTCMonth(lastFirst.getUTCMonth() - 1);
    const iso = date => date.toISOString().slice(0, 10);
    const yesterday = date => iso(new Date(date.getTime() - 86400000));
    for (const [type, from, to] of [['mingguan', iso(lastMonday), yesterday(monday)], ['bulanan', iso(lastFirst), yesterday(first)]]) {
      const period = type + '-' + from;
      if (db.prepare('SELECT 1 FROM cms_reports WHERE period=?').get(period)) continue;
      const filters = reportFilters(new URLSearchParams({ from, to }));
      const data = { type, from, to, comparison: analytics.comparison(filters), locations: analytics.locations(filters), insights: analytics.insights(filters), charts: analytics.charts(filters) };
      db.prepare('INSERT INTO cms_reports VALUES (?,?,?)').run(period, new Date(now()).toISOString(), JSON.stringify(data));
    }
    db.exec('DELETE FROM cms_reports WHERE period NOT IN (SELECT period FROM cms_reports ORDER BY generated_at DESC, period DESC LIMIT 104)');
  } finally { db.close(); }
}

export async function checkMonitor(stateDirectory, env = process.env, fetchImpl = fetch, now = Date.now, serviceCheck = () => execFileSync('systemctl', ['is-active', '--quiet', 'snappiestudio-counter'], { stdio: 'ignore' }), { diskCheck = statfsSync, backupDirectory = env.CMS_BACKUP_DIRECTORY || '/var/lib/snappiestudio-backups' } = {}) {
  const issues = [];
  try {
    const response = await fetchImpl('https://snappiestudio.com/', { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) issues.push('website'); await response.body?.cancel();
  } catch { issues.push('website'); }
  try {
    const db = new DatabaseSync(join(stateDirectory, 'visitors.sqlite'), { readOnly: true });
    try { if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') issues.push('database'); } finally { db.close(); }
    serviceCheck();
  } catch { issues.push('backend'); }
  const safeRead = async name => {
    try {
      const value = await readState(stateDirectory, name, {});
      return value && typeof value === 'object' && !Array.isArray(value) ? value : { ok: false, invalid: true };
    } catch { return { ok: false, invalid: true }; }
  };
  try {
    const disk = diskCheck(stateDirectory);
    if (Number(disk.bavail) / Number(disk.blocks) < .1) issues.push('storage');
  } catch { issues.push('storage'); }
  try {
    let disk;
    try { disk = diskCheck(backupDirectory); } catch (error) { if (error.code !== 'ENOENT') throw error; disk = diskCheck(dirname(backupDirectory)); }
    if (!(Number(disk.blocks) > 0) || Number(disk.bavail) / Number(disk.blocks) < .1) issues.push('backup_storage');
  } catch { issues.push('backup_storage'); }
  const backup = await safeRead('backup-status.json');
  const success = Date.parse(backup.lastSuccess);
  const verified = Date.parse(backup.restoreVerifiedAt);
  if (backup.ok === false) issues.push('backup_failed');
  if (backupIsLate(backup.lastSuccess, now())) issues.push('backup_late');
  const verification = await safeRead('backup-verification-status.json');
  if (backup.invalid || (Number.isFinite(success) && (!Number.isFinite(verified) || verified < success))
    || verification.invalid || verification.state === 'DEGRADED' || verification.failedSnapshots?.length) issues.push('backup_integrity');
  const geoip = await safeRead('geoip-status.json');
  if (!geoip.lastSuccess || geoip.ok === false || !Number.isFinite(Date.parse(geoip.lastSuccess)) || now() - Date.parse(geoip.lastSuccess) > 45 * 86400000) issues.push('geoip');
  const offsite = await safeRead('offsite-status.json');
  if (offsite.configured && offsite.ok === false) issues.push('offsite');
  const previous = await safeRead('monitor-status.json');
  const state = { checkedAt: new Date(now()).toISOString(), ok: !issues.length, issues, notificationsConfigured: !!(env.CMS_DISCORD_WEBHOOK || env.CMS_ALERT_WEBHOOK), notificationChannel: env.CMS_DISCORD_WEBHOOK || /^https:\/\/discord\.com\//.test(env.CMS_ALERT_WEBHOOK || '') ? 'discord' : env.CMS_ALERT_WEBHOOK ? 'webhook' : null, notifiedState: previous.notifiedState ?? null, notificationOk: previous.notificationOk ?? null,
    lastNotificationAttemptAt: previous.lastNotificationAttemptAt ?? null, lastAttemptState: previous.lastAttemptState ?? null };
  const signature = issues.join(',') || 'recovered';
  const elapsed = now() - Date.parse(state.lastNotificationAttemptAt);
  const cooledDown = !Number.isFinite(elapsed) || elapsed >= 15 * 60000;
  const firstRecovery = !issues.length && previous.notifiedState && previous.notifiedState !== 'recovered' && previous.lastAttemptState !== 'recovered';
  if (state.notificationsConfigured && signature !== state.notifiedState && (issues.length || previous.notifiedState) && (cooledDown || firstRecovery)) {
    state.lastNotificationAttemptAt = state.checkedAt; state.lastAttemptState = signature;
    writePrivateJson(join(stateDirectory, 'monitor-status.json'), state);
    try {
      await sendNotification(env, issues, state.checkedAt, fetchImpl);
      state.notifiedState = signature; state.notificationOk = true;
    } catch { state.notificationOk = false; }
  }
  writePrivateJson(join(stateDirectory, 'monitor-status.json'), state);
  return state;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dbPath = process.env.VISITOR_DB_PATH || '/var/lib/snappiestudio-counter/visitors.sqlite';
  try {
    if (process.argv[2] === 'reports') { generateReports(dbPath); console.log('Weekly and monthly reports generated.'); }
    else if (process.argv[2] === 'migrations') { const state = await runMigrationSchedule({ dbPath }); console.log(state.ok ? 'Discord migration schedule checked.' : 'Discord migration schedule checked; some reminders need retry.'); }
    else if (process.argv[2] === 'monitor') { const state = await checkMonitor(dirname(dbPath)); console.log(state.ok ? 'All monitored services healthy.' : 'Issues detected: ' + state.issues.join(', ')); }
    else if (process.argv[2] === 'offsite' && process.argv[3]) await uploadOffsite(process.argv[3], dirname(dbPath));
    else if (process.argv[2] === 'decrypt' && process.argv[3] && process.argv[4]) await decryptArchive(process.argv[3], process.argv[4], readFileSync(process.env.CMS_BACKUP_KEY_FILE));
    else throw new Error('Usage: cms-jobs.mjs reports | monitor | migrations | offsite SNAPSHOT | decrypt SOURCE OUTPUT_TAR');
  } catch (error) { console.error('CMS job failed:', error.code || error.name); process.exitCode = 1; }
}
