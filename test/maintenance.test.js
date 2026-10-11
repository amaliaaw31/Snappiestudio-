import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('async function updateVisitorCount()'), source.indexOf('\nupdateVisitorCount();'));

test('maintenance browser displays totals without registering a visit', async () => {
  const requests = [];
  const display = {};
  const context = vm.createContext({
    document: { querySelectorAll: () => [display] },
    localStorage: { getItem: key => key === 'snappie-maintenance' ? '1' : 'existing-id' },
    window: { fetch: async (url, options) => {
      requests.push({ url, options }); return { ok: true, json: async () => ({ total: 23 }) };
    } },
    Intl, getLang: () => 'id',
  });
  vm.runInContext(code, context);
  await context.updateVisitorCount();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/visitors');
  assert.equal(requests[0].options.method, undefined);
  assert.equal(requests[0].options.body, undefined);
  assert.equal(display.textContent, '23');
});
