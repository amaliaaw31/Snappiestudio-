import { createWebsiteStatus } from './discord-status.js';
import { hostStatus, sslStatus, uptimeStatus } from './discord-host.js';
import { readState } from './cms-operations.js';
import { createBackupCommands } from './discord-backup.js';

export async function errorSummary(db, directory, now = Date.now) {
  const since = new Date(now() - 86400000).toISOString();
  let audit;
  try {
    const row = db.prepare("SELECT COUNT(*) AS count, MAX(at) AS latest FROM cms_audit WHERE event='login_failed' AND at >= ?").get(since);
    const latest = row.latest && Number.isFinite(Date.parse(row.latest)) ? new Date(row.latest).toISOString() : 'tidak ada';
    audit = `Login CMS gagal dalam 24 jam: ${row.count}; terakhir ${latest}`;
  } catch { audit = 'Ringkasan audit CMS: UNKNOWN'; }
  const jobs = await Promise.all([
    ['Monitor', 'monitor-status.json'], ['Backup', 'backup-status.json'], ['Scheduler migrasi', 'discord-scheduler-status.json'],
  ].map(async ([label, name]) => {
    try {
      const value = await readState(directory, name);
      const at = Date.parse(value?.checkedAt || value?.lastRun || value?.lastAttempt);
      const timestamp = Number.isFinite(at) ? new Date(at).toISOString() : 'UNKNOWN';
      return `${label}: ${value?.ok === true ? 'UP' : value?.ok === false ? 'DEGRADED' : 'UNKNOWN'}; catatan terakhir ${timestamp}`;
    } catch { return `${label}: UNKNOWN (catatan tidak dapat dibaca)`; }
  }));
  return `Ringkasan catatan yang diizinkan\n${audit}\n${jobs.join('\n')}\nStatus pekerjaan adalah catatan terakhir, bukan pemeriksaan baru. Log mentah dan journal sistem tidak dibaca.`;
}

export function createReadCommands({ db, directory, fetchImpl = fetch, now = Date.now }) {
  const website = createWebsiteStatus(fetchImpl);
  return {
    status: async () => `${await website()}\nBot: UP (handler menerima command ini; bukan status Gateway Discord).`,
    website: () => website(true),
    server: () => hostStatus(directory),
    ssl: () => sslStatus({ now }),
    logs: () => errorSummary(db, directory, now),
    uptime: () => uptimeStatus(),
    ...createBackupCommands({ directory, now }),
  };
}
