import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeConfig, DEFAULT_SUPPORT } from '../src/site-config.js';

test('unknown or hostile server responses fall back to safe defaults', () => {
  assert.deepEqual(sanitizeConfig({ total: 0 }), { seasons: {}, support: DEFAULT_SUPPORT });
  assert.deepEqual(sanitizeConfig(null), { seasons: {}, support: DEFAULT_SUPPORT });
  const hostile = sanitizeConfig({ seasons: { natal: { mode: 'nuke' }, 'BAD ID': { mode: 'on' }, paskah: { mode: 'auto', from: 'x', to: 'y' } },
    support: { enabled: true, trakteerUrl: 'https://evil.example/x', kofiUrl: 'javascript:alert(1)' } });
  assert.deepEqual(hostile.seasons, { paskah: { mode: 'auto' } });
  assert.deepEqual(hostile.support, { enabled: true, trakteerUrl: '', kofiUrl: '' });
});

test('valid server config is kept', () => {
  const value = { seasons: { imlek: { mode: 'auto', from: '2027-02-01', to: '2027-02-20' }, natal: { mode: 'off' } },
    support: { enabled: false, trakteerUrl: 'https://trakteer.id/a', kofiUrl: 'https://ko-fi.com/b' } };
  assert.deepEqual(sanitizeConfig(value), value);
});
