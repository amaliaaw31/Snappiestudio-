import { readdir, lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readState } from './cms-operations.js';
import { writePrivateJson } from './admin-account.js';
import { discordWebhook, sendDiscordText } from './notifications.js';
import { backupIsLate } from './backup-health.js';

const execute = promisify(execFile);
const snapshotName = /^backup-\d{8}T\d{6}Z-[a-f0-9]{8}$/;
const iso = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : 'UNKNOWN';
const cooldown = 15 * 60000;

export async function listSnapshots(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return entries.filter(entry => snapshotName.test(entry.name) && entry.isDirectory()).map(entry => entry.name).sort().reverse();
}

async function snapshotSize(directory, name) {
  const path = join(directory, name);
  if (!(await lstat(path)).isDirectory()) throw new Error('Invalid snapshot');
  let bytes = 0;
  for (const entry of await readdir(path)) {
    const value = await lstat(join(path, entry));
    if (!value.isFile()) throw new Error('Invalid snapshot file');
    bytes += value.size;
  }
  return bytes;
}

export async function verifySnapshot(directory, name, run = execute) {
  if (!snapshotName.test(name || '')) return 'UNKNOWN';
  try {
    const { stdout } = await run(process.execPath, [fileURLToPath(new URL('./verify-backup-worker.js', import.meta.url)), join(directory, name)], {
      timeout: 1500, maxBuffer: 1024, env: { PATH: '/usr/bin:/bin', NODE_NO_WARNINGS: '1' },
    });
    const result = JSON.parse(stdout);
    return ['UP', 'DEGRADED', 'UNKNOWN'].includes(result.state) ? result.state : 'UNKNOWN';
  } catch { return 'UNKNOWN'; }
}

export async function loadAlertEnvironment(path = '/etc/snappiestudio/maintenance.env') {
  const text = await readFile(path, 'utf8');
  const matches = [...text.matchAll(/^\s*CMS_DISCORD_WEBHOOK\s*=\s*(.*?)\s*$/gm)];
  if (matches.length !== 1) throw new Error('Discord destination unavailable');
  let value = matches[0][1];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  return { CMS_DISCORD_WEBHOOK: discordWebhook(value).href };
}

