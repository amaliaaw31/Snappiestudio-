import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, readFile, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { createVisitorServer } from '../server/visitor-counter.js';
import { createAccountStore, authenticator } from '../server/admin-account.js';

const origin = 'https://snappiestudio.com';
const password = 'account-test-password';
const newPassword = 'different-account-password';
const passwordHash = bcrypt.hashSync(password, 4);

async function app(t) {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-account-'));
  let time = Date.parse('2026-10-22T12:00:00Z');
  let server;
  let base;
  async function start() {
    server = createVisitorServer({ dbPath: join(directory, 'visitors.sqlite'), now: () => time,
      admin: { username: 'admin', passwordHash, allowedOrigins: [origin] } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  }
  await start();
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const request = (path, options = {}) => fetch(base + path, { redirect: 'manual', ...options });
  const login = (otp, value = password) => request('/api/admin/login', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: value, otp }) });
  const auth = async response => {
    assert.equal(response.status, 200);
    const data = await response.json();
    return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: data.csrfToken, data };
  };
  const post = (session, path, body) => request('/api/admin/account/' + path, { method: 'POST',
    headers: { Cookie: session.cookie, Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf }, body: JSON.stringify(body) });
  const get = (session, path = '/api/admin/session') => request(path, { headers: { Cookie: session.cookie } });
  return { directory, request, login, auth, post, get, now: () => time, advance: ms => { time += ms; },
    restart: async () => { await new Promise(resolve => server.close(resolve)); await start(); } };
}

async function enroll(api, session) {
  const setup = await api.post(session, 'mfa/setup', { currentPassword: password });
  assert.equal(setup.status, 200);
  const data = await setup.json();
  assert.match(data.qrCode, /^data:image\/png;base64,/);
  const token = authenticator(data.secret, 'admin').generate({ timestamp: api.now() });
  const enabled = await api.auth(await api.post(session, 'mfa/enable', { currentPassword: password, setupCode: token }));
  return { session: enabled, secret: data.secret, recovery: enabled.data.recoveryCodes };
}

test('account settings require session, CSRF and current password, without returning private state', async t => {
  const api = await app(t);
  assert.equal((await api.request('/api/admin/account')).status, 401);
  const session = await api.auth(await api.login());
  const raw = await (await api.get(session, '/api/admin/account')).text();
  assert.doesNotMatch(raw, /passwordHash|totp|recoveryHashes|\$2[aby]\$/);
  assert.equal(JSON.parse(raw).mfaEnabled, false);
  assert.equal((await api.post({ ...session, csrf: '' }, 'mfa/setup', { currentPassword: password })).status, 403);
  assert.equal((await api.post(session, 'mfa/setup', { currentPassword: 'wrong' })).status, 400);
  assert.equal((await api.post(session, 'password', { currentPassword: password, newPassword: 'short' })).status, 400);
  assert.equal((await api.post(session, 'password', { currentPassword: password, newPassword: password })).status, 400);
});

test('password changes revoke every session and survive restart with the original bootstrap configuration', async t => {
  const api = await app(t);
  const first = await api.auth(await api.login());
  const second = await api.auth(await api.login());
  assert.equal((await api.post(first, 'password', { currentPassword: password, newPassword })).status, 200);
  assert.equal((await api.get(first)).status, 401);
  assert.equal((await api.get(second)).status, 401);
  assert.equal((await api.login()).status, 401);
  await api.restart();
  assert.equal((await api.login(undefined, newPassword)).status, 200);
  assert.equal((await stat(join(api.directory, 'cms-account.json'))).mode & 0o777, 0o600);
  assert.equal((await stat(join(api.directory, 'cms-key.bin'))).mode & 0o777, 0o600);
  const stored = await readFile(join(api.directory, 'cms-account.json'), 'utf8');
  assert.ok(!stored.includes(newPassword) && !stored.includes(password));
});

test('logout-all requires reauthentication and revokes other browsers as well as the current one', async t => {
  const api = await app(t);
  const first = await api.auth(await api.login());
  const second = await api.auth(await api.login());
  assert.equal((await api.post(first, 'logout-all', { currentPassword: 'wrong' })).status, 400);
  assert.equal((await api.get(second)).status, 200);
  assert.equal((await api.post(first, 'logout-all', { currentPassword: password })).status, 200);
  assert.equal((await api.get(first)).status, 401);
  assert.equal((await api.get(second)).status, 401);
});

test('2FA enrollment confirms possession, encrypts its seed, rotates sessions and rejects TOTP replay', async t => {
  const api = await app(t);
  const first = await api.auth(await api.login());
  const other = await api.auth(await api.login());
  const { secret, recovery, session } = await enroll(api, first);
  assert.equal(recovery.length, 10);
  assert.equal((await api.get(first)).status, 401);
  assert.equal((await api.get(other)).status, 401);
  assert.equal((await api.get(session)).status, 200);
  const state = await readFile(join(api.directory, 'cms-account.json'), 'utf8');
  assert.ok(!state.includes(secret) && recovery.every(code => !state.includes(code) && !state.includes(code.replaceAll('-', ''))));
  const challenge = await api.login();
  assert.equal(challenge.headers.get('set-cookie'), null);
  assert.deepEqual(await challenge.json(), { mfaRequired: true });
  api.advance(30000);
  const token = authenticator(secret, 'admin').generate({ timestamp: api.now() });
  assert.equal((await api.login(token)).status, 200);
  assert.equal((await api.login(token)).status, 401);
});

test('recovery codes work once, persist consumed state after restart, and permit a safe MFA disable', async t => {
  const api = await app(t);
  const first = await api.auth(await api.login());
  const { recovery } = await enroll(api, first);
  const recovered = await api.auth(await api.login(recovery[0]));
  assert.equal((await api.login(recovery[0])).status, 401);
  assert.equal((await (await api.get(recovered, '/api/admin/account')).json()).recoveryCodesRemaining, 9);
  await api.restart();
  assert.equal((await api.login(recovery[0])).status, 401);
  const session = await api.auth(await api.login(recovery[1]));
  const disabled = await api.auth(await api.post(session, 'mfa/disable', { currentPassword: password, otp: recovery[2] }));
  assert.equal((await (await api.get(disabled, '/api/admin/account')).json()).mfaEnabled, false);
  assert.equal((await api.login()).status, 200);
});

test('regenerating recovery codes invalidates the previous set', async t => {
  const api = await app(t);
  const first = await api.auth(await api.login());
  const { recovery, session } = await enroll(api, first);
  const regenerated = await api.auth(await api.post(session, 'mfa/recovery', { currentPassword: password, otp: recovery[0] }));
  assert.equal((await api.login(recovery[1])).status, 401);
  assert.equal((await api.login(regenerated.data.recoveryCodes[0])).status, 200);
});

test('expired MFA enrollment cannot be confirmed', async t => {
  const api = await app(t);
  const first = await api.auth(await api.login());
  const setup = await (await api.post(first, 'mfa/setup', { currentPassword: password })).json();
  api.advance(11 * 60000);
  const token = authenticator(setup.secret, 'admin').generate({ timestamp: api.now() });
  assert.equal((await api.post(first, 'mfa/enable', { currentPassword: password, setupCode: token })).status, 400);
  assert.equal((await (await api.get(first, '/api/admin/account')).json()).mfaEnabled, false);
});

test('deleting account state does not silently restore the old bootstrap password', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-account-loss-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'cms-account.json');
  createAccountStore({ path, username: 'admin', passwordHash });
  await unlink(path);
  assert.throws(() => createAccountStore({ path, username: 'admin', passwordHash }), /Missing private account state/);
});
