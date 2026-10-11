import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import { createVisitorServer } from '../server/visitor-counter.js';
import { clientIp, createRateLimiter, SESSION_COOKIE } from '../server/security.js';

const origin = 'https://snappiestudio.com';
const password = 'test-only-password';
const passwordHash = bcrypt.hashSync(password, 4);

async function app(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-security-'));
  let time = Date.now();
  const server = createVisitorServer({ dbPath: join(directory, 'visitors.sqlite'),
    admin: { passwordHash, allowedOrigins: [origin] },
    publicDirectory: new URL('../public/', import.meta.url), now: () => time, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options) => fetch(base + path, { redirect: 'manual', ...options });
  const login = (overrides = {}) => request('/api/admin/login', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password }), ...overrides,
  });
  const authenticate = async () => {
    const response = await login();
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie');
    const { csrfToken } = await response.json();
    return { cookie, headers: { Cookie: cookie.split(';')[0], Origin: origin, 'X-CSRF-Token': csrfToken } };
  };
  return { request, login, authenticate, advance: ms => { time += ms; } };
}

test('admin endpoints and all dashboard aliases require a server session', async t => {
  const api = await app(t);
  for (const path of ['/api/admin/stats', '/api/admin/locations', '/api/admin/visits', '/api/admin/report', '/api/admin/export.csv', '/api/admin/session']) {
    assert.equal((await api.request(path)).status, 401);
    assert.equal((await api.request(path, { headers: { Authorization: 'Basic YWRtaW46cGFzc3dvcmQ=' } })).status, 401);
    assert.equal((await api.request(path, { headers: { Cookie: `${SESSION_COOKIE}=${'a'.repeat(43)}` } })).status, 401);
  }
  assert.equal((await api.request('/api/admin/reset', { method: 'POST' })).status, 401);
  assert.equal((await api.request('/api/admin/exclude-browser', { method: 'POST' })).status, 401);
  for (const path of ['/cms/dashboard', '/cms/dashboard/', '/cms-dashboard.html']) {
    const response = await api.request(path);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/cms');
    assert.doesNotMatch(await response.text(), /Jumlah Pengunjung/);
  }
});

test('login creates a private cookie, rotates sessions, and logout revokes the token', async t => {
  const api = await app(t);
  const first = await api.authenticate();
  assert.match(first.cookie, /Path=\/; HttpOnly; Secure; SameSite=Strict/);
  assert.doesNotMatch(first.cookie, /Domain=|test-only-password/);
  const dashboard = await api.request('/cms/dashboard', { headers: first.headers });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.headers.get('cache-control'), 'no-store');
  assert.match(dashboard.headers.get('content-security-policy'), /script-src 'self'/);
  assert.doesNotMatch(dashboard.headers.get('content-security-policy'), /unsafe-inline/);
  const rotated = await api.login({ headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: first.headers.Cookie } });
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.headers.get('set-cookie').split(';')[0], first.headers.Cookie);
  assert.equal((await api.request('/api/admin/stats', { headers: first.headers })).status, 401);
  const headers = { Cookie: rotated.headers.get('set-cookie').split(';')[0], Origin: origin, 'X-CSRF-Token': (await rotated.json()).csrfToken };
  assert.equal((await api.request('/api/admin/logout', { method: 'POST', headers })).status, 200);
  assert.equal((await api.request('/api/admin/stats', { headers })).status, 401);
});

