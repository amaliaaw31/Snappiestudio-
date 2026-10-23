import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentResponse, saveContent, validateContent } from './cms-operations.js';
import { json } from './security.js';
import { createReadCommands } from './discord-read-commands.js';

const snowflake = value => typeof value === 'string' && /^\d{15,22}$/.test(value);
const DAY = 86400000;
const reply = content => ({ type: 4, data: { content, flags: 0, allowed_mentions: { parse: [] } } });
const bad = message => Object.assign(new Error(message), { status: 400 });

export function validateBotConfig(value) {
  if (!value || !['applicationId', 'guildId', 'channelId'].every(name => snowflake(value[name]))
    || typeof value.publicKey !== 'string' || !/^[a-fA-F0-9]{64}$/.test(value.publicKey)
    || !Array.isArray(value.allowedUserIds) || !value.allowedUserIds.length || value.allowedUserIds.length > 20 || !value.allowedUserIds.every(snowflake)) {
    throw new Error('Invalid Discord bot configuration');
  }
  return { applicationId: value.applicationId, guildId: value.guildId, channelId: value.channelId,
    publicKey: value.publicKey.toLowerCase(), allowedUserIds: [...new Set(value.allowedUserIds)] };
}

export function loadBotConfig(path = '/etc/snappiestudio/discord-bot.json') {
  try { return validateBotConfig(JSON.parse(readFileSync(path, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function migrationSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS discord_migrations (
    id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, due_at INTEGER NOT NULL, remind_at INTEGER NOT NULL,
    title TEXT NOT NULL, message TEXT NOT NULL, automatic INTEGER NOT NULL, base_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled', reminder_sent INTEGER NOT NULL DEFAULT 0,
    due_sent INTEGER NOT NULL DEFAULT 0, reminder_lease INTEGER NOT NULL DEFAULT 0, due_lease INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX IF NOT EXISTS discord_one_pending ON discord_migrations((1)) WHERE status IN ('scheduled','active');
  CREATE TABLE IF NOT EXISTS discord_interactions (id TEXT PRIMARY KEY, received_at INTEGER NOT NULL, response TEXT NOT NULL);`);
}

export function baseAnnouncement(directory) {
  try { return JSON.parse(readFileSync(join(directory, 'site-content.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { enabled: false, title: '', message: '' }; throw error; }
}
export const announcementFingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function effectiveAnnouncement(db, directory) {
  const base = await contentResponse(directory);
  const job = db.prepare("SELECT * FROM discord_migrations WHERE status='active' AND automatic=1 LIMIT 1").get();
  if (job && job.base_fingerprint === announcementFingerprint(base)) {
    return { enabled: true, title: job.title, message: job.message, updatedAt: new Date(job.due_at).toISOString() };
  }
  return base;
}

export function parseMigrationTime(value, now) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) throw bad('Gunakan waktu YYYY-MM-DD HH:mm dalam WIB.');
  const time = Date.parse(value.replace(' ', 'T') + ':00+07:00');
  if (!Number.isFinite(time) || new Date(time + 7 * 3600000).toISOString().slice(0, 16) !== value.replace(' ', 'T')) throw bad('Tanggal atau jam tidak valid.');
  if (time < now + 60000 || time > now + 365 * DAY) throw bad('Jadwal harus minimal satu menit dan maksimal 365 hari dari sekarang.');
  return time;
}

export function migrationList(db) {
  return db.prepare(`SELECT id, created_at, due_at, remind_at, title, message, automatic, status, reminder_sent, due_sent
    FROM discord_migrations ORDER BY created_at DESC LIMIT 20`).all();
}

function command(db, directory, interaction, now, audit) {
  const sub = interaction.data?.options?.[0];
  const options = new Map((sub?.options || []).map(option => [option.name, option.value]));
  if (interaction.data?.name === 'pengumuman') {
    if (sub?.name === 'status') {
      const current = baseAnnouncement(directory);
      const job = db.prepare("SELECT * FROM discord_migrations WHERE status='active' AND automatic=1").get();
      const automatic = job && job.base_fingerprint === announcementFingerprint(current);
      return reply(automatic ? `Pengumuman otomatis aktif: ${job.title}\n${job.message}` : current.enabled ? `Pengumuman aktif: ${current.title}\n${current.message}` : 'Pengumuman website sedang nonaktif.');
    }
    if (sub?.name === 'pasang' || sub?.name === 'hapus') {
      const value = sub.name === 'pasang' ? { enabled: true, title: options.get('judul') || 'Pengumuman', message: options.get('pesan') } : { enabled: false, title: '', message: '' };
      saveContent(directory, value, () => now);
      audit(sub.name === 'pasang' ? 'discord_notice_published' : 'discord_notice_hidden');
      return reply(sub.name === 'pasang' ? 'Pengumuman sudah tersimpan. Terlihat saat pengunjung membuka atau memuat ulang website.' : 'Pengumuman disembunyikan. Jadwal yang memakai pengumuman lama tidak akan menimpanya.');
    }
  }
  if (interaction.data?.name === 'migrasi') {
    if (sub?.name === 'status') {
      const jobs = migrationList(db).slice(0, 5);
      return reply(jobs.length ? jobs.map(job => `${job.id}: ${job.status}\n${new Date(job.due_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB; otomatis ${job.automatic ? 'ya' : 'tidak'}; pengingat ${job.reminder_sent ? 'terkirim' : 'belum terkirim'}`).join('\n\n') : 'Belum ada jadwal migrasi.');
    }
    if (sub?.name === 'jadwalkan') {
      const due = parseMigrationTime(options.get('waktu'), now);
      const minutes = options.get('pengingat_menit') ?? 60;
      const automatic = options.get('otomatis') ?? true;
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080 || typeof automatic !== 'boolean') throw bad('Pengingat harus 1–10080 menit; otomatis harus ya atau tidak.');
      const content = validateContent({ enabled: true, title: options.get('judul') || 'Migrasi server', message: options.get('pesan') });
      if (db.prepare("SELECT 1 FROM discord_migrations WHERE status IN ('scheduled','active')").get()) throw bad('Masih ada jadwal aktif. Selesaikan atau batalkan jadwal itu dahulu.');
      const id = randomBytes(6).toString('hex');
      db.prepare(`INSERT INTO discord_migrations(id,created_at,due_at,remind_at,title,message,automatic,base_fingerprint)
        VALUES (?,?,?,?,?,?,?,?)`).run(id, now, due, Math.max(now, due - minutes * 60000), content.title, content.message, Number(automatic), announcementFingerprint(baseAnnouncement(directory)));
      audit('discord_migration_scheduled');
      return reply(`Jadwal tersimpan: ${id}\n${options.get('waktu')} WIB. Pengingat ${minutes} menit sebelumnya${automatic ? '; pengumuman otomatis saat waktunya tiba' : '; tanpa pengumuman otomatis'}.\nBot mengingatkan jadwal; migrasi data tetap kamu kerjakan. Gunakan /migrasi selesai id:${id} setelah selesai.`);
    }
    if (sub?.name === 'selesai' || sub?.name === 'batal') {
      const id = options.get('id');
      if (typeof id !== 'string' || !/^[a-f0-9]{12}$/.test(id)) throw bad('ID jadwal tidak valid. Lihat /migrasi status.');
      const status = sub.name === 'selesai' ? 'done' : 'cancelled';
      const result = db.prepare("UPDATE discord_migrations SET status=? WHERE id=? AND status IN ('scheduled','active')").run(status, id);
      if (!result.changes) throw bad('Jadwal tidak ditemukan atau sudah ditutup.');
      audit(sub.name === 'selesai' ? 'discord_migration_done' : 'discord_migration_cancelled');
      return reply(`Jadwal ${id} ${sub.name === 'selesai' ? 'selesai' : 'dibatalkan'}. Pengumuman otomatis jadwal ini dihentikan; pengumuman manual tetap dipertahankan.`);
    }
  }
  throw bad('Perintah tidak dikenal. Gunakan /status, /pengumuman, atau /migrasi.');
}

export async function receiveDiscord(request, response, { db, directory, configPath, now = Date.now, audit = () => {}, readCommands }) {
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); json(response, 405, { error: 'Method not allowed' }); return; }
  let config;
  try { config = loadBotConfig(configPath); } catch { json(response, 503, { error: 'Bot unavailable' }); return; }
  if (!config) { json(response, 503, { error: 'Bot not configured' }); return; }
  const signature = request.headers['x-signature-ed25519'];
  const timestamp = request.headers['x-signature-timestamp'];
  if (typeof signature !== 'string' || !/^[a-fA-F0-9]{128}$/.test(signature) || typeof timestamp !== 'string'
    || !/^\d{10}$/.test(timestamp) || Math.abs(now() - Number(timestamp) * 1000) > 300000) {
    json(response, 401, { error: 'Invalid signature' }); return;
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) { json(response, 415, { error: 'JSON required' }); return; }
  if (Number(request.headers['content-length']) > 16384) { json(response, 413, { error: 'Request too large' }); return; }
  let length = 0; const chunks = [];
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    length += chunk.length; if (length > 16384) { json(response, 413, { error: 'Request too large' }); return; } chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(config.publicKey, 'hex')]), format: 'der', type: 'spki' });
  if (!verify(null, Buffer.concat([Buffer.from(timestamp), raw]), key, Buffer.from(signature, 'hex'))) { json(response, 401, { error: 'Invalid signature' }); return; }
  let interaction;
  try { interaction = JSON.parse(raw.toString('utf8')); } catch { json(response, 400, { error: 'Invalid JSON' }); return; }
  if (interaction?.type === 1) { json(response, 200, { type: 1 }); return; }
  const user = interaction?.member?.user?.id;
  if (interaction?.type !== 2 || interaction.application_id !== config.applicationId || interaction.guild_id !== config.guildId
    || interaction.channel_id !== config.channelId || !config.allowedUserIds.includes(user) || interaction.member?.user?.bot || !snowflake(interaction.id)) {
    json(response, 200, reply('Akun, server, atau kanal ini tidak diizinkan memakai bot Snappie.')); return;
  }
  const cached = db.prepare('SELECT response FROM discord_interactions WHERE id=?').get(interaction.id);
  if (cached) { json(response, 200, JSON.parse(cached.response)); return; }
  const checks = readCommands || createReadCommands({ db, directory, now });
  const name = interaction.data?.name;
  let status = null;
  if (Object.hasOwn(checks, name)) {
    try { status = reply(await checks[name](interaction)); }
    catch { status = reply('Pemeriksaan: UNKNOWN. Data tidak dapat diperiksa; tidak ada tindakan layanan yang dijalankan.'); }
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const previous = db.prepare('SELECT response FROM discord_interactions WHERE id=?').get(interaction.id);
    if (previous) { db.exec('COMMIT'); json(response, 200, JSON.parse(previous.response)); return; }
    let value;
    try { value = status || command(db, directory, interaction, now(), audit); }
    catch (error) { if (error.status !== 400) throw error; value = reply(error.message); }
    db.prepare('INSERT INTO discord_interactions VALUES (?,?,?)').run(interaction.id, now(), JSON.stringify(value));
    db.prepare('DELETE FROM discord_interactions WHERE received_at < ? OR id NOT IN (SELECT id FROM discord_interactions ORDER BY received_at DESC LIMIT 10000)').run(now() - 600000);
    db.exec('COMMIT'); json(response, 200, value);
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
