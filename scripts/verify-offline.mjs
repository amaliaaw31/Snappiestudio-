// Run with Chrome's --remote-debugging-port=9337 and a built site served over localhost (npm run preview):
//   node scripts/verify-offline.mjs [site URL]
import assert from 'node:assert/strict';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const endpoint = 'http://127.0.0.1:9337';
const target = await (await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0; const pending = new Map(), exceptions = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) { pending.get(message.id)(message); pending.delete(message.id); }
  else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise(resolve => { pending.set(++nextId, resolve); socket.send(JSON.stringify({ id: nextId, method, params })); });
const evaluate = async expression => {
  const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = async (expression, label) => { assert.equal(await evaluate(expression), true, label); console.log('PASS ' + label); };
const reload = async () => { await send('Page.reload'); await sleep(2500); };

try {
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Page.navigate', { url }); await sleep(2500);
  await evaluate("navigator.serviceWorker.ready.then(() => true)");
  await reload(); // laman kedua sudah dikendalikan service worker
  await check("!!navigator.serviceWorker.controller", 'service worker controls the page after installation');
  await check("(async () => { const keys = await caches.keys(); return keys.length === 1 && keys[0].startsWith('snappie-'); })()", 'one versioned Snappie cache exists');
  await check("(async () => { const cache = await caches.open((await caches.keys())[0]); const urls = (await cache.keys()).map(request => new URL(request.url).pathname); return ['/', '/manifest.webmanifest', '/site-notice.js'].every(path => urls.includes(path)) && urls.every(path => !/^\\/(api|cms)/.test(path)); })()", 'core files are cached and nothing from API or CMS');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await reload();
  await check("document.title.includes('Snappie') && !!document.querySelector('#btn-start') && !!document.querySelector('.faq') && document.fonts.status === 'loaded'", 'app opens offline from the cache with its content and fonts');
  await check("fetch('/api/visitors').then(() => false, () => true)", 'API requests are not served from the cache while offline');
  await check("fetch('/cms').then(() => false, () => true)", 'CMS pages are not served from the cache while offline');
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  assert.deepEqual(exceptions, []);
  console.log('PASS no uncaught browser exceptions');
} finally {
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await evaluate("navigator.serviceWorker.getRegistrations().then(list => Promise.all(list.map(item => item.unregister()))).then(() => caches.keys()).then(keys => Promise.all(keys.map(key => caches.delete(key))))").catch(() => {});
  socket.close();
  await fetch(`${endpoint}/json/close/${target.id}`);
}
