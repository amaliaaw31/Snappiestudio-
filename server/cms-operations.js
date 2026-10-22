import { statSync, statfsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { writePrivateJson } from './admin-account.js';

export function createAudit(db, now = Date.now) {
  db.exec(`CREATE TABLE IF NOT EXISTS cms_audit (id INTEGER PRIMARY KEY, at TEXT NOT NULL, event TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cms_reports (period TEXT PRIMARY KEY, generated_at TEXT NOT NULL, data TEXT NOT NULL);`);
  const insert = db.prepare('INSERT INTO cms_audit(at,event) VALUES (?,?)');
  return event => {
    insert.run(new Date(now()).toISOString(), event);
    db.prepare('DELETE FROM cms_audit WHERE id NOT IN (SELECT id FROM cms_audit ORDER BY id DESC LIMIT 10000) OR at < ?')
      .run(new Date(now() - 90 * 86400000).toISOString());
  };
}

export async function readState(directory, name, fallback = null) {
  try { return JSON.parse(await readFile(join(directory, name), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

export function validateContent(body) {
  if (typeof body.enabled !== 'boolean' || typeof body.title !== 'string' || typeof body.message !== 'string'
    || body.title.length > 80 || body.message.length > 500 || (body.enabled && !body.message.trim())) {
    throw Object.assign(new Error('Judul maksimal 80 karakter; pesan wajib diisi jika aktif, maksimal 500 karakter.'), { status: 400 });
  }
  return { enabled: body.enabled, title: body.title.trim(), message: body.message.trim() };
}

export function serviceStatus(db, dbPath, now = Date.now) {
  const disk = statfsSync(dirname(dbPath));
  return { checkedAt: new Date(now()).toISOString(), uptimeSeconds: Math.floor(process.uptime()),
    databaseOk: db.prepare('PRAGMA quick_check').get().quick_check === 'ok', databaseBytes: statSync(dbPath).size,
    storageFreeBytes: Number(disk.bavail) * Number(disk.bsize), storageTotalBytes: Number(disk.blocks) * Number(disk.bsize) };
}

export async function contentResponse(directory) {
  return await readState(directory, 'site-content.json', { enabled: false, title: '', message: '' });
}

export function saveContent(directory, content, now = Date.now) {
  const value = { ...validateContent(content), updatedAt: new Date(now()).toISOString() };
  writePrivateJson(join(directory, 'site-content.json'), value);
  return value;
}
