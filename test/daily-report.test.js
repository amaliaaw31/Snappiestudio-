import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { PdfDocument } from '../server/pdf-document.js';
import { dailyReportData, renderDailyReport } from '../server/daily-report.js';
import { createAnalytics } from '../server/analytics.js';
import { createSiteConfig } from '../server/site-config.js';
import { sendDiscordFile } from '../server/notifications.js';
import { sendDailyReport } from '../scripts/cms-jobs.mjs';

const webhook = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123';
const reportTime = Date.parse('2026-10-23T17:10:00Z'); // 24 Okt 00.10 WIB, jadwal laporan

// Memeriksa struktur PDF: tabel xref menunjuk ke objek yang benar dan panjang stream cocok.
function checkPdf(buffer) {
  const text = buffer.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4') && text.trimEnd().endsWith('%%EOF'));
  const xref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)[1]);
  assert.equal(text.slice(xref, xref + 4), 'xref');
  const [, count] = /^xref\n0 (\d+)\n/.exec(text.slice(xref));
  const entries = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map(match => Number(match[1]));
  assert.equal(entries.length, Number(count) - 1);
  entries.forEach((offset, index) => assert.ok(text.startsWith(`${index + 1} 0 obj\n`, offset), `object ${index + 1} offset`));
  for (const match of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = match.index + match[0].length;
    assert.equal(text.slice(start + Number(match[1]), start + Number(match[1]) + 10), '\nendstream');
  }
  return text;
}

function seededDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE visitors (visitor_hash TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT, country_code TEXT, country TEXT, province TEXT, city TEXT)');
  createAnalytics(db, () => reportTime);
  const visitor = db.prepare('INSERT INTO visitors VALUES (?, ?, ?, ?, ?, ?, ?)'), activity = db.prepare('INSERT INTO visitor_activity VALUES (?, ?, ?)');
  // Hari WIB 23 Okt = 22 Okt 17:00Z sampai 23 Okt 16:59Z.
  const rows = [['a', '2026-10-23 03:10:00', 'ID', 'Indonesia', 'West Java', 'Bandung'], ['b', '2026-10-23 03:40:00', 'ID', 'Indonesia', 'Jakarta', 'Jakarta'],
    ['c', '2026-10-20 05:00:00', 'MY', 'Malaysia', 'Selangor', 'Shah Alam'], ['d', '2026-10-22 03:00:00', 'ID', 'Indonesia', 'West Java', 'Bandung'], ['e', '2026-10-22 04:00:00', 'ID', 'Indonesia', 'Bali', 'Denpasar']];
  for (const [hash, first, code, country, province, city] of rows) visitor.run(hash, first, first, code, country, province, city);
  for (const [hash, hour] of [['a', '2026-10-23 03:00:00'], ['b', '2026-10-23 03:00:00'], ['c', '2026-10-23 09:00:00'], ['d', '2026-10-22 03:00:00'], ['e', '2026-10-22 04:00:00']]) activity.run(hash, hour, hour);
  let time = Date.parse('2026-10-23T04:00:00Z');
  const usage = createSiteConfig(db, () => time);
  for (const body of [{ event: 'png', theme: 'pastel', filter: 'normal' }, { event: 'png', theme: 'film', filter: 'normal' }, { event: 'support_shown' }, { event: 'support_kofi' }]) usage.record(body);
  time = Date.parse('2026-10-22T04:00:00Z');
  usage.record({ event: 'png', theme: 'pastel', filter: 'bw' });
  return db;
}

test('PDF builder writes a valid file and escapes text safely', () => {
  const pdf = new PdfDocument({ title: 'Uji (1)' }); const page = pdf.addPage();
  page.text(40, 40, 12, 'Halo (dunia) \\ Sao Paulo, Zürich ✓'); page.rect(40, 60, 100, 10, [1, 0, 0]); page.line(40, 80, 140, 80, [0, 0, 0]);
  const text = checkPdf(pdf.toBuffer());
  assert.ok(text.includes('(Halo \\(dunia\\) \\\\ Sao Paulo, Zurich ?) Tj'));
  assert.ok(text.includes('/Title (Uji \\(1\\))'));
});

