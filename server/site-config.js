import { csvCell, utcTimestamp } from './analytics.js';

const DAY = 86400000;
const WIB = 7 * 3600000;
const localDay = time => new Date(time + WIB).toISOString().slice(0, 10);
const midnight = day => Date.parse(`${day}T00:00:00+07:00`);
const bad = message => Object.assign(new Error(message), { status: 400 });
const isDay = value => typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(midnight(value)) && localDay(midnight(value)) === value;

// Harus sama dengan id di SEASONS (src/data.js); test/site-config.test.js menjaganya.
export const SEASON_IDS = ['halloween', 'lebaran', 'natal', 'newyear', 'imlek', 'valentine', 'ramadan', 'iduladha', 'paskah', 'merdeka'];
export const SEASON_MODES = ['auto', 'on', 'off'];
export const USAGE_EVENTS = ['png', 'gif', 'support_shown', 'support_trakteer', 'support_kofi'];
export const DEFAULT_SUPPORT = { enabled: true, trakteerUrl: 'https://trakteer.id/snappiestudio/gift', kofiUrl: 'https://ko-fi.com/snappiestudio' };
const SUPPORT_HOSTS = { trakteerUrl: 'trakteer.id', kofiUrl: 'ko-fi.com' };
const MAX_KEYS_PER_EVENT = 100;
const RETENTION_DAYS = 400;

export function validateSeasons(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad('Pengaturan musim tidak valid.');
  const result = {};
  for (const [id, item] of Object.entries(value)) {
    if (!SEASON_IDS.includes(id) || !item || typeof item !== 'object') throw bad('Musim tidak dikenal.');
    const mode = item.mode ?? 'auto';
    if (!SEASON_MODES.includes(mode)) throw bad('Mode musim tidak valid.');
    const from = item.from || '', to = item.to || '';
    if ((from || to) && (!isDay(from) || !isDay(to) || from > to || midnight(to) - midnight(from) > 200 * DAY)) {
      throw bad('Isi tanggal mulai dan selesai yang valid; mulai tidak boleh setelah selesai dan maksimal 200 hari.');
    }
    if (mode === 'auto' && from) result[id] = { mode, from, to };
    else if (mode !== 'auto') result[id] = { mode };
  }
  return result;
}

export function validateSupport(value) {
  if (!value || typeof value !== 'object' || typeof value.enabled !== 'boolean') throw bad('Pengaturan dukungan tidak valid.');
  const result = { enabled: value.enabled };
  for (const [field, host] of Object.entries(SUPPORT_HOSTS)) {
    if (typeof value[field] !== 'string' || value[field].length > 200) throw bad('Tautan dukungan tidak valid.');
    const raw = value[field].trim();
    if (!raw) { result[field] = ''; continue; }
    let url;
    try { url = new URL(raw); } catch { throw bad(`Tautan harus berupa alamat lengkap https://${host}/...`); }
    if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || url.port || url.hash) {
      throw bad(`Tautan harus berupa https://${host}/... tanpa port atau kredensial.`);
    }
    result[field] = url.href;
  }
  return result;
}

export function usageRange(params, now) {
  const today = localDay(now);
  const to = params.get('to') || today;
  const from = params.get('from') || localDay(midnight(to) - 29 * DAY);
  if (!isDay(from) || !isDay(to) || from > to || midnight(to) - midnight(from) > 365 * DAY) {
    throw bad('Rentang tanggal tidak valid; maksimal 366 hari.');
  }
  return { from, to };
}

const eachDay = ({ from, to }) => {
  const days = [];
  for (let time = midnight(from); time <= midnight(to); time += DAY) days.push(localDay(time));
  return days;
};

