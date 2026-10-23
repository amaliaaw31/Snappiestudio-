import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { DatabaseSync } from 'node:sqlite';
import { createVisitorServer } from '../server/visitor-counter.js';
import { backupSite } from '../scripts/maintenance.mjs';
import { encryptArchive, decryptArchive, uploadOffsite, generateReports, checkMonitor } from '../scripts/cms-jobs.mjs';

const origin = 'https://snappiestudio.com';
const password = 'cms-expansion-test-password';
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-expansion-'));
  let time = Date.parse('2026-10-22T12:00:00Z');
  let province = 'West Java';
  const dbPath = join(directory, 'visitors.sqlite');
  const server = createVisitorServer({ dbPath, now: () => time, locate: () => ({ country: 'Indonesia', countryCode: 'ID', province, city: 'Bandung' }), admin: { passwordHash: bcrypt.hashSync(password, 4), allowedOrigins: [origin] } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = (path, options) => fetch(base + path, options);
  const login = async (value = password) => {
    const response = await request('/api/admin/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: value }) });
    if (!response.ok) return response;
    return { Cookie: response.headers.get('set-cookie').split(';')[0], Origin: origin, 'X-CSRF-Token': (await response.json()).csrfToken };
  };
  return { directory, dbPath, request, login, now: () => time, advance: ms => { time += ms; },
    post: (headers, path, body) => request(path, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    visit: (id, region = 'West Java') => { province = region; return request('/api/visitors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId: id }) }); } };
}
const first = 'ca7c9a39-dc55-46c5-a091-09f2a1b6a8bb';
const second = 'ca7c9a39-dc55-46c5-a091-09f2a1b6a8bc';

test('province selection applies exactly to report, comparison, CSV and new/returning browsers', async t => {
  const api = await fixture(t); await api.visit(first); api.advance(86400000); await api.visit(first); await api.visit(second, 'East Java');
  const headers = await api.login();
  const report = await (await api.request('/api/admin/report?from=2026-10-23&to=2026-10-23&province=West+Java', { headers })).json();
  assert.equal(report.visitors.total, 1); assert.equal(report.comparison.current, 1);
  assert.equal(report.insights.newBrowsers, 0); assert.equal(report.insights.returningBrowsers, 1);
  assert.deepEqual(report.insights.trend, [{ date: '2026-10-23', newBrowsers: 0, returningBrowsers: 1 }]);
  assert.deepEqual(report.provinces, ['East Java', 'West Java']);
  assert.equal(report.insights.calendar.days.length, 31);
  assert.equal(report.insights.calendar.days.find(day => day.date === '2026-10-23').count, 1);
  const csv = await (await api.request('/api/admin/export.csv?province=West+Java', { headers })).text();
  assert.match(csv, /West Java/); assert.doesNotMatch(csv, /East Java/);
});

test('audit and device sessions require auth, hide credentials, allow reauthenticated revocation and survive database reopen', async t => {
  const api = await fixture(t);
  assert.equal((await api.request('/api/admin/audit')).status, 401);
  await api.login('incorrect'); const one = await api.login(); const two = await api.login();
  const sessions = await (await api.request('/api/admin/account/sessions', { headers: one })).json();
  assert.equal(sessions.sessions.length, 2);
  const other = sessions.sessions.find(value => !value.current);
  assert.doesNotMatch(JSON.stringify(sessions), /csrf|snappie_cms|passwordHash/);
  assert.equal((await api.post(one, '/api/admin/account/sessions/revoke', { id: other.id, currentPassword: 'wrong' })).status, 400);
  assert.equal((await api.post(one, '/api/admin/account/sessions/revoke', { id: other.id, currentPassword: password })).status, 200);
  assert.equal((await api.request('/api/admin/session', { headers: two })).status, 401);
  assert.equal((await api.request('/api/admin/session', { headers: one })).status, 200);
  const raw = await (await api.request('/api/admin/audit', { headers: one })).text();
  assert.match(raw, /login_failed/); assert.match(raw, /session_revoked/); assert.doesNotMatch(raw, /incorrect|cms-expansion-test-password|127\.0\.0\.1/);
  const db = new DatabaseSync(api.dbPath, { readOnly: true });
  try { assert.ok(db.prepare('SELECT COUNT(*) AS count FROM cms_audit').get().count >= 4); } finally { db.close(); }
});

test('reset requires exact typed confirmation and preserves audit and exclusions', async t => {
  const api = await fixture(t); await api.visit(first); const headers = await api.login();
  assert.equal((await api.post(headers, '/api/admin/reset', { confirmation: 'RESET' })).status, 400);
  assert.equal((await (await api.request('/api/visitors')).json()).total, 1);
  assert.equal((await api.post(headers, '/api/admin/reset', { confirmation: 'RESET KUNJUNGAN' })).status, 200);
  assert.equal((await (await api.request('/api/visitors')).json()).total, 0);
  assert.match(await (await api.request('/api/admin/audit', { headers })).text(), /visitors_reset/);
});

test('site announcement stores bounded plain text and health data stays private', async t => {
  const api = await fixture(t); const headers = await api.login();
  assert.equal((await api.request('/api/admin/health')).status, 401);
  const content = { enabled: true, title: '<img src=x>', message: '<script>alert(1)</script>' };
  assert.equal((await api.post(headers, '/api/admin/content', content)).status, 200);
  const publicContent = await (await api.request('/api/site-content')).json(); assert.equal(publicContent.message, content.message);
  assert.equal((await api.post(headers, '/api/admin/content', { ...content, message: 'x'.repeat(501) })).status, 400);
  assert.equal((await api.post({ ...headers, 'X-CSRF-Token': '' }, '/api/admin/content', content)).status, 403);
  const health = await (await api.request('/api/admin/health', { headers })).json();
  assert.equal(health.databaseOk, true); assert.ok(health.storageFreeBytes > 0); assert.doesNotMatch(JSON.stringify(health), /passwordHash|\/var\/lib|cms-key/);
});

test('weekly/monthly archive is idempotent and uses completed WIB periods', async t => {
  const api = await fixture(t); const headers = await api.login();
  generateReports(api.dbPath, api.now); generateReports(api.dbPath, api.now);
  const data = await (await api.request('/api/admin/reports', { headers })).json();
  assert.equal(data.reports.length, 2);
  const weekly = data.reports.find(value => value.type === 'mingguan');
  assert.equal(weekly.from, '2026-10-12'); assert.equal(weekly.to, '2026-10-18');
  assert.equal(data.reports.find(value => value.type === 'bulanan').to, '2026-09-30');
});

test('offsite archive authenticates encryption, rejects tampering and uploads only ciphertext with host checking', async t => {
  const api = await fixture(t); await api.visit(first);
  const source = join(api.directory, 'plain'); const cipher = join(api.directory, 'cipher'); const restored = join(api.directory, 'restored');
  const key = Buffer.alloc(32, 17); await writeFile(source, 'private account state'); await encryptArchive(source, cipher, key);
  assert.ok(!(await readFile(cipher)).includes(Buffer.from('private account state')));
  await decryptArchive(cipher, restored, key); assert.equal(await readFile(restored, 'utf8'), 'private account state');
  const tampered = await readFile(cipher); tampered[20] ^= 1; await writeFile(cipher, tampered);
  await assert.rejects(decryptArchive(cipher, join(api.directory, 'bad-output'), key));
  assert.ok(!(await readdir(api.directory)).some(name => name.includes('bad-output')));
  const snapshot = await backupSite({ stateDirectory: api.directory, backupDirectory: join(api.directory, 'snapshots'), configurationDirectory: join(api.directory, 'no-config') });
  const keyFile = join(api.directory, 'offsite.key'); await writeFile(keyFile, key);
  let uploaded = false;
  const execute = async (command, args) => {
    if (command === 'tar') execFileSync(command, args);
    else { assert.equal(command, 'scp'); assert.ok(args.includes('-oStrictHostKeyChecking=yes')); assert.ok(args.at(-2).endsWith('.tar.enc')); uploaded = true; }
  };
  await uploadOffsite(snapshot, api.directory, { CMS_OFFSITE_DESTINATION: 'backup@example.invalid:/snapshots', CMS_OFFSITE_SSH_KEY: '/private/test-key', CMS_BACKUP_KEY_FILE: keyFile }, execute);
  assert.equal(uploaded, true);
  assert.equal(JSON.parse(await readFile(join(api.directory, 'offsite-status.json'))).ok, true);
  await assert.rejects(uploadOffsite(snapshot, api.directory, { CMS_OFFSITE_DESTINATION: 'bad;command' }, execute));
});

test('monitor retries failed notifications, suppresses repeats, and sends recovery only after an incident', async t => {
  const api = await fixture(t); let down = true, reject = true; const notices = [];
  const fetchMock = async (url, options) => {
    if (!options?.method) return new Response('', { status: down ? 503 : 200 });
    notices.push(JSON.parse(options.body)); return new Response('', { status: reject ? 500 : 200 });
  };
  for (const name of ['backup', 'geoip']) await writeFile(join(api.directory, name + '-status.json'), JSON.stringify({ ok: true, lastSuccess: new Date(api.now()).toISOString(), restoreVerifiedAt: new Date(api.now()).toISOString() }));
  const check = () => checkMonitor(api.directory, { CMS_ALERT_WEBHOOK: 'https://example.invalid/notify' }, fetchMock, api.now, () => {}, { backupDirectory: api.directory });
  assert.equal((await check()).notificationOk, false); reject = false;
  await check(); assert.equal(notices.length, 1); api.advance(15 * 60000);
  assert.equal((await check()).notificationOk, true); await check(); assert.equal(notices.length, 2);
  down = false; assert.equal((await check()).ok, true); assert.equal(notices.length, 3); assert.deepEqual(notices.at(-1).issues, []);
});


test('scheduled backup CLI completes without a circular module wait and records unconfigured offsite truthfully', async t => {
  const api = await fixture(t);
  const result = execFileSync(process.execPath, ['scripts/maintenance.mjs', 'backup'], { encoding: 'utf8', timeout: 10000,
    env: { ...process.env, VISITOR_DB_PATH: api.dbPath, CMS_BACKUP_DIRECTORY: join(api.directory, 'cli-backups'), CMS_CONFIGURATION_DIRECTORY: join(api.directory, 'empty-config'), CMS_OFFSITE_DESTINATION: '' } });
  assert.match(result, /Backup and restore verification completed/);
  assert.equal(JSON.parse(await readFile(join(api.directory, 'offsite-status.json'))).configured, false);
});
