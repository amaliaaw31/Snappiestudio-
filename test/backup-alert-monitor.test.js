import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { checkMonitor } from '../scripts/cms-jobs.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-backup-alerts-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let time = Date.parse('2026-10-23T00:00:00Z'), reject = false, full = false;
  const notices = [];
  const db = new DatabaseSync(join(directory, 'visitors.sqlite')); db.exec('CREATE TABLE fixture(value TEXT)'); db.close();
  const write = (name, value) => writeFile(join(directory, name + '.json'), JSON.stringify(value));
  const healthy = async () => {
    await write('backup-status', { ok: true, lastSuccess: new Date(time).toISOString(), restoreVerifiedAt: new Date(time).toISOString() });
    await write('geoip-status', { ok: true, lastSuccess: new Date(time).toISOString() });
    await write('backup-verification-status', { state: 'UP', failedSnapshots: [] });
  };
  await healthy();
  const check = () => checkMonitor(directory, { CMS_DISCORD_WEBHOOK: 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789' }, async (_url, options) => {
    if (!options?.method) return new Response('', { status: 200 });
    const message = JSON.parse(options.body); notices.push(message);
    assert.deepEqual(message.allowed_mentions, { parse: [] });
    return reject ? new Response('secret-server-error', { status: 503 }) : Response.json({ id: '100000000000000001' });
  }, () => time, () => {}, { backupDirectory: join(directory, 'backups'), diskCheck: path => ({ blocks: 100, bavail: full && path.endsWith('backups') ? 2 : 50 }) });
  return { directory, check, healthy, write, notices, now: () => time, advance: ms => { time += ms; }, reject: value => { reject = value; }, full: value => { full = value; } };
}

test('backup incidents deduplicate, observe cooldown across runs, and send recovery once', async t => {
  const f = await fixture(t);
  assert.equal((await f.check()).ok, true); assert.equal(f.notices.length, 0);
  await f.write('backup-status', { ok: false, lastSuccess: new Date(f.now()).toISOString(), restoreVerifiedAt: new Date(f.now()).toISOString() });
  const first = await f.check(); assert.ok(first.issues.includes('backup_failed')); assert.equal(first.notificationOk, true);
  await f.check(); assert.equal(f.notices.length, 1);
  await f.write('backup-verification-status', { state: 'DEGRADED', failedSnapshots: ['backup-20261023T000000Z-aaaaaaaa'] });
  assert.ok((await f.check()).issues.includes('backup_integrity')); assert.equal(f.notices.length, 1);
  f.advance(15 * 60000); await f.check(); assert.equal(f.notices.length, 2);
  await f.healthy(); assert.equal((await f.check()).ok, true); assert.equal(f.notices.length, 3);
  assert.match(f.notices[2].content, /layanan pulih/); await f.check(); assert.equal(f.notices.length, 3);
});

test('late backups, failed verification and backup disk pressure are distinct issues', async t => {
  const f = await fixture(t); f.advance(49 * 3600000); f.full(true);
  const state = await f.check(); assert.ok(state.issues.includes('backup_late')); assert.ok(state.issues.includes('backup_storage'));
  await f.healthy(); await f.write('backup-status', { ok: true, lastSuccess: new Date(f.now()).toISOString() });
  assert.ok((await f.check()).issues.includes('backup_integrity'));
  await writeFile(join(f.directory, 'backup-status.json'), '{private-invalid-data');
  assert.ok((await f.check()).issues.includes('backup_integrity'));
});

test('Discord failures persist locally and retry after cooldown without stopping checks or leaking errors', async t => {
  const f = await fixture(t); f.reject(true);
  await f.write('backup-status', { ok: false });
  assert.equal((await f.check()).notificationOk, false); assert.equal(f.notices.length, 1);
  f.full(true); const next = await f.check(); assert.ok(next.issues.includes('backup_storage')); assert.equal(next.notificationOk, false); assert.equal(f.notices.length, 1);
  f.advance(15 * 60000); f.reject(false); assert.equal((await f.check()).notificationOk, true); assert.equal(f.notices.length, 2);
  assert.doesNotMatch(JSON.stringify(f.notices), /secret-server-error|api\/webhooks/);
});

test('missed daily backup becomes late only after the two-hour schedule grace period', async t => {
  const f = await fixture(t);
  f.advance(21 * 3600000 + 29 * 60000);
  assert.ok(!(await f.check()).issues.includes('backup_late'));
  f.advance(60000);
  assert.ok((await f.check()).issues.includes('backup_late'));
});