test('cross-site and missing CSRF requests cannot reset the database or log in', async t => {
  const api = await app(t);
  assert.equal((await api.login({ headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' } })).status, 403);
  const { headers } = await api.authenticate();
  const visitorId = 'ca7c9a39-dc55-46c5-a091-09f2a1b6a8bb';
  await api.request('/api/visitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId }) });
  for (const extra of [
    { Origin: 'https://evil.example' }, { 'X-CSRF-Token': '' }, { 'X-CSRF-Token': 'é'.repeat(43) },
    { 'Sec-Fetch-Site': 'cross-site' }, { Origin: '' },
  ]) {
    assert.equal((await api.request('/api/admin/reset', { method: 'POST', headers: { ...headers, ...extra } })).status, 403);
  }
  assert.equal((await (await api.request('/api/visitors')).json()).total, 1);
  assert.equal((await api.request('/api/admin/reset', { method: 'POST', headers })).status, 200);
  assert.equal((await (await api.request('/api/visitors')).json()).total, 0);
});

test('sessions expire after inactivity and have an absolute lifetime', async t => {
  const api = await app(t);
  const first = await api.authenticate();
  api.advance(30 * 60 * 1000);
  assert.equal((await api.request('/api/admin/session', { headers: first.headers })).status, 401);
  const second = await api.authenticate();
  for (let i = 0; i < 16; i++) {
    api.advance(29 * 60 * 1000);
    assert.equal((await api.request('/api/admin/session', { headers: second.headers })).status, 200);
  }
  api.advance(17 * 60 * 1000);
  assert.equal((await api.request('/api/admin/session', { headers: second.headers })).status, 401);
});

test('login throttles guesses even with spoofed forwarded addresses', async t => {
  const api = await app(t);
  for (let i = 0; i < 5; i++) {
    const response = await api.login({ body: JSON.stringify({ username: 'admin', password: 'wrong' }),
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-For': `203.0.113.${i}` } });
    assert.equal(response.status, 401);
  }
  const limited = await api.login();
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  api.advance(15 * 60 * 1000);
  assert.equal((await api.login()).status, 200);
});

test('invalid bodies, content types and cross-site visitor writes are rejected', async t => {
  const api = await app(t);
  assert.equal((await api.request('/api/visitors', { method: 'POST', body: '{}' })).status, 415);
  for (const [body, expected] of [['null', 400], ['{', 400], ['x'.repeat(1100), 413]]) {
    assert.equal((await api.request('/api/visitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, expected);
  }
  assert.equal((await api.request('/api/visitors', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  for (let i = 0; i < 116; i++) await api.request('/api/visitors');
  assert.equal((await api.request('/api/visitors')).status, 429);
});

test('CMS authentication fails closed when the password hash is not configured', async t => {
  const api = await app(t, { admin: {} });
  assert.equal((await api.login()).status, 503);
  assert.equal((await api.request('/api/admin/stats')).status, 401);
  assert.equal((await api.request('/api/visitors')).status, 200);
});

test('maintenance excludes only the authenticated admin browser, including its previous visit', async t => {
  const api = await app(t);
  const adminId = 'ca7c9a39-dc55-46c5-a091-09f2a1b6a8bb';
  const otherId = 'ca7c9a39-dc55-46c5-a091-09f2a1b6a8bc';
  const visit = visitorId => api.request('/api/visitors', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId }) });
  await visit(adminId);
  assert.equal((await (await visit(otherId)).json()).total, 2);
  const { headers } = await api.authenticate();
  const exclude = (csrf = headers['X-CSRF-Token']) => api.request('/api/admin/exclude-browser', { method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ visitorId: adminId }) });
  assert.equal((await exclude('')).status, 403);
  assert.equal((await (await api.request('/api/visitors')).json()).total, 2);
  assert.deepEqual(await (await exclude()).json(), { excluded: true, total: 1 });
  assert.deepEqual(await (await exclude()).json(), { excluded: true, total: 1 });
  assert.equal((await (await visit(adminId)).json()).total, 1);
  const report = await (await api.request('/api/admin/locations', { headers })).json();
  assert.equal(report.total, 1);
  assert.equal(report.locations.reduce((total, row) => total + row.count, 0), 1);
  const visits = await (await api.request('/api/admin/visits', { headers })).json();
  assert.equal(visits.total, 1);
  assert.equal(visits.visits.length, 1, 'excluded browser is removed from visit times');
  await api.request('/api/admin/reset', { method: 'POST', headers });
  const empty = await (await api.request('/api/admin/visits', { headers })).json();
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.visits, []);
  const dashboard = await (await api.request('/api/admin/report', { headers })).json();
  assert.equal(dashboard.summary.today, 0);
  assert.ok(dashboard.charts.hourly.every(row => row.count === 0));
  assert.equal((await (await visit(adminId)).json()).total, 0, 'reset preserves maintenance exclusion');
});

test('proxy trust is explicit and bounded rate-limit storage fails closed', () => {
  const request = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': 'spoof, 182.253.0.1' } };
  assert.equal(clientIp(request), '127.0.0.1');
  assert.equal(clientIp(request, true), '182.253.0.1');
  request.socket.remoteAddress = '203.0.113.1';
  assert.equal(clientIp(request, true), '203.0.113.1');
  let now = 0;
  const limit = createRateLimiter({ now: () => now, maxEntries: 1 });
  assert.equal(limit('first', 1, 1000), 0);
  assert.equal(limit('second', 1, 1000), 1);
  now = 1001;
  assert.equal(limit('second', 1, 1000), 0);
});
