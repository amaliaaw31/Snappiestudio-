import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import bcrypt from 'bcryptjs';
import { DatabaseSync } from 'node:sqlite';
import { createVisitorServer } from '../server/visitor-counter.js';
import { createAnalytics, utcTimestamp } from '../server/analytics.js';
import { trafficAlert } from '../server/traffic-alert.js';
import { SEASON_IDS, validateSeasons, validateSupport } from '../server/site-config.js';
import { SEASONS } from '../src/data.js';

const origin = 'https://snappiestudio.com';
const password = 'site-config-test-password';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-config-'));
  let time = Date.parse('2026-10-23T05:00:00Z');
  const server = createVisitorServer({ dbPath: join(directory, 'visitors.sqlite'), now: () => time,
    admin: { passwordHash: bcrypt.hashSync(password, 4), username: 'admin', allowedOrigins: [origin] } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = (path, options) => fetch(base + path, options);
  const login = async () => {
    const response = await request('/api/admin/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password }) });
    return { Cookie: response.headers.get('set-cookie').split(';')[0], Origin: origin, 'X-CSRF-Token': (await response.json()).csrfToken };
  };
  const send = (path, body, headers = { Origin: origin }) => request(path, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { request, login, send, advance: ms => { time += ms; } };
}

test('season ids in the backend match the sticker seasons in the app', () => {
  assert.deepEqual([...SEASON_IDS].sort(), SEASONS.map(season => season.id).sort());
});

test('season and support validation rejects unknown, malformed and off-site values', () => {
  assert.deepEqual(validateSeasons({ natal: { mode: 'on' }, imlek: { mode: 'auto', from: '2027-02-01', to: '2027-02-20' }, paskah: { mode: 'auto' } }),
    { natal: { mode: 'on' }, imlek: { mode: 'auto', from: '2027-02-01', to: '2027-02-20' } });
  for (const bad of [{ diwali: { mode: 'on' } }, { natal: { mode: 'always' } }, { natal: { from: '2027-02-01' } }, { natal: { from: '2027-02-30', to: '2027-03-01' } },
    { natal: { from: '2027-03-01', to: '2027-02-01' } }, { natal: { from: '2027-01-01', to: '2027-12-31' } }, [], null]) {
    assert.throws(() => validateSeasons(bad), { status: 400 });
  }
  assert.equal(validateSupport({ enabled: true, trakteerUrl: ' https://trakteer.id/x ', kofiUrl: '' }).trakteerUrl, 'https://trakteer.id/x');
  for (const bad of [{ trakteerUrl: 'http://trakteer.id/x' }, { trakteerUrl: 'https://evil.example/x' }, { trakteerUrl: 'https://trakteer.id.evil.example/x' },
    { trakteerUrl: 'https://user:pw@trakteer.id/x' }, { trakteerUrl: 'https://trakteer.id:8443/x' }, { trakteerUrl: 'javascript:alert(1)' }, { kofiUrl: 'https://trakteer.id/x' }]) {
    assert.throws(() => validateSupport({ enabled: true, trakteerUrl: '', kofiUrl: '', ...bad }), { status: 400 });
  }
  assert.throws(() => validateSupport({ trakteerUrl: '', kofiUrl: '' }), { status: 400 });
});

test('public site config defaults, admin saves with CSRF, public reads the change', async t => {
  const api = await fixture(t);
  const defaults = await (await api.request('/api/site-config')).json();
  assert.equal(defaults.support.trakteerUrl, 'https://trakteer.id/snappiestudio/gift');
  assert.equal(defaults.support.kofiUrl, 'https://ko-fi.com/snappiestudio');
  assert.deepEqual(defaults.seasons, {});
  const body = { seasons: { natal: { mode: 'off' } }, support: { enabled: false, trakteerUrl: '', kofiUrl: 'https://ko-fi.com/other' } };
  assert.equal((await api.send('/api/admin/site-config', body)).status, 401);
  const headers = await api.login();
  assert.equal((await api.send('/api/admin/site-config', body, { ...headers, 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await api.send('/api/admin/site-config', { support: { enabled: true, trakteerUrl: 'https://evil.example', kofiUrl: '' } }, headers)).status, 400);
  assert.equal((await api.send('/api/admin/site-config', body, headers)).status, 200);
  const saved = await (await api.request('/api/site-config')).json();
  assert.deepEqual(saved.seasons, { natal: { mode: 'off' } });
  assert.deepEqual(saved.support, { enabled: false, trakteerUrl: '', kofiUrl: 'https://ko-fi.com/other' });
  assert.equal((await api.request('/api/admin/site-config')).status, 401);
});

test('usage events are validated, aggregated per day and reported without personal data', async t => {
  const api = await fixture(t);
  for (const body of [{ event: 'png', theme: 'pastel', filter: 'normal' }, { event: 'png', theme: 'pastel', filter: 'vintage' }, { event: 'gif', theme: 'film' }, { event: 'support_shown' }, { event: 'support_kofi' }]) {
    assert.equal((await api.send('/api/events', body)).status, 200);
  }
  for (const body of [{ event: 'login' }, { event: 'png', theme: 'Pastel!' }, { event: 'png', theme: 5 }, { event: 'png', filter: 'x'.repeat(40) }, {}]) {
    assert.equal((await api.send('/api/events', body)).status, 400);
  }
  assert.equal((await api.send('/api/events', { event: 'png' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await api.send('/api/events', { event: 'png' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await api.request('/api/events', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: '{"event":"png"}' })).status, 415);
  assert.equal((await api.send('/api/events', { event: 'png', padding: 'x'.repeat(600) })).status, 413);
  assert.equal((await api.request('/api/admin/usage')).status, 401);
  const headers = await api.login();
  const report = await (await api.request('/api/admin/usage?from=2026-10-22&to=2026-10-23', { headers })).json();
  assert.equal(report.totals.png, 2); assert.equal(report.totals.gif, 1); assert.equal(report.totals.support_shown, 1); assert.equal(report.totals.support_kofi, 1); assert.equal(report.totals.support_trakteer, 0);
  assert.deepEqual(report.themes, [{ name: 'pastel', count: 2 }, { name: 'film', count: 1 }]);
  assert.deepEqual(report.filters, [{ name: 'normal', count: 1 }, { name: 'vintage', count: 1 }]);
  assert.deepEqual(report.daily.map(row => [row.date, row.png]), [['2026-10-22', 0], ['2026-10-23', 2]]);
  assert.equal((await api.request('/api/admin/usage?from=2026-10-23&to=2026-10-01', { headers })).status, 400);
  assert.equal((await api.request('/api/admin/usage?from=2024-01-01&to=2026-10-01', { headers })).status, 400);
});

test('stats CSV lists daily usage and active browsers and neutralizes formulas', async t => {
  const api = await fixture(t);
  await api.request('/api/visitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId: 'ca7c9a39-dc55-46c5-a091-09f2a1b6a8bb' }) });
  await api.send('/api/events', { event: 'png', theme: 'pastel' });
  assert.equal((await api.request('/api/admin/stats.csv')).status, 401);
  const headers = await api.login();
  const response = await api.request('/api/admin/stats.csv?from=2026-10-22&to=2026-10-23', { headers });
  assert.match(response.headers.get('content-type'), /text\/csv/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const lines = (await response.text()).replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[0], '"Tanggal (WIB)","Browser aktif","PNG diunduh","GIF diunduh","Popup dukungan tampil","Klik Trakteer","Klik Ko-fi"');
  assert.equal(lines[1], '"2026-10-22","0","0","0","0","0","0"');
  assert.equal(lines[2], '"2026-10-23","1","1","0","0","0","0"');
});

test('scheduled announcement is hidden outside its window and its schedule is not public', async t => {
  const api = await fixture(t);
  const headers = await api.login();
  const body = { enabled: true, title: 'Libur', message: 'Tutup sebentar', startsAt: '2026-10-23T07:00:00.000Z', endsAt: '2026-10-23T09:00:00.000Z' };
  assert.equal((await api.send('/api/admin/content', { ...body, endsAt: body.startsAt }, headers)).status, 400);
  assert.equal((await api.send('/api/admin/content', { ...body, startsAt: 'besok' }, headers)).status, 400);
  assert.equal((await api.send('/api/admin/content', body, headers)).status, 200);
  const publicNotice = async () => (await api.request('/api/site-content')).json();
  assert.equal((await publicNotice()).enabled, false);
  api.advance(2 * 3600000);
  const visible = await publicNotice();
  assert.equal(visible.enabled, true); assert.equal(visible.message, 'Tutup sebentar');
  assert.ok(!('startsAt' in visible) && !('endsAt' in visible));
  const later = await api.login(); // sesi admin kedaluwarsa setelah 30 menit tanpa aktivitas
  assert.equal((await (await api.request('/api/admin/content', { headers: later })).json()).visibleNow, true);
  api.advance(2 * 3600000);
  assert.equal((await publicNotice()).enabled, false);
  const admin = await (await api.request('/api/admin/content', { headers: await api.login() })).json();
  assert.equal(admin.visibleNow, false); assert.equal(admin.startsAt, body.startsAt);
});

test('traffic alert flags a sharp drop or spike only with a full week of history', () => {
  const day = 86400000, wib = 7 * 3600000;
  const now = Date.parse('2026-10-23T05:00:00Z');
  const todayStart = Math.floor((now + wib) / day) * day - wib;
  const build = (perDay, historyDays = 8) => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE visitors (visitor_hash TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT)');
    createAnalytics(db, () => now);
    const visitor = db.prepare('INSERT INTO visitors VALUES (?, ?, ?)'), activity = db.prepare('INSERT INTO visitor_activity VALUES (?, ?, ?)');
    for (let offset = historyDays; offset >= 1; offset--) {
      const start = todayStart - offset * day, count = perDay(offset);
      for (let i = 0; i < count; i++) {
        const hash = `v${offset}-${i}`, hour = utcTimestamp(start + 3600000 * 5).slice(0, 13) + ':00:00';
        visitor.run(hash, hour, hour); activity.run(hash, hour, hour);
      }
    }
    return db;
  };
  assert.equal(trafficAlert(build(offset => offset === 1 ? 5 : 100), now), 'traffic_drop');
  assert.equal(trafficAlert(build(offset => offset === 1 ? 400 : 100), now), 'traffic_spike');
  assert.equal(trafficAlert(build(() => 100), now), null);
  assert.equal(trafficAlert(build(offset => offset === 1 ? 1 : 10), now), null, 'small averages never alert as a drop');
  assert.equal(trafficAlert(build(offset => offset === 1 ? 5 : 100, 4), now), null, 'less than a week of history never alerts');
});