export function createBackupCommands({ directory, backupDirectory = process.env.CMS_BACKUP_DIRECTORY || '/var/lib/snappiestudio-backups', now = Date.now,
  verify = verifySnapshot, getAlertEnvironment = loadAlertEnvironment, fetchImpl = fetch }) {
  let verifying = false, alertBusy = false;
  const pending = new Map();
  const once = async (interaction, operation) => {
    if (pending.has(interaction.id)) return pending.get(interaction.id);
    const promise = Promise.resolve().then(operation); pending.set(interaction.id, promise);
    try { return await promise; } finally { pending.delete(interaction.id); }
  };
  return {
    backup: interaction => once(interaction, async () => {
      const sub = interaction.data?.options?.[0];
      if (!['status', 'history', 'verify'].includes(sub?.name)) return 'Gunakan /backup status, /backup history, atau /backup verify.';
      try {
        const snapshots = await listSnapshots(backupDirectory);
        if (sub.name === 'history') {
          if (!snapshots.length) return 'Backup: UNKNOWN. Belum ada snapshot lokal yang tersedia.';
          const rows = await Promise.all(snapshots.slice(0, 10).map(async name => {
            try { return `${name}: ${await snapshotSize(backupDirectory, name)} byte; integritas belum diperiksa oleh history`; }
            catch { return `${name}: metadata UNKNOWN`; }
          }));
          return `Riwayat backup lokal (maksimal 10 dari ${snapshots.length})\n${rows.join('\n')}\nLokasi: penyimpanan lokal VPS. Tidak ada snapshot yang dihapus.`;
        }
        if (sub.name === 'status') {
          const status = await readState(directory, 'backup-status.json', {});
          const monitor = await readState(directory, 'monitor-status.json', {});
          const verification = await readState(directory, 'backup-verification-status.json', {});
          const success = Date.parse(status.lastSuccess);
          const state = !snapshots.length || status.ok === false || verification.state === 'DEGRADED' || verification.failedSnapshots?.length || !Number.isFinite(Date.parse(status.restoreVerifiedAt)) || Date.parse(status.restoreVerifiedAt) < success || backupIsLate(status.lastSuccess, now()) ? 'DEGRADED' : status.ok === true ? 'UP' : 'UNKNOWN';
          let size = 'UNKNOWN';
          if (snapshots[0]) { try { size = `${await snapshotSize(backupDirectory, snapshots[0])} byte`; } catch {} }
          return `Backup: ${state}\nTerakhir berhasil: ${iso(status.lastSuccess)}\nVerifikasi saat backup: ${iso(status.restoreVerifiedAt)}\nSnapshot lokal: ${snapshots.length}; terbaru ${snapshots[0] || 'tidak ada'}\nUkuran terbaru: ${size}\nVerifikasi manual terakhir: ${['UP', 'DEGRADED', 'UNKNOWN'].includes(verification.state) ? verification.state : 'UNKNOWN'}\nPengiriman alert monitor: ${monitor.notificationOk === true ? 'UP' : monitor.notificationOk === false ? 'DEGRADED' : 'UNKNOWN'}\nLokasi: penyimpanan lokal VPS. Keberadaan file tidak membuktikan integritas. Waktu UTC.`;
        }
        const requested = sub.options?.find(option => option.name === 'snapshot')?.value;
        if (requested !== undefined && (typeof requested !== 'string' || !snapshotName.test(requested))) return 'ID snapshot tidak valid. Pilih ID dari /backup history.';
        const name = requested || snapshots[0];
        if (!name || !snapshots.includes(name)) return 'Snapshot tidak ditemukan. Lihat /backup history.';
        if (verifying) return 'Verifikasi lain sedang berjalan. Coba lagi setelah selesai.';
        verifying = true;
        try {
          const result = await verify(backupDirectory, name);
          const state = ['UP', 'DEGRADED', 'UNKNOWN'].includes(result) ? result : 'UNKNOWN';
          const previous = await readState(directory, 'backup-verification-status.json', {});
          const failures = (Array.isArray(previous.failedSnapshots) ? previous.failedSnapshots : []).filter(value => typeof value === 'string' && snapshotName.test(value) && value !== name);
          if (state === 'DEGRADED' || (state === 'UNKNOWN' && previous.failedSnapshots?.includes(name))) failures.push(name);
          writePrivateJson(join(directory, 'backup-verification-status.json'), { state, snapshot: name, checkedAt: new Date(now()).toISOString(), failedSnapshots: failures });
          return `Verifikasi ${name}: ${state}\n${state === 'UP' ? 'Checksum, integritas SQLite, akun, dan key lolos pemeriksaan.' : state === 'DEGRADED' ? 'Integritas tidak lolos. Snapshot sumber tidak diubah.' : 'Verifikasi belum selesai atau sumber tidak dapat dibaca dalam batas 1,5 detik. Belum dinyatakan valid.'}\nTidak ada backup baru atau restore produksi yang dijalankan.`;
        } finally { verifying = false; }
      } catch { return 'Backup: UNKNOWN. Metadata atau hasil pemeriksaan tidak dapat dibaca. Tidak ada sumber yang diubah.'; }
    }),
    alert: interaction => once(interaction, async () => {
      const sub = interaction.data?.options?.[0];
      if (sub?.name !== 'test' || sub.options?.find(option => option.name === 'konfirmasi')?.value !== true) return 'Untuk mengirim satu pesan uji ke kanal notifikasi yang dikonfigurasi, gunakan /alert test konfirmasi:True.';
      if (alertBusy) return 'Pengiriman uji sedang berjalan. Tidak ada pesan tambahan yang dikirim.';
      alertBusy = true;
      try {
        const previous = await readState(directory, 'alert-test-status.json', {});
        const elapsed = now() - Date.parse(previous.lastAttempt);
        if (Number.isFinite(elapsed) && elapsed < cooldown) return 'Cooldown uji alert 15 menit masih berlaku. Tidak ada pesan tambahan yang dikirim.';
        const env = await getAlertEnvironment();
        const webhook = discordWebhook(env.CMS_DISCORD_WEBHOOK).href;
        writePrivateJson(join(directory, 'alert-test-status.json'), { lastAttempt: new Date(now()).toISOString(), ok: null });
        try {
          await sendDiscordText(webhook, 'Snappie Studio: pesan uji notifikasi yang diminta admin.', (url, options) => fetchImpl(url, { ...options, signal: AbortSignal.any([options.signal, AbortSignal.timeout(1200)]) }));
          writePrivateJson(join(directory, 'alert-test-status.json'), { lastAttempt: new Date(now()).toISOString(), ok: true });
          return 'Pesan uji sudah dikonfirmasi Discord pada tujuan notifikasi yang dikonfigurasi.';
        } catch {
          writePrivateJson(join(directory, 'alert-test-status.json'), { lastAttempt: new Date(now()).toISOString(), ok: false });
          return 'Pengiriman uji gagal atau belum dikonfirmasi. Tidak dianggap terkirim; cooldown 15 menit tetap berlaku.';
        }
      } catch { return 'Uji alert tidak tersedia. Konfigurasi atau status lokal tidak dapat dibaca; tidak ada credential yang ditampilkan.'; }
      finally { alertBusy = false; }
    }),
  };
}
