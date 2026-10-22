import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createVisitorServer } from '../server/visitor-counter.js';
import { parseMigrationTime } from '../server/discord-bot.js';
import { runMigrationSchedule } from '../server/discord-scheduler.js';
import { saveContent } from '../server/cms-operations.js';
import { registerDiscordCommands } from '../server/discord-commands.js';

const webhook = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789';
async function app(t) {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-discord-'));
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const config = { applicationId: '100000000000000001', guildId: '100000000000000002', channelId: '100000000000000003', allowedUserIds: ['100000000000000004'], publicKey: publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex') };
  const configPath = join(directory, 'bot.json'); await writeFile(configPath, JSON.stringify(config));
  const dbPath = join(directory, 'visitors.sqlite'); let time = Date.parse('2026-10-22T12:00:00Z');
  let server, base; let nonce = 100000000000000100n;
  async function start() {
    server = createVisitorServer({ dbPath, discordConfigPath: configPath, now: () => time });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); base = 'http://127.0.0.1:' + server.address().port;
  }
  await start();
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const request = (path, options) => fetch(base + path, options);
  const payload = (name, sub, options = {}, extra = {}) => ({ type: 2, id: String(++nonce), application_id: config.applicationId, guild_id: config.guildId,
    channel_id: config.channelId, member: { user: { id: config.allowedUserIds[0] } }, data: { name, options: [{ type: 1, name: sub, options: Object.entries(options).map(([name, value]) => ({ type: typeof value === 'boolean' ? 5 : typeof value === 'number' ? 4 : 3, name, value })) }] }, ...extra });
  const send = (value, options = {}) => {
    const body = JSON.stringify(value); const timestamp = String(Math.floor((time + (options.offset || 0)) / 1000));
    const signature = sign(null, Buffer.from(timestamp + body), privateKey).toString('hex');
    return request('/api/discord/interactions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Signature-Ed25519': options.signature || signature, 'X-Signature-Timestamp': timestamp }, body: options.tamper ? body + ' ' : body });
  };
  const run = (fetchImpl = async () => Response.json({ id: '100000000000000010' })) => runMigrationSchedule({ dbPath, env: { CMS_DISCORD_WEBHOOK: webhook }, now: () => time, fetchImpl });
  const rows = () => { const db = new DatabaseSync(dbPath); try { return db.prepare('SELECT * FROM discord_migrations ORDER BY created_at').all(); } finally { db.close(); } };
  return { directory, dbPath, config, payload, send, request, run, rows, now: () => time, advance: ms => { time += ms; },
    restart: async () => { await new Promise(resolve => server.close(resolve)); await start(); } };
}

async function schedule(api, options = {}) {
  const response = await api.send(api.payload('migrasi', 'jadwalkan', { waktu: '2026-10-22 21:00', pesan: 'Sedang memindahkan server. Coba lagi nanti.', ...options }));
  assert.equal(response.status, 200); const data = await response.json(); assert.match(data.data.content, /Jadwal tersimpan/);
  return api.rows().find(row => row.status === 'scheduled');
}

test('Discord PING verifies Ed25519 signatures, supports payloads over 2KB, and rejects tampering or old timestamps', async t => {
  const api = await app(t);
  assert.deepEqual(await (await api.send({ type: 1, padding: 'x'.repeat(3000) })).json(), { type: 1 });
  assert.equal((await api.send({ type: 1 }, { tamper: true })).status, 401);
  assert.equal((await api.send({ type: 1 }, { signature: '0'.repeat(128) })).status, 401);
  assert.equal((await api.send({ type: 1 }, { offset: -301000 })).status, 401);
  assert.equal((await api.send({ type: 1, padding: 'x'.repeat(17000) })).status, 413);
  assert.equal((await api.request('/api/admin/discord')).status, 401);
});

test('only the configured application, guild, channel and user can publish; replies are private and replay is idempotent', async t => {
  const api = await app(t);
  for (const override of [{ application_id: '100000000000000099' }, { guild_id: '100000000000000099' }, { channel_id: '100000000000000099' }, { member: { user: { id: '100000000000000099' }, permissions: '8' } }, { member: { user: { id: api.config.allowedUserIds[0], bot: true } } }]) {
    const result = await (await api.send(api.payload('pengumuman', 'pasang', { pesan: 'unauthorized' }, override))).json(); assert.match(result.data.content, /tidak diizinkan/);
  }
  assert.equal((await (await api.request('/api/site-content')).json()).enabled, false);
  const command = api.payload('pengumuman', 'pasang', { pesan: '<script>plain text only</script>', judul: 'Migrasi' });
  const result = await (await api.send(command)).json(); assert.equal(result.data.flags, 64); assert.deepEqual(result.data.allowed_mentions, { parse: [] });
  assert.equal((await (await api.request('/api/site-content')).json()).message, '<script>plain text only</script>');
  const first = await readFile(join(api.directory, 'site-content.json'), 'utf8'); api.advance(1000);
  await api.send({ ...command, data: api.payload('pengumuman', 'hapus').data });
  assert.equal(await readFile(join(api.directory, 'site-content.json'), 'utf8'), first);
  await api.send(api.payload('pengumuman', 'hapus')); assert.equal((await (await api.request('/api/site-content')).json()).enabled, false);
});

