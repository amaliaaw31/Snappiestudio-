import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { errorSummary, createReadCommands } from '../server/discord-read-commands.js';
import { createWebsiteStatus } from '../server/discord-status.js';

const now = Date.parse('2026-10-23T00:00:00Z');

test('probe classification requires repeated failures, resets on recovery and never echoes bodies', async () => {
  let mode = 'network';
  const probe = createWebsiteStatus(async () => {
    if (mode === 'network') throw Error('secret-internal-address');
    if (mode === 'http') return new Response('private-body', { status: 503 });
    return new Response(null, { headers: { 'Content-Type': 'text/html' } });
  });
  assert.match(await probe(true), /Website: UNKNOWN/);
  assert.match(await probe(true), /Website: DOWN/);
  mode = 'up'; assert.match(await probe(true), /Website: UP/);
  mode = 'http'; assert.match(await probe(true), /Website: DEGRADED/);
  const result = await probe(true); assert.match(result, /Website: DOWN/); assert.doesNotMatch(result, /secret|private-body/);
});

test('logs aggregate approved errors only and filter arbitrary file fields or corrupted status files', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-read-commands-'));
  const db = new DatabaseSync(':memory:');
  t.after(async () => { db.close(); await rm(directory, { recursive: true, force: true }); });
  db.exec('CREATE TABLE cms_audit(at TEXT,event TEXT)');
  const insert = db.prepare('INSERT INTO cms_audit VALUES (?,?)');
  insert.run(new Date(now - 1000).toISOString(), 'login_failed'); insert.run(new Date(now - 2 * 86400000).toISOString(), 'login_failed');
  insert.run(new Date(now).toISOString(), 'secret-user-token');
  await writeFile(join(directory, 'monitor-status.json'), JSON.stringify({ ok: false, checkedAt: new Date(now).toISOString(), secret: 'private-ip-token' }));
  await writeFile(join(directory, 'backup-status.json'), 'invalid-json-private-token');
  await writeFile(join(directory, 'discord-scheduler-status.json'), JSON.stringify({ ok: true, lastRun: 'private-ip-token' }));
  const result = await errorSummary(db, directory, () => now);
  assert.match(result, /24 jam: 1/); assert.match(result, /Monitor: DEGRADED/); assert.match(result, /Backup: UNKNOWN/);
  assert.match(result, /Scheduler migrasi: UP; catatan terakhir UNKNOWN/);
  assert.doesNotMatch(result, /secret|private-ip|invalid-json/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM cms_audit').get().count, 3);
  const commands = createReadCommands({ db, directory, now: () => now, fetchImpl: async url => url.endsWith('/') ? new Response(null, { headers: { 'Content-Type': 'text/html' } }) : Response.json(url.endsWith('visitors') ? { total: 0 } : { enabled: false, message: '' }) });
  assert.match(await commands.status(), /Bot: UP/);
  assert.match(await commands.website(), /Website: UP/);
});
