import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createVisitorServer } from '../server/visitor-counter.js';

test('counts each anonymous browser once and supports CMS stats and reset', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-visitors-'));
  const server = createVisitorServer({ dbPath: join(directory, 'visitors.sqlite') });
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

  const stats = await (await fetch(`${base}/api/admin/stats`)).json();
  assert.equal(stats.total, 2);
  assert.match(stats.since, /^\d{4}-\d{2}-\d{2} /);
  assert.deepEqual(await (await fetch(`${base}/api/admin/reset`, { method: 'POST' })).json(), { total: 0 });
  assert.deepEqual(await (await fetch(`${base}/api/visitors`)).json(), { total: 0 });
  assert.equal((await visit('not-a-uuid')).status, 400);
});

test('records coarse location from the forwarded client IP and reports it to the CMS', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-visitors-'));
  const locate = (ip) => (ip === '182.253.0.1' ? { countryCode: 'ID', country: 'Indonesia', city: 'Jakarta' } : null);
  const server = createVisitorServer({ dbPath: join(directory, 'visitors.sqlite'), locate });
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

  const report = await (await fetch(`${base}/api/admin/locations`)).json();
  assert.equal(report.total, 3);
  assert.deepEqual(report.locations, [
    { country_code: 'ID', country: 'Indonesia', city: 'Jakarta', count: 2 },
    { country_code: null, country: null, city: null, count: 1 },
  ]);
  const raw = await (await fetch(`${base}/api/admin/locations`)).text();
  assert.doesNotMatch(raw, /182\.253|203\.0\.113/);
});