test('daily report data compares yesterday with the day before from anonymous counts', () => {
  const data = dailyReportData(seededDatabase(), reportTime);
  assert.equal(data.day, '2026-10-23'); assert.equal(data.previousDay, '2026-10-22');
  assert.equal(data.visitors, 3); assert.equal(data.previousVisitors, 2); assert.equal(data.difference, 1); assert.equal(data.percent, 50);
  assert.equal(data.newBrowsers, 2); assert.equal(data.returningBrowsers, 1); assert.equal(data.totalBrowsers, 5);
  assert.deepEqual(data.origin.countries, [{ name: 'Indonesia', count: 2 }, { name: 'Malaysia', count: 1 }]);
  assert.deepEqual(data.origin.provinces.map(row => row.name).sort(), ['Jakarta', 'Selangor', 'West Java']);
  assert.equal(data.usage.day.png, 2); assert.equal(data.usage.previous.png, 1); assert.equal(data.usage.day.support_kofi, 1);
  assert.deepEqual(data.usage.themes, [{ name: 'film', count: 1 }, { name: 'pastel', count: 1 }]);
  assert.equal(data.trend.length, 7); assert.equal(data.trend.at(-1).count, 3); assert.equal(data.hourly.length, 24);
  assert.equal(data.hourly[10].count, 2); // 03.00Z = 10.00 WIB
  assert.equal(JSON.stringify(data).includes('"a"'), false, 'no browser hashes in report data');
});

test('daily report PDF is valid and contains every requested section', () => {
  const text = checkPdf(renderDailyReport(dailyReportData(seededDatabase(), reportTime)));
  for (const expected of ['Laporan harian pengunjung', '23 Oktober 2026', 'Kemarin dibanding hari sebelumnya', 'Jumlah pengunjung', 'Asal pengunjung', 'Penggunaan fitur', 'Tren dan waktu', 'Indonesia', 'Jam tersibuk 10.00-10.59 WIB']) {
    assert.ok(text.includes(expected), expected);
  }
  assert.ok(checkPdf(renderDailyReport(dailyReportData(emptyDatabase(), reportTime))).includes('Belum ada aktivitas'));
});

function emptyDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE visitors (visitor_hash TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT, country_code TEXT, country TEXT, province TEXT, city TEXT)');
  createAnalytics(db, () => reportTime);
  return db;
}

test('Discord attachment is a multipart upload with a confirmed message id', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return Response.json({ id: '123456789012345678' }); };
  const data = Buffer.from('%PDF-1.4 test');
  await sendDiscordFile(webhook, { content: 'Laporan', filename: 'laporan.pdf', data }, fetchImpl);
  const { url, options } = calls[0];
  assert.equal(url.searchParams.get('wait'), 'true'); assert.equal(options.redirect, 'error');
  const payload = JSON.parse(options.body.get('payload_json'));
  assert.deepEqual(payload, { content: 'Laporan', allowed_mentions: { parse: [] }, attachments: [{ id: 0, filename: 'laporan.pdf' }] });
  const file = options.body.get('files[0]');
  assert.equal(file.name, 'laporan.pdf'); assert.equal(file.type, 'application/pdf'); assert.equal(Buffer.from(await file.arrayBuffer()).toString(), '%PDF-1.4 test');
  await assert.rejects(sendDiscordFile(webhook, { content: 'x', filename: 'a.pdf', data }, async () => Response.json({})), /Discord delivery not confirmed/);
  await assert.rejects(sendDiscordFile(webhook, { content: 'x', filename: '../a.pdf', data }, fetchImpl), /Invalid Discord attachment/);
  await assert.rejects(sendDiscordFile(webhook, { content: 'x', filename: 'a.pdf', data: Buffer.alloc(9 * 1024 * 1024) }, fetchImpl), /Invalid Discord attachment/);
  await assert.rejects(sendDiscordFile('https://evil.example/x', { content: 'x', filename: 'a.pdf', data }, fetchImpl), /Invalid Discord webhook/);
});

test('daily job sends once per day, retries after a failure and reports a missing webhook', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'snappie-daily-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dbPath = join(directory, 'visitors.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE visitors (visitor_hash TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT, country_code TEXT, country TEXT, province TEXT, city TEXT)');
  createAnalytics(db, () => reportTime); db.close();
  const status = async () => JSON.parse(await readFile(join(directory, 'daily-report-status.json'), 'utf8'));
  let sent = 0, fail = true;
  const fetchImpl = async () => { if (fail) throw new Error('offline'); sent++; return Response.json({ id: '123456789012345678' }); };
  const run = (env = { CMS_DISCORD_WEBHOOK: webhook }, options) => sendDailyReport(dbPath, env, fetchImpl, () => reportTime, options);
  assert.equal((await run({})).error, 'not_configured'); assert.equal(sent, 0);
  assert.equal((await run({ CMS_ALERT_WEBHOOK: 'https://example.invalid/hook' })).error, 'not_configured');
  assert.equal((await run()).error, 'send_failed'); assert.equal((await status()).sentDay, undefined);
  fail = false;
  const ok = await run(); assert.equal(ok.ok, true); assert.equal(ok.sentDay, '2026-10-23'); assert.equal(sent, 1);
  assert.equal((await run()).skipped, true); assert.equal(sent, 1);
  assert.equal((await run(undefined, { force: true })).ok, true); assert.equal(sent, 2);
  assert.equal((await status()).sentDay, '2026-10-23');
});
