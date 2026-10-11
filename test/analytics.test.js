import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { DatabaseSync } from 'node:sqlite';
import { createVisitorServer } from '../server/visitor-counter.js';
import { createAnalytics } from '../server/analytics.js';

const origin = 'https://snappiestudio.com';
const password = 'analytics-test-password';
const passwordHash = bcrypt.hashSync(password, 4);
const firstId = 'ca7c9a39-dc55-46c5-a091-09f2a1b6a8bb';
const secondId = 'ca7c9a39-dc55-46c5-a091-09f2a1b6a8bc';

async function app(t, locate = () => null) {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-analytics-'));
  let time = Date.parse('2026-10-11T16:59:00Z');
  const dbPath = join(directory, 'visitors.sqlite');
  const server = createVisitorServer({ dbPath, locate, now: () => time, admin: { passwordHash, allowedOrigins: [origin] } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options) => fetch(base + path, options);
  const login = async () => {
    const response = await request('/api/admin/login', { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password }) });
    assert.equal(response.status, 200);
    return { Cookie: response.headers.get('set-cookie').split(';')[0], Origin: origin, 'X-CSRF-Token': (await response.json()).csrfToken };
  };
  return { request, login, setTime: value => { time = Date.parse(value); },
    visit: visitorId => request('/api/visitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId }) }),
  };
}

test('repeat visits preserve the lifetime count and first visit, update last visit, and deduplicate daily/hourly browsers in WIB', async t => {
  const api = await app(t);
  await api.visit(firstId); // Sunday 23:59 WIB.
  api.setTime('2026-10-11T17:00:00Z'); // Monday 00:00 WIB.
  await api.visit(firstId);
  api.setTime('2026-10-11T17:05:00Z');
  await api.visit(firstId);
  await api.visit(secondId);
  const headers = await api.login();
  const report = await (await api.request('/api/admin/report?from=2026-10-11&to=2026-10-12', { headers })).json();
  assert.equal(report.total, 2);
  assert.equal(report.summary.today, 2);
  assert.equal(report.summary.yesterday, 1);
  assert.equal(report.summary.week, 2, 'week starts Monday WIB');
  assert.equal(report.summary.month, 2, 'same browser across days counts once in month');
  assert.deepEqual(report.charts.daily, [{ date: '2026-10-11', count: 1 }, { date: '2026-10-12', count: 2 }]);
  assert.equal(report.charts.hourly[0].count, 2, 'reloads in one hour do not inflate hourly counts');
  assert.equal(report.charts.hourly[23].count, 1);
  const first = report.visitors.visits.find(row => row.first_seen === '2026-10-11 16:59:00');
  assert.equal(first.last_seen, '2026-10-11 17:05:00');
  const filtered = await (await api.request('/api/admin/report?from=2026-10-12&to=2026-10-12', { headers })).json();
  assert.equal(filtered.visitors.total, 2, 'date filter includes returning browsers whose first visit was earlier');
  assert.equal(filtered.charts.hourly[23].count, 0);
  assert.doesNotMatch(JSON.stringify(report), /visitor_hash|visitorId|ca7c9a39/);
});

test('report, location search, paging and full CSV export use the same filters', async t => {
  const api = await app(t, () => ({ countryCode: 'ID', country: 'Indonesia', city: '=HYPERLINK("bad"), Jakarta' }));
  await api.visit(firstId);
  await api.visit(secondId);
  const headers = await api.login();
  const query = 'from=2026-10-11&to=2026-10-11&q=Jakarta&pageSize=1';
  const first = await (await api.request('/api/admin/report?' + query, { headers })).json();
  const second = await (await api.request('/api/admin/report?' + query + '&page=2', { headers })).json();
  assert.equal(first.visitors.total, 2);
  assert.equal(first.visitors.visits.length, 1);
  assert.equal(second.visitors.page, 2);
  assert.equal(second.visitors.visits.length, 1);
  assert.equal(first.locations.total, 2);
  assert.equal(first.charts.daily[0].count, 2);
  const beyond = await (await api.request('/api/admin/visits?' + query + '&page=999', { headers })).json();
  assert.equal(beyond.page, 2);
  const csv = await api.request('/api/admin/export.csv?' + query + '&page=2', { headers });
  assert.equal(csv.headers.get('cache-control'), 'no-store');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /attachment/);
  const content = await csv.text();
  assert.equal(content.trim().split('\r\n').length, 3, 'CSV includes every filtered page');
  assert.match(content, /2026-10-11 23:59 WIB/);
  assert.match(content, /"'=HYPERLINK\(""bad""\), Jakarta"/, 'CSV formulas and quote/comma injection are escaped');
  assert.doesNotMatch(content, /visitor_hash|ca7c9a39/);
  const empty = await (await api.request('/api/admin/report?q=Surabaya', { headers })).json();
  assert.equal(empty.visitors.total, 0);
  assert.equal(empty.locations.total, 0);
  assert.ok(empty.charts.daily.every(row => row.count === 0));
  assert.equal(empty.summary.today, 2, 'headline summaries stay global');
  const literal = await (await api.request('/api/admin/report?q=%25', { headers })).json();
  assert.equal(literal.visitors.total, 0, 'LIKE wildcards are treated as literal search text');
});

