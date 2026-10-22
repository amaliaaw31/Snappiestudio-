import { createHash, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, openSync, fsyncSync, closeSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { TOTP, Secret } from 'otpauth';

export const validPasswordHash = value => typeof value === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
const digest = value => createHash('sha256').update(value).digest('hex');

export function writePrivateJson(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 });
    const file = openSync(temporary, 'r');
    try { fsyncSync(file); } finally { closeSync(file); }
    renameSync(temporary, path);
    const directory = openSync(dirname(path), 'r');
    try { fsyncSync(directory); } finally { closeSync(directory); }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function authenticator(secret, username) {
  return new TOTP({ issuer: 'Snappie Studio', label: username, algorithm: 'SHA1', digits: 6, period: 30, secret });
}

export function decryptTotp(value, key) {
  const [iv, tag, data] = value.split('.').map(part => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function validateAccount(value) {
  if (value?.schema !== 1 || typeof value.username !== 'string' || !value.username || value.username.length > 80
    || !validPasswordHash(value.passwordHash) || !Number.isSafeInteger(value.authVersion) || value.authVersion < 0
    || !Number.isSafeInteger(value.lastCounter) || value.lastCounter < -1
    || !(value.totp === null || typeof value.totp === 'string')
    || !Array.isArray(value.recoveryHashes) || value.recoveryHashes.length > 10
    || !value.recoveryHashes.every(hash => /^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('Invalid private account state');
  }
  return value;
}

export function createAccountStore({ path, username = 'admin', passwordHash = '', now = Date.now } = {}) {
  let key;
  let state = { schema: 1, username, passwordHash, authVersion: 0, totp: null, lastCounter: -1, recoveryHashes: [], updatedAt: new Date(now()).toISOString() };
  if (path && existsSync(path)) state = validateAccount(JSON.parse(readFileSync(path, 'utf8')));
  const configured = () => validPasswordHash(state.passwordHash);
  if (path && configured()) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const keyPath = join(dirname(path), 'cms-key.bin');
    if (!existsSync(path) && existsSync(keyPath)) throw new Error('Missing private account state; restore its backup');
    if (!existsSync(path)) writePrivateJson(path, state);
    if (existsSync(keyPath)) key = readFileSync(keyPath);
    else {
      if (state.totp) throw new Error('Missing private account encryption key');
      key = randomBytes(32);
      writeFileSync(keyPath, key, { flag: 'wx', mode: 0o600 });
    }
    if (key.length !== 32) throw new Error('Invalid private account encryption key');
    if (state.totp) authenticator(decryptTotp(state.totp, key), state.username);
  } else key = randomBytes(32);

  function update(changes) {
    const next = validateAccount({ ...state, ...changes, updatedAt: new Date(now()).toISOString() });
    if (path) writePrivateJson(path, next);
    state = next;
  }
  const codes = () => Array.from({ length: 10 }, () => randomBytes(12).toString('hex').match(/.{6}/g).join('-'));
  return {
    configured,
    read: () => ({ ...state, recoveryHashes: [...state.recoveryHashes] }),
    status: () => ({ username: state.username, mfaEnabled: !!state.totp, recoveryCodesRemaining: state.recoveryHashes.length }),
    prepare() {
      const secret = new Secret({ size: 20 }).base32;
      return { secret, uri: authenticator(secret, state.username).toString() };
    },
    validateSetup(secret, token, timestamp) {
      if (typeof token !== 'string' || !/^\d{6}$/.test(token)) return null;
      const delta = authenticator(secret, state.username).validate({ token, timestamp, window: 1 });
      return delta === null ? null : Math.floor(timestamp / 30000) + delta;
    },
    enable(secret, counter) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
      const recoveryCodes = codes();
      update({ totp: [iv, cipher.getAuthTag(), data].map(part => part.toString('base64')).join('.'),
        lastCounter: counter, recoveryHashes: recoveryCodes.map(code => digest(code.replaceAll('-', ''))), authVersion: state.authVersion + 1 });
      return recoveryCodes;
    },
    consume(token, timestamp) {
      if (!state.totp) return true;
      if (typeof token !== 'string') return false;
      const normalized = token.trim().replaceAll('-', '').toLowerCase();
      if (/^[a-f0-9]{24}$/.test(normalized)) {
        const hash = Buffer.from(digest(normalized), 'hex');
        const index = state.recoveryHashes.findIndex(value => timingSafeEqual(hash, Buffer.from(value, 'hex')));
        if (index < 0) return false;
        update({ recoveryHashes: state.recoveryHashes.filter((_, i) => i !== index) });
        return true;
      }
      const counter = this.validateSetup(decryptTotp(state.totp, key), token.trim(), timestamp);
      if (counter === null || counter <= state.lastCounter) return false;
      update({ lastCounter: counter });
      return true;
    },
    disable() { update({ totp: null, lastCounter: -1, recoveryHashes: [], authVersion: state.authVersion + 1 }); },
    changePassword(hash) { update({ passwordHash: hash, authVersion: state.authVersion + 1 }); },
    regenerate() {
      const recoveryCodes = codes();
      update({ recoveryHashes: recoveryCodes.map(code => digest(code.replaceAll('-', ''))), authVersion: state.authVersion + 1 });
      return recoveryCodes;
    },
  };
}
