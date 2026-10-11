import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { clientIp, createAdminSecurity, createRateLimiter, json, readJson } from './security.js';
import { createAnalytics, reportFilters, utcTimestamp, csvVisit } from './analytics.js';

const CMS_FILES = new Map([
  ['/cms', 'cms.html'], ['/cms/', 'cms.html'], ['/cms.html', 'cms.html'],
  ['/cms/dashboard', 'cms-dashboard.html'], ['/cms/dashboard/', 'cms-dashboard.html'],
  ['/cms-dashboard.html', 'cms-dashboard.html'],
]);
const CMS_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'";

// Mengubah record GeoIP menjadi negara dan kota saja. IP tidak pernah disimpan.
export function createLocator(reader) {
  return (ip) => {
    if (!reader || !ip) return null;
    try {
      const record = reader.get(ip);
      const countryCode = record?.country?.iso_code;
      if (!countryCode) return null;
      return {
        countryCode,
        country: record.country.names?.en || countryCode,
        city: record.city?.names?.en || null,
      };
    } catch {
      return null;
    }
  };
}

const LOCATION_COLUMNS = [
  ['country_code', 'TEXT'],
  ['country', 'TEXT'],
  ['city', 'TEXT'],
];

export function createVisitorServer({ dbPath, locate = () => null, admin = {}, trustProxy = false,
  publicDirectory = new URL('../dist/', import.meta.url), now = Date.now }) {
  if (!dbPath) throw new TypeError('dbPath is required');
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS visitors (
      visitor_hash TEXT PRIMARY KEY,
      first_seen TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS excluded_browsers (
      visitor_hash TEXT PRIMARY KEY
    );
  `);
  const existingColumns = new Set(db.prepare('PRAGMA table_info(visitors)').all().map((column) => column.name));
  for (const [name, type] of LOCATION_COLUMNS) {
    if (!existingColumns.has(name)) db.exec(`ALTER TABLE visitors ADD COLUMN ${name} ${type}`);
  }
  const total = db.prepare('SELECT COUNT(*) AS total FROM visitors');
  const analytics = createAnalytics(db, now);
  const insert = db.prepare('INSERT OR IGNORE INTO visitors (visitor_hash, country_code, country, city, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)');
  const reset = db.prepare('DELETE FROM visitors');
  const isExcluded = db.prepare('SELECT 1 FROM excluded_browsers WHERE visitor_hash = ?');
  const excludeBrowser = db.prepare('INSERT OR IGNORE INTO excluded_browsers (visitor_hash) VALUES (?)');
  const removeBrowser = db.prepare('DELETE FROM visitors WHERE visitor_hash = ?');
  const security = createAdminSecurity({ ...admin, trustProxy, now });
  const limit = createRateLimiter({ now });
  const origins = new Set(admin.allowedOrigins || ['https://snappiestudio.com', 'https://www.snappiestudio.com']);
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 10000 }, async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname;
      if (CMS_FILES.has(path)) {
        if (!['GET', 'HEAD'].includes(request.method)) { response.setHeader('Allow', 'GET, HEAD'); json(response, 405, { error: 'Method not allowed' }); return; }
        if (CMS_FILES.get(path) === 'cms-dashboard.html' && !security.session(request)) {
          response.writeHead(303, { Location: '/cms', 'Cache-Control': 'no-store' }); response.end(); return;
        }
        const page = await readFile(new URL(CMS_FILES.get(path), publicDirectory));
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Security-Policy': CMS_CSP, 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
        response.end(request.method === 'HEAD' ? undefined : page); return;
      }
      if (path === '/api/admin/login' && request.method === 'POST') {
        await security.login(request, response); return;
      }
      if (path === '/api/admin/logout' && request.method === 'POST') {
        security.logout(request, response); return;
      }
      if (path === '/api/admin' || path.startsWith('/api/admin/')) {
        const session = security.authorize(request, response, !['GET', 'HEAD'].includes(request.method));
        if (!session) return;
        if (path === '/api/admin/session' && request.method === 'GET') {
          json(response, 200, { csrfToken: session.csrfToken }); return;
        }
      }
      if (path === '/api/visitors') {
        if (request.headers['sec-fetch-site'] === 'cross-site' || (request.headers.origin && !origins.has(request.headers.origin))) {
          json(response, 403, { error: 'Forbidden origin' }); return;
        }
        const retry = limit('visitors:' + clientIp(request, trustProxy), 120, 60 * 1000);
        if (retry) { response.setHeader('Retry-After', String(retry)); json(response, 429, { error: 'Too many requests' }); return; }
      }
      if (request.method === 'GET' && path === '/api/visitors') {
        json(response, 200, { total: total.get().total });
        return;
      }
      if (request.method === 'POST' && path === '/api/visitors') {
        const { visitorId } = await readJson(request);
        if (typeof visitorId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitorId)) {
          json(response, 400, { error: 'Invalid visitor ID' });
          return;
        }
        const hash = createHash('sha256').update(visitorId.toLowerCase()).digest('hex');
        if (isExcluded.get(hash)) { json(response, 200, { total: total.get().total }); return; }
        const location = locate(clientIp(request, trustProxy));
        const timestamp = utcTimestamp(now());
        db.exec('BEGIN');
        try {
          insert.run(
            hash,
            location?.countryCode ?? null,
            location?.country ?? null,
            location?.city ?? null,
            timestamp, timestamp,
          );
          analytics.record(hash, timestamp);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        json(response, 200, { total: total.get().total });
        return;
      }
      if (request.method === 'GET' && path === '/api/admin/stats') {
        const earliest = db.prepare('SELECT MIN(first_seen) AS since FROM visitors').get().since;
        json(response, 200, { total: total.get().total, since: earliest });
        return;
      }
      if (request.method === 'GET' && path === '/api/admin/locations') {
        json(response, 200, analytics.locations(reportFilters(url.searchParams)));
        return;
      }
      if (request.method === 'GET' && path === '/api/admin/visits') {
        json(response, 200, analytics.visits(reportFilters(url.searchParams)));
        return;
      }
      if (request.method === 'GET' && path === '/api/admin/report') {
        const filters = reportFilters(url.searchParams);
        json(response, 200, {
          total: total.get().total,
          since: db.prepare('SELECT MIN(first_seen) AS since FROM visitors').get().since,
          summary: analytics.summary(), charts: analytics.charts(filters),
          visitors: analytics.visits(filters), locations: analytics.locations(filters),
        });
        return;
      }
      if (request.method === 'GET' && path === '/api/admin/export.csv') {
        const rows = analytics.csvRows(reportFilters(url.searchParams));
        response.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Disposition': 'attachment; filename="snappie-pengunjung.csv"', 'X-Content-Type-Options': 'nosniff' });
        response.write('\uFEFF"Kunjungan pertama (WIB)","Kunjungan terakhir (WIB)","Negara","Kota"\r\n');
        for (const row of rows) {
          if (response.destroyed) break;
          if (!response.write(csvVisit(row))) {
            await new Promise(resolve => {
              const done = () => { response.off('drain', done); response.off('close', done); resolve(); };
              response.once('drain', done); response.once('close', done);
            });
          }
        }
        response.end(); return;
      }
      if (request.method === 'POST' && path === '/api/admin/reset') {
        reset.run();
        json(response, 200, { total: 0 });
        return;
      }
      if (request.method === 'POST' && path === '/api/admin/exclude-browser') {
        const { visitorId } = await readJson(request);
        if (typeof visitorId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitorId)) {
          json(response, 400, { error: 'Invalid visitor ID' }); return;
        }
        const hash = createHash('sha256').update(visitorId.toLowerCase()).digest('hex');
        db.exec('BEGIN');
        try { excludeBrowser.run(hash); removeBrowser.run(hash); db.exec('COMMIT'); }
        catch (error) { db.exec('ROLLBACK'); throw error; }
        json(response, 200, { excluded: true, total: total.get().total }); return;
      }
      json(response, 404, { error: 'Not found' });
    } catch (error) {
      if (!response.headersSent) json(response, error.status || 500, { error: error.status ? error.message : 'Request failed' });
      else response.end();
    }
  });
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  server.maxHeadersCount = 50;
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const dbPath = process.env.VISITOR_DB_PATH || '/var/lib/snappiestudio-counter/visitors.sqlite';
  const geoDbPath = process.env.GEOIP_DB_PATH || '';
  let locate = () => null;
  if (geoDbPath) {
    const { open } = await import('maxmind');
    locate = createLocator(await open(geoDbPath));
  }
  const passwordHash = process.env.CMS_PASSWORD_HASH_FILE
    ? readFileSync(process.env.CMS_PASSWORD_HASH_FILE, 'utf8').trim() : process.env.CMS_PASSWORD_HASH || '';
  const allowedOrigins = (process.env.SITE_ORIGINS || 'https://snappiestudio.com,https://www.snappiestudio.com').split(',').map(origin => origin.trim());
  const server = createVisitorServer({ dbPath, locate, trustProxy: true,
    publicDirectory: new URL(`file://${process.env.SITE_DIRECTORY || '/var/www/snappie'}/`),
    admin: { passwordHash, username: process.env.CMS_USERNAME || 'admin', allowedOrigins } });
  server.listen(Number(process.env.PORT || 3001), '127.0.0.1', () => {
    console.log(`Visitor counter listening on 127.0.0.1:${server.address().port}`);
  });
}
