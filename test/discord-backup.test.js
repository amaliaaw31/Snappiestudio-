import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { createAccountStore } from '../server/admin-account.js';
import { backupSite } from '../scripts/maintenance.mjs';
import { createBackupCommands, listSnapshots, loadAlertEnvironment, verifySnapshot } from '../server/discord-backup.js';
const webhook = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789';
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-phase2-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const backupDirectory = join(directory, 'backups');
  let time = Date.parse('2026-10-23T00:00:00Z'), nonce = 100;
  createAccountStore({ path: join(directory, 'cms-account.json'), username: 'fixture', passwordHash: bcrypt.hashSync('fixture-password', 4) });
  const db = new DatabaseSync(join(directory, 'visitors.sqlite'));
  db.exec('CREATE TABLE visitors(visitor_hash TEXT); CREATE TABLE visitor_activity(visitor_hash TEXT); CREATE TABLE excluded_browsers(visitor_hash TEXT);'); db.close();
  const options = { directory, backupDirectory, now: () => time };
  const snapshot = () => backupSite({ stateDirectory: directory, backupDirectory, configurationDirectory: join(directory, 'unused-config'), now: () => time });
  const payload = (name, sub, values = {}, id = String(++nonce)) => ({ id, data: { name, options: [{ type: 1, name: sub, options: Object.entries(values).map(([name, value]) => ({ name, value })) }] } });
  return { directory, backupDirectory, options, snapshot, payload, advance: ms => { time += ms; } };
}

test('backup metadata is safe, empty histories are honest, paths and symlinks are rejected', async t => {
  const f = await fixture(t), commands = createBackupCommands(f.options);
  assert.match(await commands.backup(f.payload('backup', 'history')), /Belum ada snapshot/);
  const path = await f.snapshot(), names = await listSnapshots(f.backupDirectory);
  const history = await commands.backup(f.payload('backup', 'history'));
  assert.ok(history.includes(names[0])); assert.match(history, /integritas belum diperiksa/);
  const result = await commands.backup(f.payload('backup', 'status'));
  assert.match(result, /Backup: UP/); assert.doesNotMatch(result, /fixture-password|cms-key|\/tmp\/|visitor_hash/);
  for (const snapshot of ['../../etc/passwd', '/private/token', 'backup-invalid']) assert.match(await commands.backup(f.payload('backup', 'verify', { snapshot })), /ID snapshot tidak valid/);
  await symlink(path, join(f.backupDirectory, 'backup-20261024T000000Z-aaaaaaaa'));
  assert.deepEqual(await listSnapshots(f.backupDirectory), names);
});

test('verification preserves source bytes and records corruption until the same snapshot passes again', async t => {
  const f = await fixture(t), path = await f.snapshot();
  const [name] = await listSnapshots(f.backupDirectory);
  const files = await readdir(path), before = await Promise.all(files.map(file => readFile(join(path, file))));
  const commands = createBackupCommands(f.options);
  assert.match(await commands.backup(f.payload('backup', 'verify')), /: UP/);
  assert.deepEqual(await readdir(path), files);
  for (let index = 0; index < files.length; index++) assert.deepEqual(await readFile(join(path, files[index])), before[index]);
  const account = await readFile(join(path, 'cms-account.json'));
  await writeFile(join(path, 'cms-account.json'), 'corrupt-secret-not-for-output');
  const result = await commands.backup(f.payload('backup', 'verify', { snapshot: name }));
  assert.match(result, /: DEGRADED/); assert.doesNotMatch(result, /corrupt-secret/);
  const record = () => readFile(join(f.directory, 'backup-verification-status.json'), 'utf8').then(JSON.parse);
  assert.deepEqual((await record()).failedSnapshots, [name]);
  await writeFile(join(path, 'cms-account.json'), account);
  assert.match(await commands.backup(f.payload('backup', 'verify', { snapshot: name })), /: UP/);
  assert.deepEqual((await record()).failedSnapshots, []);
  assert.equal((await listSnapshots(f.backupDirectory)).length, 1);
  await writeFile(join(path, 'counter.env'), 'fixture-only-unlisted-file');
  assert.equal(await verifySnapshot(f.backupDirectory, name), 'DEGRADED');
  await rm(join(path, 'counter.env')); await rm(join(path, 'cms-account.json'));
  assert.equal(await verifySnapshot(f.backupDirectory, name), 'DEGRADED');
});

