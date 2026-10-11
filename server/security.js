import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import bcrypt from 'bcryptjs';

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
  allowedOrigins = ['https://snappiestudio.com', 'https://www.snappiestudio.com'],
  now = Date.now, trustProxy = false } = {}) {
  const sessions = new Map();
  const limit = createRateLimiter({ now });
  const configured = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash);
  let checkingPasswords = 0;
  const origins = new Set(allowedOrigins);
  const sameOrigin = request => origins.has(request.headers.origin) && request.headers['sec-fetch-site'] !== 'cross-site';
  const clearCookie = response => response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  const session = request => {
    const token = cookieToken(request);
    if (!token) return null;
    const id = digest(token);
    const value = sessions.get(id);
    if (!value) return null;
    if (now() - value.lastSeen >= IDLE_TIMEOUT || now() - value.created >= ABSOLUTE_TIMEOUT) {
      sessions.delete(id);
      return null;
    }
    value.lastSeen = now();
    return value;
  };
  const rejectRate = (response, retry) => {
    response.setHeader('Retry-After', String(retry));
    json(response, 429, { error: 'Too many requests. Try again later.' });
  };

  return {
    session,
    async login(request, response) {
      if (!sameOrigin(request)) { json(response, 403, { error: 'Forbidden origin' }); return; }
      if (!configured) { json(response, 503, { error: 'Admin login unavailable' }); return; }
      const retry = limit('login:' + clientIp(request, trustProxy), 5, 15 * 60 * 1000)
        || limit('login-global', 30, 60 * 1000);
      if (retry || checkingPasswords >= 2) { rejectRate(response, retry || 5); return; }
      const { username: user, password } = await readJson(request);
      if (typeof user !== 'string' || user.length > 80 || typeof password !== 'string' || !password || Buffer.byteLength(password) > 72) {
        json(response, 401, { error: 'Invalid credentials' }); return;
      }
      if (checkingPasswords >= 2) { rejectRate(response, 5); return; }
      checkingPasswords++;
      let valid;
      try { valid = await bcrypt.compare(password, passwordHash); }
      finally { checkingPasswords--; }
      if (!valid || user !== username) { json(response, 401, { error: 'Invalid credentials' }); return; }
      const time = now();
      for (const [id, value] of sessions) {
        if (time - value.lastSeen >= IDLE_TIMEOUT || time - value.created >= ABSOLUTE_TIMEOUT) sessions.delete(id);
      }
      if (sessions.size >= 100) { rejectRate(response, 60); return; }
      // Invalidate any previous session supplied by this browser (fixation/rotation).
      const previous = cookieToken(request);
      if (previous) sessions.delete(digest(previous));
      const token = randomBytes(32).toString('base64url');
      const csrfToken = randomBytes(32).toString('base64url');
      sessions.set(digest(token), { csrfToken, created: time, lastSeen: time });
      response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict`);
      json(response, 200, { csrfToken });
    },
    authorize(request, response, write = false) {
      if (request.headers['sec-fetch-site'] === 'cross-site' || (request.headers.origin && !origins.has(request.headers.origin))) {
        json(response, 403, { error: 'Forbidden origin' }); return null;
      }
      const value = session(request);
      if (!value) { clearCookie(response); json(response, 401, { error: 'Login required' }); return null; }
      if (write) {
        const csrf = request.headers['x-csrf-token'];
        if (!sameOrigin(request) || typeof csrf !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(csrf)
          || !timingSafeEqual(Buffer.from(csrf), Buffer.from(value.csrfToken))) {
          json(response, 403, { error: 'Invalid CSRF token' }); return null;
        }
      }
      return value;
    },
    logout(request, response) {
      if (!this.authorize(request, response, true)) return;
      sessions.delete(digest(cookieToken(request)));
      clearCookie(response);
      json(response, 200, { ok: true });
    },
  };
}
