import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const json = (response, status, value) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
};

// Caddy menambahkan IP klien di ujung X-Forwarded-For, jadi entri terakhir yang dipakai.
const clientIp = (request) => {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',').map((part) => part.trim()).filter(Boolean);
  return forwarded.at(-1) || request.socket.remoteAddress || '';
};

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

export function createVisitorServer({ dbPath, locate = () => null }) {
  if (!dbPath) throw new TypeError('dbPath is required');
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS visitors (
      visitor_hash TEXT PRIMARY KEY,
      first_seen TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const existingColumns = new Set(db.prepare('PRAGMA table_info(visitors)').all().map((column) => column.name));
  for (const [name, type] of LOCATION_COLUMNS) {
    if (!existingColumns.has(name)) db.exec(`ALTER TABLE visitors ADD COLUMN ${name} ${type}`);
  }
  const total = db.prepare('SELECT COUNT(*) AS total FROM visitors');
  const insert = db.prepare('INSERT OR IGNORE INTO visitors (visitor_hash, country_code, country, city) VALUES (?, ?, ?, ?)');
  const reset = db.prepare('DELETE FROM visitors');
  const locations = db.prepare(`
    SELECT country_code, country, city, COUNT(*) AS count
    FROM visitors
    GROUP BY country_code, country, city
    ORDER BY count DESC, country, city
  `);
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/api/visitors') {
      json(response, 200, { total: total.get().total });
      return;
    }
    if (request.method === 'POST' && path === '/api/visitors') {
      let body = '';
      try {
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 1024) {
            json(response, 413, { error: 'Request too large' });
            return;
          }
        }
        const { visitorId } = JSON.parse(body);
        if (typeof visitorId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitorId)) {
          json(response, 400, { error: 'Invalid visitor ID' });
          return;
        }
        const location = locate(clientIp(request));
        insert.run(
          createHash('sha256').update(visitorId.toLowerCase()).digest('hex'),
          location?.countryCode ?? null,
          location?.country ?? null,
          location?.city ?? null,
        );
        json(response, 200, { total: total.get().total });
      } catch {
        json(response, 400, { error: 'Invalid JSON' });
      }
      return;
    }
    if (request.method === 'GET' && path === '/api/admin/stats') {
      const earliest = db.prepare('SELECT MIN(first_seen) AS since FROM visitors').get().since;
      json(response, 200, { total: total.get().total, since: earliest });
      return;
    }
    if (request.method === 'GET' && path === '/api/admin/locations') {
      json(response, 200, { total: total.get().total, locations: locations.all() });
      return;
    }
    if (request.method === 'POST' && path === '/api/admin/reset') {
      reset.run();
      json(response, 200, { total: 0 });
      return;
    }
    json(response, 404, { error: 'Not found' });
  });
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
  const server = createVisitorServer({ dbPath, locate });
  server.listen(Number(process.env.PORT || 3001), '127.0.0.1', () => {
    console.log(`Visitor counter listening on 127.0.0.1:${server.address().port}`);
  });
}
