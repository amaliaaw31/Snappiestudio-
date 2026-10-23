import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { existsSync, readFileSync } from 'node:fs';

const template = readFileSync(new URL('../src/sw.template.js', import.meta.url), 'utf8');
const load = (source, fetchImpl) => {
  const stores = new Map(), listeners = {};
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return { match: async request => store.get(typeof request === 'string' ? request : request.url)?.clone(),
        put: async (request, response) => { store.set(typeof request === 'string' ? request : request.url, response); },
        addAll: async requests => { for (const request of requests) store.set(request.url, await fetchImpl(request)); } };
    },
    keys: async () => [...stores.keys()], delete: async name => stores.delete(name),
  };
  const self = { location: new URL('https://snappiestudio.com/sw.js'), addEventListener: (type, listener) => { listeners[type] = listener; },
    skipWaiting: async () => {}, clients: { claim: async () => {} } };
  // Di browser URL relatif pada Request mengikuti lokasi worker; Node mewajibkan URL absolut.
  class WorkerRequest extends Request { constructor(input, init) { super(new URL(input, self.location).href, init); } }
  vm.runInNewContext(source, { self, caches, fetch: fetchImpl, Request: WorkerRequest, URL, AbortSignal });
  const request = (path, { method = 'GET', mode = 'cors', headers = {}, origin = 'https://snappiestudio.com' } = {}) => ({ method, mode, url: origin + path, headers: new Headers(headers) });
  const fetchEvent = (path, options) => { const event = { request: request(path, options), respondWith(promise) { this.response = promise; } }; listeners.fetch(event); return event; };
  const waitUntil = type => { let work; listeners[type]({ waitUntil: promise => { work = promise; } }); return work; };
  return { stores, fetchEvent, waitUntil };
};
const source = template.replace('__BUILD__', 'test').replace('__PRECACHE__', JSON.stringify(['./', './style.css']));
const ok = (body = 'ok', headers = {}) => new Response(body, { headers });

test('service worker never touches API, CMS, other origins, writes, ranges or itself', async () => {
  let calls = 0;
  const worker = load(source, async () => { calls++; return ok(); });
  for (const [path, options] of [['/api/visitors'], ['/api'], ['/api/admin/report'], ['/cms'], ['/cms/dashboard', { mode: 'navigate' }], ['/cms-dashboard.html'], ['/cms.css'], ['/cms-tools.js'],
    ['/sw.js'], ['/', { method: 'POST' }], ['/font.ttf', { headers: { Range: 'bytes=0-9' } }], ['/x.png', { origin: 'https://evil.example' }], ['/other-page', { mode: 'navigate' }]]) {
    assert.equal(worker.fetchEvent(path, options).response, undefined, path);
  }
  assert.equal(calls, 0);
});

test('home page is network first with an offline fallback, and no-store responses are never kept', async () => {
  let online = true, headers = {};
  const worker = load(source, async () => { if (!online) throw new Error('offline'); return ok('fresh', headers); });
  assert.equal(await (await worker.fetchEvent('/', { mode: 'navigate' }).response).text(), 'fresh');
  online = false;
  assert.equal(await (await worker.fetchEvent('/?utm=x', { mode: 'navigate' }).response).text(), 'fresh', 'offline serves the saved home page');
  const empty = load(source, async () => { if (!online) throw new Error('offline'); return ok('secret', { 'Cache-Control': 'no-store' }); });
  online = true; await empty.fetchEvent('/', { mode: 'navigate' }).response; online = false;
  await assert.rejects(empty.fetchEvent('/', { mode: 'navigate' }).response, /offline/);
});

test('static assets are served from cache while refreshing in the background', async () => {
  let version = 'v1', online = true;
  const worker = load(source, async () => { if (!online) throw new Error('offline'); return ok(version); });
  assert.equal(await (await worker.fetchEvent('/font.ttf').response).text(), 'v1');
  version = 'v2';
  assert.equal(await (await worker.fetchEvent('/font.ttf').response).text(), 'v1', 'cached copy is returned first');
  await new Promise(resolve => setTimeout(resolve, 20));
  online = false;
  assert.equal(await (await worker.fetchEvent('/font.ttf').response).text(), 'v2', 'background refresh updated the cache');
  await assert.rejects(worker.fetchEvent('/never-cached.png').response, /offline/);
});

test('install precaches the core list and activation removes only old Snappie caches', async () => {
  const worker = load(source, async () => ok());
  await worker.waitUntil('install');
  assert.deepEqual([...worker.stores.get('snappie-test').keys()].sort(), ['https://snappiestudio.com/', 'https://snappiestudio.com/style.css']);
  worker.stores.set('snappie-old', new Map()); worker.stores.set('someone-else', new Map());
  await worker.waitUntil('activate');
  assert.deepEqual([...worker.stores.keys()].sort(), ['snappie-test', 'someone-else']);
});

test('built service worker only precaches files that exist in dist', t => {
  if (!existsSync(new URL('../dist/sw.js', import.meta.url))) { t.skip('dist not built'); return; }
  const built = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
  assert.ok(!built.includes('__BUILD__') && !built.includes('__PRECACHE__'));
  const list = JSON.parse(/const PRECACHE = (\[.*?\]);/.exec(built)[1]);
  assert.ok(list.length >= 8);
  for (const path of list) {
    const file = path === './' ? 'index.html' : path.slice(2);
    assert.ok(existsSync(new URL('../dist/' + file, import.meta.url)), path);
    assert.ok(!/cms|api/.test(path), 'no CMS or API paths');
  }
});
