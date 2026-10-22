import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { createAccountStore } from './admin-account.js';

export const SESSION_COOKIE = '__Host-snappie_cms';
const IDLE_TIMEOUT = 30 * 60 * 1000;
const ABSOLUTE_TIMEOUT = 8 * 60 * 60 * 1000;
const digest = value => createHash('sha256').update(value).digest('hex');

export function json(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

export async function readJson(request, limit = 1024) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
    throw Object.assign(new Error('JSON required'), { status: 415 });
  }
  let size = 0;
  const chunks = [];
  if (Number(request.headers['content-length']) > limit) {
    throw Object.assign(new Error('Request too large'), { status: 413 });
  }
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request too large'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

export function clientIp(request, trustProxy = false) {
  const remote = request.socket.remoteAddress || '';
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote);
  if (trustProxy && loopback) {
    // Caddy appends the actual peer after any client-supplied values.
    const forwarded = String(request.headers['x-forwarded-for'] || '').split(',').at(-1).trim();
    if (isIP(forwarded)) return forwarded;
  }
  return remote;
}

export function createRateLimiter({ now = Date.now, maxEntries = 10000 } = {}) {
  const buckets = new Map();
  return (key, limit, windowMs) => {
    const time = now();
    // Retain only short-lived hashes, never raw addresses.
    const hash = digest(key);
    let bucket = buckets.get(hash);
    if (!bucket || time >= bucket.until) {
      if (buckets.size >= maxEntries) {
        for (const [id, value] of buckets) if (time >= value.until) buckets.delete(id);
        if (buckets.size >= maxEntries) return Math.ceil(windowMs / 1000);
      }
      bucket = { count: 0, until: time + windowMs };
      buckets.set(hash, bucket);
    }
    bucket.count++;
    return bucket.count > limit ? Math.max(1, Math.ceil((bucket.until - time) / 1000)) : 0;
  };
}

