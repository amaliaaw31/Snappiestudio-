import { join, dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createAudit } from './cms-operations.js';
import { writePrivateJson } from './admin-account.js';
import { announcementFingerprint, baseAnnouncement, migrationSchema } from './discord-bot.js';
import { notificationDestination, sendDiscordText } from './notifications.js';

export async function runMigrationSchedule({ dbPath, env = process.env, now = Date.now, fetchImpl = fetch }) {
  const db = new DatabaseSync(dbPath); const directory = dirname(dbPath);
  let failures = 0;
  try {
    db.exec('PRAGMA busy_timeout=1000'); migrationSchema(db); const audit = createAudit(db, now);
    db.exec('BEGIN IMMEDIATE');
    try {
      const fingerprint = announcementFingerprint(baseAnnouncement(directory));
      const jobs = db.prepare("SELECT * FROM discord_migrations WHERE status IN ('scheduled','active')").all();
      for (const job of jobs) {
        let status = job.status;
        if (job.automatic && job.base_fingerprint !== fingerprint) status = 'superseded';
        else if (status === 'scheduled' && job.due_at <= now()) status = now() - job.due_at > 86400000 ? 'missed' : 'active';
        if (status !== job.status) {
          db.prepare('UPDATE discord_migrations SET status=? WHERE id=?').run(status, job.id);
          audit(status === 'active' ? 'discord_migration_started' : 'discord_migration_skipped');
        }
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    const jobs = db.prepare("SELECT * FROM discord_migrations WHERE status IN ('scheduled','active','missed','superseded') AND (reminder_sent=0 OR due_sent=0) ORDER BY CASE WHEN status IN ('scheduled','active') THEN 0 ELSE 1 END, created_at DESC LIMIT 4").all();
    for (const job of jobs) {
      const reminder = job.status === 'scheduled' && job.remind_at <= now() && now() < job.due_at && !job.reminder_sent;
      const due = job.status !== 'scheduled' && !job.due_sent;
      if (!reminder && !due) continue;
      const field = reminder ? 'reminder' : 'due';
      const claim = db.prepare(`UPDATE discord_migrations SET ${field}_lease=? WHERE id=? AND ${field}_sent=0 AND ${field}_lease <= ? AND status=?`)
        .run(now() + 60000, job.id, now(), job.status);
      if (!claim.changes) continue;
      try {
        const destination = notificationDestination(env);
        if (!destination || destination.channel !== 'discord') throw new Error('Discord reminder destination unavailable');
        const time = new Date(job.due_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
        const content = reminder ? `Snappie Studio: pengingat migrasi\n${job.title}\nJadwal ${time}\nID ${job.id}\nMigrasi data tetap perlu kamu kerjakan.`
          : job.status === 'active' ? `Snappie Studio: jadwal migrasi sudah tiba\n${job.title}\n${time}\n${job.automatic ? 'Pengumuman otomatis aktif selama belum diubah manual.' : 'Mode pengingat saja; pengumuman tidak diubah.'}\nSetelah selesai: /migrasi selesai id:${job.id}`
            : `Snappie Studio: jadwal ${job.id} tidak dijalankan\n${job.status === 'missed' ? 'Jadwal terlewat lebih dari 24 jam.' : 'Pengumuman sudah diubah manual.'}\nPengumuman lama tidak ditimpa. Atur jadwal baru jika masih diperlukan.`;
        await sendDiscordText(destination.url.href, content, fetchImpl);
        db.prepare(`UPDATE discord_migrations SET ${field}_sent=1, ${field}_lease=0 WHERE id=?`).run(job.id);
      } catch {
        failures++;
        db.prepare(`UPDATE discord_migrations SET ${field}_lease=0 WHERE id=?`).run(job.id);
      }
    }
    db.prepare("DELETE FROM discord_migrations WHERE status NOT IN ('scheduled','active') AND due_sent=1 AND created_at < ?").run(now() - 90 * 86400000);
    const status = { lastRun: new Date(now()).toISOString(), ok: failures === 0, failedDeliveries: failures,
      discordConfigured: !!(env.CMS_DISCORD_WEBHOOK || /^https:\/\/discord\.com\//.test(env.CMS_ALERT_WEBHOOK || '')),
      pending: db.prepare("SELECT COUNT(*) AS count FROM discord_migrations WHERE status IN ('scheduled','active')").get().count };
    writePrivateJson(join(directory, 'discord-scheduler-status.json'), status);
    return status;
  } finally { db.close(); }
}
