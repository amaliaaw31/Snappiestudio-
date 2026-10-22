import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { websiteStatus } from '../server/discord-status.js';

test('status reports HTTP failures and invalid payloads without leaking response content or exceptions', async () => {
  const result = await websiteStatus(async (url, options) => {
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    if (url.endsWith('/')) return new Response('secret-server-error', { status: 503 });
    if (url.endsWith('/api/visitors')) return Response.json({ total: 'secret-password' });
    throw new Error('sensitive-token-and-environment');
  });
  assert.match(result, /Website: GANGGUAN \(HTTP 503\)/);
  assert.match(result, /API pengunjung: tidak dapat diverifikasi/);
  assert.match(result, /API pengumuman: tidak dapat diverifikasi/);
  assert.doesNotMatch(result, /secret|sensitive|password|token/);
});

test('status rejects redirects, wrong content types, oversized and malformed responses', async () => {
  for (const response of [
    () => new Response(null, { status: 302, headers: { Location: 'http://localhost/private' } }),
    () => new Response('{}', { headers: { 'Content-Type': 'text/plain' } }),
    () => new Response('x'.repeat(9000), { headers: { 'Content-Type': 'application/json' } }),
    () => new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    () => Response.json({ enabled: 'yes', message: 'invalid' }),
  ]) {
    const result = await websiteStatus(async () => response());
    assert.doesNotMatch(result, /: OK/);
  }
});

test('parallel probes time out even when the API body stalls, within the Discord response deadline', async t => {
  const server = createServer((request, response) => {
    if (request.method === 'HEAD') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(); }
    else { response.writeHead(200, { 'Content-Type': 'application/json' }); response.write('{'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const started = performance.now();
  const result = await websiteStatus((url, options) => fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, options));
  assert.match(result, /Website: OK/);
  assert.match(result, /API pengunjung: tidak dapat diverifikasi/);
  assert.match(result, /API pengumuman: tidak dapat diverifikasi/);
  assert.ok(performance.now() - started < 2500, 'parallel probes finish before three-second interaction deadline');
});
