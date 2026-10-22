import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import bcrypt from 'bcryptjs';
import { createAccountStore } from '../server/admin-account.js';
import { backupSite, verifyBackup, updateGeoip } from '../scripts/maintenance.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-maintenance-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  createAccountStore({ path: join(directory, 'cms-account.json'), username: 'test-admin', passwordHash: bcrypt.hashSync('test-only-password', 4) });
  const db = new DatabaseSync(join(directory, 'visitors.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE visitors (visitor_hash TEXT PRIMARY KEY);
    CREATE TABLE visitor_activity (visitor_hash TEXT, hour TEXT);
    CREATE TABLE excluded_browsers (visitor_hash TEXT PRIMARY KEY);
    INSERT INTO visitors VALUES ('test-hash');
    INSERT INTO visitor_activity VALUES ('test-hash', '2026-10-22 12:00:00');
    INSERT INTO excluded_browsers VALUES ('excluded-test-hash');`);
  t.after(() => db.close());
  return { directory, db, options: { stateDirectory: directory, backupDirectory: join(directory, 'backups'), configurationDirectory: join(directory, 'configuration') } };
}

test('scheduled backup captures live WAL data and private account state, then verifies a restored copy', async t => {
  const { directory, db, options } = await fixture(t);
  const target = await backupSite(options);
  const manifest = verifyBackup(target);
  assert.deepEqual(manifest.counts, { visitors: 1, visitor_activity: 1, excluded_browsers: 1 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM visitors').get().n, 1);
  assert.equal((await stat(join(target, 'cms-key.bin'))).mode & 0o777, 0o600);
  const status = JSON.parse(await readFile(join(directory, 'backup-status.json'), 'utf8'));
  assert.equal(status.ok, true);
  assert.equal(status.copies, 1);
  assert.equal(status.restoreVerifiedAt, status.lastSuccess);
  assert.deepEqual((await readdir(options.backupDirectory)).filter(name => name.startsWith('.')), []);
  await writeFile(join(target, 'cms-account.json'), 'corrupted backup');
  assert.throws(() => verifyBackup(target), /checksum mismatch/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM visitors').get().n, 1);
});

test('backup retention keeps 14 verified snapshots without removing source data', async t => {
  const { db, options } = await fixture(t);
  for (let index = 0; index < 15; index++) await backupSite({ ...options, now: () => Date.parse('2026-10-01T00:00:00Z') + index * 86400000 });
  const copies = (await readdir(options.backupDirectory)).filter(name => name.startsWith('backup-'));
  assert.equal(copies.length, 14);
  assert.ok(copies.every(name => !name.startsWith('backup-20261001T')));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM visitors').get().n, 1);
});

test('a failed backup preserves previous success and leaves no partial backup', async t => {
  const { directory, options } = await fixture(t);
  await backupSite(options);
  const before = JSON.parse(await readFile(join(directory, 'backup-status.json'), 'utf8'));
  await rm(join(directory, 'cms-key.bin'));
  await assert.rejects(backupSite(options));
  const after = JSON.parse(await readFile(join(directory, 'backup-status.json'), 'utf8'));
  assert.equal(after.ok, false);
  assert.equal(after.lastSuccess, before.lastSuccess);
  assert.equal((await readdir(options.backupDirectory)).length, 1);
});

test('invalid GeoIP downloads never replace the active database and record a retryable failure', async t => {
  const { directory } = await fixture(t);
  const geoPath = join(directory, 'city.mmdb');
  await writeFile(geoPath, 'previous-database');
  for (const response of [new Response('provider unavailable', { status: 503 }), new Response(gzipSync('not a database')), new Response('not gzip')]) {
    await assert.rejects(updateGeoip({ stateDirectory: directory, geoPath, fetchImpl: async () => response }));
    assert.equal(await readFile(geoPath, 'utf8'), 'previous-database');
  }
  assert.ok(!(await readdir(directory)).some(name => name.endsWith('.tmp')));
  assert.equal(JSON.parse(await readFile(join(directory, 'geoip-status.json'), 'utf8')).ok, false);
});