test('invalid dates, range, query and pagination are rejected without running unbounded queries', async t => {
  const api = await app(t);
  const headers = await api.login();
  for (const query of ['from=2026-02-30', 'from=2026-10-12&to=2026-10-11', 'page=0', 'pageSize=101', 'page=1.5', 'page=-1', 'from=hello', 'q=' + 'x'.repeat(101)]) {
    for (const endpoint of ['report', 'visits', 'locations', 'export.csv']) {
      assert.equal((await api.request('/api/admin/' + endpoint + '?' + query, { headers })).status, 400, `${endpoint}: ${query}`);
    }
  }
});

test('long ranges aggregate by month and preserve zero periods; exclusions and reset remove activity', async t => {
  const api = await app(t);
  await api.visit(firstId);
  const headers = await api.login();
  const report = await (await api.request('/api/admin/report?from=2026-08-01&to=2026-10-31', { headers })).json();
  assert.equal(report.charts.unit, 'month');
  assert.deepEqual(report.charts.daily, [{ date: '2026-08', count: 0 }, { date: '2026-09', count: 0 }, { date: '2026-10', count: 1 }]);
  await api.request('/api/admin/exclude-browser', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId: firstId }) });
  const excluded = await (await api.request('/api/admin/report', { headers })).json();
  assert.equal(excluded.total, 0);
  assert.equal(excluded.summary.today, 0);
  assert.ok(excluded.charts.daily.every(row => row.count === 0));
  await api.visit(secondId);
  await api.request('/api/admin/reset', { method: 'POST', headers });
  const reset = await (await api.request('/api/admin/report', { headers })).json();
  assert.equal(reset.total, 0);
  assert.equal(reset.summary.today, 0);
  await api.visit(firstId);
  assert.equal((await (await api.request('/api/visitors')).json()).total, 0, 'reset keeps browser exclusion');
});

test('hourly chart adds the same local hour across days while period totals deduplicate browsers', async t => {
  const api = await app(t);
  api.setTime('2026-10-10T17:05:00Z');
  await api.visit(firstId);
  api.setTime('2026-10-11T17:05:00Z');
  await api.visit(firstId);
  await api.visit(secondId);
  const headers = await api.login();
  const report = await (await api.request('/api/admin/report?from=2026-10-11&to=2026-10-12', { headers })).json();
  assert.equal(report.summary.month, 2);
  assert.equal(report.charts.hourly[0].count, 3, 'one browser-day on Sunday plus two on Monday');
  assert.equal(report.charts.hourly.reduce((sum, row) => sum + row.count, 0), 3);
});

test('migration preserves historical times and activity when initialized again', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`PRAGMA foreign_keys = ON;
      CREATE TABLE visitors (visitor_hash TEXT PRIMARY KEY, first_seen TEXT NOT NULL, country_code TEXT, country TEXT, city TEXT);
      INSERT INTO visitors VALUES ('browser', '2026-10-10 16:59:00', NULL, NULL, NULL);`);
    const first = createAnalytics(db, () => Date.parse('2026-10-11T17:05:00Z'));
    first.record('browser', '2026-10-11 17:05:00');
    const again = createAnalytics(db, () => Date.parse('2026-10-12T17:05:00Z'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM visitor_activity').get().n, 2);
    const visitor = db.prepare('SELECT first_seen, last_seen FROM visitors').get();
    assert.deepEqual({ ...visitor }, { first_seen: '2026-10-10 16:59:00', last_seen: '2026-10-11 17:05:00' });
    assert.equal(again.summary().trackingSince, '2026-10-11 17:05:00');
    db.exec('DELETE FROM visitors');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM visitor_activity').get().n, 0);
  } finally { db.close(); }
});