test('verification bounds execution and coalesces replays without starting parallel workers', async t => {
  const f = await fixture(t); await f.snapshot(); const [name] = await listSnapshots(f.backupDirectory);
  assert.equal(await verifySnapshot(f.backupDirectory, name, async (_cmd, _args, options) => { assert.equal(options.timeout, 1500); throw Error('private-path'); }), 'UNKNOWN');
  assert.equal(await verifySnapshot(f.backupDirectory, name, async () => ({ stdout: '{"state":"secret"}' })), 'UNKNOWN');
  let release, calls = 0;
  const waiting = new Promise(resolve => { release = resolve; });
  const commands = createBackupCommands({ ...f.options, verify: async () => { calls++; await waiting; return 'UNKNOWN'; } });
  const command = f.payload('backup', 'verify');
  const first = commands.backup(command), replay = commands.backup(command);
  while (!calls) await new Promise(resolve => setTimeout(resolve, 5));
  assert.match(await commands.backup(f.payload('backup', 'verify')), /Verifikasi lain/);
  release(); assert.equal(await first, await replay); assert.equal(calls, 1);
});

test('alert test requires confirmation and preserves cooldown across a new handler instance', async t => {
  const f = await fixture(t); let sends = 0;
  const options = { ...f.options, getAlertEnvironment: async () => ({ CMS_DISCORD_WEBHOOK: webhook }), fetchImpl: async (url, request) => {
    assert.match(String(url), /^https:\/\/discord.com\/api\/webhooks\//); assert.equal(request.redirect, 'error'); assert.ok(request.signal);
    assert.deepEqual(JSON.parse(request.body).allowed_mentions, { parse: [] }); sends++; return Response.json({ id: '100000000000000001' });
  } };
  const commands = createBackupCommands(options);
  assert.match(await commands.alert(f.payload('alert', 'test')), /konfirmasi:True/); assert.equal(sends, 0);
  const command = f.payload('alert', 'test', { konfirmasi: true });
  const results = await Promise.all([commands.alert(command), commands.alert(command)]);
  assert.match(results[0], /dikonfirmasi Discord/); assert.equal(results[0], results[1]); assert.equal(sends, 1);
  assert.match(await createBackupCommands(options).alert(f.payload('alert', 'test', { konfirmasi: true })), /Cooldown/);
  f.advance(15 * 60000);
  assert.match(await commands.alert(f.payload('alert', 'test', { konfirmasi: true })), /dikonfirmasi Discord/); assert.equal(sends, 2);
});

test('failed alert delivery stays unconfirmed, hides errors and observes cooldown', async t => {
  const f = await fixture(t); let sends = 0;
  const commands = createBackupCommands({ ...f.options, getAlertEnvironment: async () => ({ CMS_DISCORD_WEBHOOK: webhook }), fetchImpl: async () => { sends++; return new Response('private-token', { status: 429 }); } });
  const result = await commands.alert(f.payload('alert', 'test', { konfirmasi: true }));
  assert.match(result, /gagal atau belum dikonfirmasi/); assert.doesNotMatch(result, /private-token/);
  assert.equal(JSON.parse(await readFile(join(f.directory, 'alert-test-status.json'))).ok, false);
  assert.match(await commands.alert(f.payload('alert', 'test', { konfirmasi: true })), /Cooldown/); assert.equal(sends, 1);
  const path = join(f.directory, 'fixture.env');
  await writeFile(path, 'SECRET_PASSWORD=not-for-output\nCMS_DISCORD_WEBHOOK='+webhook+'\n');
  assert.deepEqual(Object.keys(await loadAlertEnvironment(path)), ['CMS_DISCORD_WEBHOOK']);
  await writeFile(path, 'CMS_DISCORD_WEBHOOK=https://example.invalid/private\n'); await assert.rejects(loadAlertEnvironment(path));
});