export function createSiteConfig(db, now = Date.now) {
  db.exec(`CREATE TABLE IF NOT EXISTS cms_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS usage_daily (day TEXT NOT NULL, event TEXT NOT NULL, key TEXT NOT NULL DEFAULT '',
      count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, event, key));`);
  const read = (key, fallback) => {
    const row = db.prepare('SELECT value FROM cms_settings WHERE key = ?').get(key);
    try { return row ? JSON.parse(row.value) : fallback; } catch { return fallback; }
  };
  const write = (key, value) => db.prepare(`INSERT INTO cms_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(key, JSON.stringify(value), new Date(now()).toISOString());
  const get = () => ({ seasons: validateSeasonsSafe(read('seasons', {})), support: { ...DEFAULT_SUPPORT, ...read('support', {}) } });
  const validateSeasonsSafe = value => { try { return validateSeasons(value); } catch { return {}; } };
  const bump = db.prepare(`INSERT INTO usage_daily (day, event, key, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(day, event, key) DO UPDATE SET count = count + 1`);
  const knownKey = db.prepare('SELECT 1 FROM usage_daily WHERE event = ? AND key = ? LIMIT 1');
  const keyCount = db.prepare('SELECT COUNT(DISTINCT key) AS count FROM usage_daily WHERE event = ?');
  let prunedOn = '';

  const count = (event, key, day) => {
    // Batas kunci unik mencegah id aneh memenuhi database; sisanya dihitung sebagai "other".
    const safe = !key || knownKey.get(event, key) || keyCount.get(event).count < MAX_KEYS_PER_EVENT ? key : 'other';
    bump.run(day, event, safe);
  };

  return {
    get,
    save(body) {
      if (!body || typeof body !== 'object' || (body.seasons === undefined && body.support === undefined)) throw bad('Tidak ada pengaturan untuk disimpan.');
      const seasons = body.seasons === undefined ? undefined : validateSeasons(body.seasons);
      const support = body.support === undefined ? undefined : validateSupport(body.support);
      if (seasons !== undefined) write('seasons', seasons);
      if (support !== undefined) write('support', support);
      return get();
    },
    // Hanya hitungan harian per kejadian; tanpa ID browser, IP, atau foto.
    record(body) {
      const { event, theme, filter } = body;
      if (!USAGE_EVENTS.includes(event)) throw bad('Kejadian tidak dikenal.');
      for (const value of [theme, filter]) if (value !== undefined && (typeof value !== 'string' || !/^[a-z0-9]{1,24}$/.test(value))) throw bad('Nilai tidak valid.');
      const day = localDay(now());
      db.exec('BEGIN');
      try {
        count(event, '', day);
        if (event === 'png' || event === 'gif') { if (theme) count('theme', theme, day); }
        if (event === 'png' && filter) count('filter', filter, day);
        if (prunedOn !== day) {
          db.prepare('DELETE FROM usage_daily WHERE day < ?').run(localDay(now() - RETENTION_DAYS * DAY));
          prunedOn = day;
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    report(range) {
      const rows = db.prepare('SELECT day, event, key, count FROM usage_daily WHERE day BETWEEN ? AND ?').all(range.from, range.to);
      const totals = Object.fromEntries(USAGE_EVENTS.map(event => [event, 0]));
      const daily = new Map(eachDay(range).map(day => [day, Object.fromEntries(USAGE_EVENTS.map(event => [event, 0]))]));
      const themes = new Map(), filters = new Map();
      for (const row of rows) {
        if (USAGE_EVENTS.includes(row.event)) { totals[row.event] += row.count; daily.get(row.day)[row.event] += row.count; }
        else if (row.event === 'theme') themes.set(row.key, (themes.get(row.key) || 0) + row.count);
        else if (row.event === 'filter') filters.set(row.key, (filters.get(row.key) || 0) + row.count);
      }
      const top = map => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([name, total]) => ({ name, count: total }));
      return { ...range, totals, themes: top(themes), filters: top(filters), daily: [...daily].map(([date, values]) => ({ date, ...values })) };
    },
    csv(range) {
      const usage = this.report(range).daily;
      const active = new Map(db.prepare(`SELECT strftime('%Y-%m-%d', hour, '+7 hours') AS date, COUNT(DISTINCT visitor_hash) AS count
        FROM visitor_activity WHERE hour >= ? AND hour < ? GROUP BY date`).all(utcTimestamp(midnight(range.from)), utcTimestamp(midnight(range.to) + DAY))
        .map(row => [row.date, row.count]));
      const header = ['Tanggal (WIB)', 'Browser aktif', 'PNG diunduh', 'GIF diunduh', 'Popup dukungan tampil', 'Klik Trakteer', 'Klik Ko-fi'];
      return '﻿' + [header, ...usage.map(row => [row.date, active.get(row.date) || 0, row.png, row.gif, row.support_shown, row.support_trakteer, row.support_kofi])]
        .map(line => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
    },
  };
}