function cookieToken(request) {
  const cookies = String(request.headers.cookie || '').split(';').map(part => part.trim());
  const matches = cookies.filter(part => part.startsWith(SESSION_COOKIE + '='));
  if (matches.length !== 1) return '';
  const token = matches[0].slice(SESSION_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
}

export function createAdminSecurity({ passwordHash = '', username = 'admin',
  accountPath, audit = () => {},
  allowedOrigins = ['https://snappiestudio.com', 'https://www.snappiestudio.com'],
  now = Date.now, trustProxy = false } = {}) {
  const sessions = new Map();
  const limit = createRateLimiter({ now });
  const account = createAccountStore({ path: accountPath, username, passwordHash, now });
  let checkingPasswords = 0;
  const origins = new Set(allowedOrigins);
  const sameOrigin = request => origins.has(request.headers.origin) && request.headers['sec-fetch-site'] !== 'cross-site';
  const clearCookie = response => response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  const session = (request, touch = true) => {
    const token = cookieToken(request);
    if (!token) return null;
    const id = digest(token);
    const value = sessions.get(id);
    if (!value) return null;
    if (now() - value.lastSeen >= IDLE_TIMEOUT || now() - value.created >= ABSOLUTE_TIMEOUT || value.authVersion !== account.read().authVersion) {
      sessions.delete(id);
      return null;
    }
    if (touch) value.lastSeen = now();
    return value;
  };
  const rejectRate = (response, retry) => {
    response.setHeader('Retry-After', String(retry));
    json(response, 429, { error: 'Too many requests. Try again later.' });
  };

  function issueSession(request, response) {
    const time = now();
    for (const [id, value] of sessions) {
      if (time - value.lastSeen >= IDLE_TIMEOUT || time - value.created >= ABSOLUTE_TIMEOUT || value.authVersion !== account.read().authVersion) sessions.delete(id);
    }
    if (sessions.size >= 100) { rejectRate(response, 60); return null; }
    const previous = cookieToken(request);
    if (previous) sessions.delete(digest(previous));
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    sessions.set(digest(token), { csrfToken, created: time, lastSeen: time, authVersion: account.read().authVersion, device: /Firefox/i.test(request.headers['user-agent'] || '') ? 'Firefox' : /Edg/i.test(request.headers['user-agent'] || '') ? 'Edge' : /Chrome/i.test(request.headers['user-agent'] || '') ? 'Chrome' : /Safari/i.test(request.headers['user-agent'] || '') ? 'Safari' : 'Browser / klien lain' });
    response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict`);
    return csrfToken;
  }

  async function verifyPassword(password, expectedVersion) {
    if (typeof password !== 'string' || !password || Buffer.byteLength(password) > 72 || checkingPasswords >= 2) return false;
    const state = account.read();
    if (state.authVersion !== expectedVersion) return false;
    checkingPasswords++;
    try {
      return await bcrypt.compare(password, state.passwordHash) && account.read().authVersion === expectedVersion;
    } finally { checkingPasswords--; }
  }

  async function reauthenticate(request, response, body) {
    const retry = limit('reauth:' + clientIp(request, trustProxy), 5, 15 * 60 * 1000)
      || limit('reauth-global', 30, 60 * 1000);
    if (retry || checkingPasswords >= 2) { rejectRate(response, retry || 5); return false; }
    const state = account.read();
    if (!await verifyPassword(body.currentPassword, state.authVersion) || account.read().authVersion !== state.authVersion || !account.consume(body.otp, now())) {
      json(response, 400, { error: 'Password atau kode 2FA tidak valid. Gunakan kode baru jika kode sebelumnya sudah dipakai.' });
      return false;
    }
    return true;
  }

  return {
    session,
    async login(request, response) {
      if (!sameOrigin(request)) { json(response, 403, { error: 'Forbidden origin' }); return; }
      if (!account.configured()) { json(response, 503, { error: 'Admin login unavailable' }); return; }
      const retry = limit('login:' + clientIp(request, trustProxy), 5, 15 * 60 * 1000)
        || limit('login-global', 30, 60 * 1000);
      if (retry || checkingPasswords >= 2) { rejectRate(response, retry || 5); return; }
      const { username: user, password, otp } = await readJson(request);
      if (typeof user !== 'string' || user.length > 80 || typeof password !== 'string' || !password || Buffer.byteLength(password) > 72) {
        json(response, 401, { error: 'Invalid credentials' }); return;
      }
      const state = account.read();
      if (!await verifyPassword(password, state.authVersion) || account.read().authVersion !== state.authVersion || user !== state.username) { audit('login_failed'); json(response, 401, { error: 'Invalid credentials' }); return; }
      if (state.totp && !otp) { json(response, 200, { mfaRequired: true }); return; }
      if (!account.consume(otp, now())) { audit('login_failed'); json(response, 401, { error: 'Invalid credentials' }); return; }
      // Invalidate any previous session supplied by this browser (fixation/rotation).
      const csrfToken = issueSession(request, response);
      if (!csrfToken) return;
      audit('login');
      json(response, 200, { csrfToken });
    },
    async settings(request, response, path) {
      if (request.method === 'GET' && path === '/api/admin/account') {
        const active = [...sessions.values()].filter(value => now() - value.lastSeen < IDLE_TIMEOUT && now() - value.created < ABSOLUTE_TIMEOUT && value.authVersion === account.read().authVersion).length;
        json(response, 200, { ...account.status(), activeSessions: active }); return;
      }
      if (request.method === 'GET' && path === '/api/admin/account/sessions') {
        const currentId = digest(cookieToken(request));
        const entries = [];
        for (const [id, value] of sessions) if (now() - value.lastSeen < IDLE_TIMEOUT && now() - value.created < ABSOLUTE_TIMEOUT && value.authVersion === account.read().authVersion) {
          entries.push({ id, current: id === currentId, device: value.device, createdAt: new Date(value.created).toISOString(), lastSeen: new Date(value.lastSeen).toISOString() });
        }
        json(response, 200, { sessions: entries }); return;
      }
      if (request.method !== 'POST') { json(response, 405, { error: 'Method not allowed' }); return; }
      if (!['/api/admin/account/sessions/revoke', '/api/admin/account/password', '/api/admin/account/logout-all', '/api/admin/account/mfa/setup', '/api/admin/account/mfa/enable', '/api/admin/account/mfa/disable', '/api/admin/account/mfa/recovery'].includes(path)) {
        json(response, 404, { error: 'Not found' }); return;
      }
      const body = await readJson(request, 2048);
      const current = session(request, false);
      if (!current) { json(response, 401, { error: 'Login required' }); return; }
      if (!await reauthenticate(request, response, body)) return;
      if (!session(request, false)) { json(response, 409, { error: 'Sesi berubah. Masuk kembali sebelum mencoba lagi.' }); return; }
      if (path === '/api/admin/account/sessions/revoke') {
        if (typeof body.id !== 'string' || !/^[a-f0-9]{64}$/.test(body.id) || !sessions.has(body.id)) { json(response, 404, { error: 'Sesi tidak ditemukan.' }); return; }
        if (body.id === digest(cookieToken(request))) { json(response, 400, { error: 'Gunakan tombol Keluar untuk sesi ini.' }); return; }
        sessions.delete(body.id); audit('session_revoked'); json(response, 200, { ok: true }); return;
      }
      if (path === '/api/admin/account/password') {
        const password = body.newPassword;
        if (typeof password !== 'string' || [...password].length < 12 || Buffer.byteLength(password) > 72 || password === body.currentPassword) {
          json(response, 400, { error: 'Password baru harus berbeda, minimal 12 karakter dan maksimal 72 byte.' }); return;
        }
        const version = account.read().authVersion;
        if (checkingPasswords >= 2) { rejectRate(response, 5); return; }
        checkingPasswords++;
        let hash;
        try { hash = await bcrypt.hash(password, 12); } finally { checkingPasswords--; }
        if (account.read().authVersion !== version || !session(request, false)) { json(response, 409, { error: 'Akun berubah. Masuk kembali sebelum mencoba lagi.' }); return; }
        account.changePassword(hash); audit('password_changed');
        sessions.clear(); clearCookie(response);
        json(response, 200, { ok: true, signedOut: true }); return;
      }
      if (path === '/api/admin/account/logout-all') {
        audit('logout_all');
        sessions.clear(); clearCookie(response);
        json(response, 200, { ok: true, signedOut: true }); return;
      }
      if (path === '/api/admin/account/mfa/setup') {
        if (account.status().mfaEnabled) { json(response, 409, { error: '2FA sudah aktif.' }); return; }
        const setup = account.prepare();
        current.enrollment = { secret: setup.secret, expires: now() + 10 * 60 * 1000, version: account.read().authVersion };
        const qrCode = await QRCode.toDataURL(setup.uri, { width: 240, margin: 2 });
        json(response, 200, { secret: setup.secret, qrCode }); return;
      }
      if (path === '/api/admin/account/mfa/enable') {
        const pending = current.enrollment;
        if (!pending || pending.expires <= now() || pending.version !== account.read().authVersion || account.status().mfaEnabled) {
          json(response, 400, { error: 'Pendaftaran 2FA kedaluwarsa. Mulai lagi.' }); return;
        }
        const counter = account.validateSetup(pending.secret, body.setupCode, now());
        if (counter === null) { json(response, 400, { error: 'Kode autentikator tidak valid. Periksa waktu perangkat dan coba kode baru.' }); return; }
        const recoveryCodes = account.enable(pending.secret, counter); audit('mfa_enabled');
        sessions.clear();
        const csrfToken = issueSession(request, response);
        json(response, 200, { ok: true, csrfToken, recoveryCodes }); return;
      }
      if (path === '/api/admin/account/mfa/disable' || path === '/api/admin/account/mfa/recovery') {
        if (!account.status().mfaEnabled) { json(response, 409, { error: '2FA belum aktif.' }); return; }
        let recoveryCodes;
        if (path.endsWith('/disable')) account.disable();
        else recoveryCodes = account.regenerate();
        audit(path.endsWith('/disable') ? 'mfa_disabled' : 'recovery_regenerated');
        sessions.clear();
        const csrfToken = issueSession(request, response);
        json(response, 200, { ok: true, csrfToken, ...(recoveryCodes ? { recoveryCodes } : {}) }); return;
      }
      json(response, 404, { error: 'Not found' });
    },
    authorize(request, response, write = false) {
      if (request.headers['sec-fetch-site'] === 'cross-site' || (request.headers.origin && !origins.has(request.headers.origin))) {
        json(response, 403, { error: 'Forbidden origin' }); return null;
      }
      const value = session(request, false);
      if (!value) { clearCookie(response); json(response, 401, { error: 'Login required' }); return null; }
      if (write) {
        const csrf = request.headers['x-csrf-token'];
        if (!sameOrigin(request) || typeof csrf !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(csrf)
          || !timingSafeEqual(Buffer.from(csrf), Buffer.from(value.csrfToken))) {
          json(response, 403, { error: 'Invalid CSRF token' }); return null;
        }
      }
      value.lastSeen = now();
      return value;
    },
    logout(request, response) {
      if (!this.authorize(request, response, true)) return;
      sessions.delete(digest(cookieToken(request))); audit('logout');
      clearCookie(response);
      json(response, 200, { ok: true });
    },
  };
}
