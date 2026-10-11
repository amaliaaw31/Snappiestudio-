import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createVisitorServer } from '../server/visitor-counter.js';
import bcrypt from 'bcryptjs';

const origin = 'https://snappiestudio.com';
const password = 'test-only-password';
const admin = { passwordHash: bcrypt.hashSync(password, 4), allowedOrigins: [origin] };
async function login(base) {
  const response = await fetch(`${base}/api/admin/login`, { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password }) });
  assert.equal(response.status, 200);
  return { Cookie: response.headers.get('set-cookie').split(';')[0], Origin: origin, 'X-CSRF-Token': (await response.json()).csrfToken };
}

test('counts each anonymous browser once and supports CMS stats and reset', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-visitors-'));
  const server = createVisitorServer({ dbPath: join(directory, 'visitors.sqlite'), admin });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const visitorId = 'ca7c9a39-dc55-46c5-a091-09f2a1b6a8bb';
  const visit = (id) => fetch(`${base}/api/visitors`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId: id }),
  });

  assert.deepEqual(await (await visit(visitorId)).json(), { total: 1 });
  assert.deepEqual(await (await visit(visitorId)).json(), { total: 1 });
  assert.deepEqual(await (await visit('ca7c9a39-dc55-46c5-a091-09f2a1b6a8bc')).json(), { total: 2 });

  const headers = await login(base);
  const stats = await (await fetch(`${base}/api/admin/stats`, { headers })).json();
  assert.equal(stats.total, 2);
  assert.match(stats.since, /^\d{4}-\d{2}-\d{2} /);
  assert.deepEqual(await (await fetch(`${base}/api/admin/reset`, { method: 'POST', headers })).json(), { total: 0 });
  assert.deepEqual(await (await fetch(`${base}/api/visitors`)).json(), { total: 0 });
  assert.equal((await visit('not-a-uuid')).status, 400);
});

test('records coarse location from the forwarded client IP and reports it to the CMS', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-visitors-'));
  const locate = (ip) => (ip === '182.253.0.1' ? { countryCode: 'ID', country: 'Indonesia', city: 'Jakarta' } : null);
  const server = createVisitorServer({ dbPath: join(directory, 'visitors.sqlite'), locate, admin, trustProxy: true });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const visit = (id, forwardedFor) => fetch(`${base}/api/visitors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}) },
    body: JSON.stringify({ visitorId: id }),
  });

  await visit('ca7c9a39-dc55-46c5-a091-09f2a1b6a8bb', '10.0.0.1, 182.253.0.1');
  await visit('ca7c9a39-dc55-46c5-a091-09f2a1b6a8bc', '182.253.0.1');
  await visit('ca7c9a39-dc55-46c5-a091-09f2a1b6a8bd', '203.0.113.9');

  const headers = await login(base);
  const report = await (await fetch(`${base}/api/admin/locations`, { headers })).json();
  assert.equal(report.total, 3);
  assert.deepEqual(report.locations, [
    { country_code: 'ID', country: 'Indonesia', city: 'Jakarta', count: 2 },
    { country_code: null, country: null, city: null, count: 1 },
  ]);
  const raw = await (await fetch(`${base}/api/admin/locations`, { headers })).text();
  assert.doesNotMatch(raw, /182\.253|203\.0\.113/);
});

test('CMS lists the latest 100 first visits with UTC times, including existing visitors', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-visit-times-'));
  const dbPath = join(directory, 'visitors.sqlite');
  const visitorId = 'ca7c9a39-dc55-46c5-a091-09f2a1b6a8bb';
  // Seed the original schema to check that historical visit times survive migration.
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE visitors (visitor_hash TEXT PRIMARY KEY, first_seen TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO visitors VALUES (?, ?)');
  insert.run(createHash('sha256').update(visitorId).digest('hex'), '2026-10-09 17:05:00');
  for (let i = 0; i < 101; i++) {
    insert.run(`test-hash-${i}`, '2026-10-08 23:59:00');
  }
  db.close();
  const server = createVisitorServer({ dbPath, admin });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = await login(base);
  await fetch(`${base}/api/visitors`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId }) });
  const response = await fetch(`${base}/api/admin/visits`, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const report = await response.json();
  assert.equal(report.total, 102);
  assert.equal(report.visits.length, 100);
  assert.equal(report.visits[0].first_seen, '2026-10-09 17:05:00');
  assert.ok(report.visits[0].last_seen > report.visits[0].first_seen);
  assert.equal(report.visits[0].country, null);
  assert.equal(report.pages, 2);
  assert.ok(report.visits.slice(1).every(row => row.first_seen === '2026-10-08 23:59:00'));
  assert.doesNotMatch(JSON.stringify(report), /visitor_hash|test-hash|ca7c9a39/);
});