test('scheduled migration reminds once, publishes at the due time, persists through restart, and finishes without touching base content', async t => {
  const api = await app(t); const job = await schedule(api); const notices = [];
  const fetchMock = async (_url, options) => { notices.push(JSON.parse(options.body)); return Response.json({ id: '100000000000000010' }); };
  await api.run(fetchMock); assert.equal(notices.length, 0);
  api.advance(3600000); await api.run(fetchMock); await api.run(fetchMock); assert.equal(notices.length, 1); assert.match(notices[0].content, /pengingat migrasi/);
  api.advance(3600000); await api.run(fetchMock); assert.equal(notices.length, 2);
  assert.equal((await (await api.request('/api/site-content')).json()).enabled, true);
  await api.restart(); assert.equal((await (await api.request('/api/site-content')).json()).enabled, true);
  await api.send(api.payload('migrasi', 'selesai', { id: job.id }));
  assert.equal((await (await api.request('/api/site-content')).json()).enabled, false);
  assert.equal(api.rows()[0].status, 'done'); await api.run(fetchMock); assert.equal(notices.length, 2);
});

test('manual content overrides an automatic notice immediately and is never overwritten by late jobs', async t => {
  const api = await app(t); await schedule(api); api.advance(7200000); await api.run();
  saveContent(api.directory, { enabled: true, title: 'Info admin', message: 'Pengumuman baru dari CMS' }, api.now);
  assert.equal((await (await api.request('/api/site-content')).json()).title, 'Info admin');
  await api.run(); assert.equal(api.rows()[0].status, 'superseded');
  assert.equal((await (await api.request('/api/site-content')).json()).message, 'Pengumuman baru dari CMS');
});

test('cancelled and reminder-only schedules do not publish notices; overdue schedules older than 24h are skipped', async t => {
  const api = await app(t); const job = await schedule(api);
  await api.send(api.payload('migrasi', 'batal', { id: job.id })); api.advance(7200000); await api.run(); assert.equal((await (await api.request('/api/site-content')).json()).enabled, false);
  await schedule(api, { waktu: '2026-10-22 23:00', otomatis: false }); api.advance(7200000); await api.run(); assert.equal((await (await api.request('/api/site-content')).json()).enabled, false);
  await api.send(api.payload('migrasi', 'selesai', { id: api.rows().find(row => row.status === 'active').id }));
  await schedule(api, { waktu: '2026-10-23 01:00' }); api.advance(27 * 3600000); await api.run();
  assert.equal(api.rows().at(-1).status, 'missed'); assert.equal((await (await api.request('/api/site-content')).json()).enabled, false);
});

test('failed Discord delivery retries without blocking publication and overlapping workers share a delivery lease', async t => {
  const api = await app(t); await schedule(api); api.advance(7200000);
  assert.equal((await api.run(async () => new Response(null, { status: 429 }))).ok, false);
  assert.equal((await (await api.request('/api/site-content')).json()).enabled, true);
  let sends = 0;
  const fetchMock = async () => { sends++; await new Promise(resolve => setTimeout(resolve, 20)); return Response.json({ id: '100000000000000010' }); };
  await Promise.all([api.run(fetchMock), api.run(fetchMock)]); assert.equal(sends, 1); assert.equal(api.rows()[0].due_sent, 1);
});

test('migration time validates WIB calendar dates and bounds, and one active schedule prevents collisions', async t => {
  const api = await app(t);
  for (const value of ['2026-02-30 12:00', '2026-10-22 19:00', '2028-01-01 00:00', 'tomorrow']) assert.throws(() => parseMigrationTime(value, api.now()));
  await schedule(api);
  const duplicate = await (await api.send(api.payload('migrasi', 'jadwalkan', { waktu: '2026-10-22 22:00', pesan: 'Second' }))).json(); assert.match(duplicate.data.content, /Masih ada jadwal aktif/);
  assert.equal(api.rows().length, 1);
});

test('command registration upserts only two named commands and keeps bot token out of command definitions', async t => {
  const api = await app(t); const commands = [];
  await registerDiscordCommands(api.config, 'test-bot-token-only-for-fixture', async (url, options) => {
    assert.match(url, /\/guilds\//); assert.equal(options.method, 'POST'); const body = JSON.parse(options.body); commands.push(body);
    assert.equal(body.default_member_permissions, '0'); assert.ok(!options.body.includes('test-bot-token'));
    return Response.json({ id: '100000000000000010', application_id: api.config.applicationId, name: body.name });
  });
  assert.deepEqual(commands.map(command => command.name), ['pengumuman', 'migrasi']);
});
