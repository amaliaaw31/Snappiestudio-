import { createAnalytics, reportFilters } from './analytics.js';
import { createSiteConfig } from './site-config.js';
import { PdfDocument } from './pdf-document.js';

const DAY = 86400000;
const WIB = 7 * 3600000;
const localDay = time => new Date(time + WIB).toISOString().slice(0, 10);
const midnight = day => Date.parse(`${day}T00:00:00+07:00`);
const filters = (from, to) => reportFilters(new URLSearchParams({ from, to }));

// Laporan hari WIB yang baru berakhir ("kemarin") dibanding hari sebelumnya.
// Pukul 00.10 hari ini baru berjalan beberapa menit, jadi tidak dipakai sebagai pembanding.
export function dailyReportData(db, now = Date.now()) {
  const analytics = createAnalytics(db, () => now);
  const usage = createSiteConfig(db, () => now);
  const day = localDay(midnight(localDay(now)) - DAY);
  const previousDay = localDay(midnight(day) - DAY);
  const range = filters(day, day);
  const comparison = analytics.comparison(range);
  const insights = analytics.insights(range);
  const place = (rows, pick) => {
    const counts = new Map();
    for (const row of rows) { const name = pick(row); if (name) counts.set(name, (counts.get(name) || 0) + row.count); }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([name, count]) => ({ name, count }));
  };
  const locations = analytics.locations(range);
  const week = analytics.charts(filters(localDay(midnight(day) - 6 * DAY), day));
  return {
    day, previousDay, generatedAt: now,
    visitors: comparison.current, previousVisitors: comparison.previous, difference: comparison.difference, percent: comparison.percent,
    newBrowsers: insights.newBrowsers, returningBrowsers: insights.returningBrowsers,
    totalBrowsers: db.prepare('SELECT COUNT(*) AS count FROM visitors').get().count,
    origin: { total: locations.total, countries: place(locations.locations, row => row.country), provinces: place(locations.locations, row => row.province),
      cities: place(locations.locations, row => row.city) },
    usage: { day: usage.report(range).totals, previous: usage.report(filters(previousDay, previousDay)).totals,
      themes: usage.report(range).themes, filters: usage.report(range).filters },
    trend: week.daily, hourly: analytics.charts(range).hourly,
  };
}

const ink = [0.16, 0.14, 0.22], muted = [0.42, 0.38, 0.48], brand = [0.694, 0.149, 0.42], soft = [0.93, 0.78, 0.86], rule = [0.85, 0.8, 0.88];
const good = [0.1, 0.5, 0.28], bad = [0.72, 0.15, 0.15];
const decimal = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('id-ID');
const dateFormat = (day, options) => new Intl.DateTimeFormat('id-ID', { ...options, timeZone: 'UTC' }).format(new Date(day + 'T00:00:00Z'));
export const longDay = day => dateFormat(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDay = day => dateFormat(day, { day: 'numeric', month: 'short' });
const signed = value => (value > 0 ? '+' : '') + whole.format(value);
const clip = (value, length) => String(value).length > length ? String(value).slice(0, length - 1) + '.' : String(value);

export function renderDailyReport(data) {
  const pdf = new PdfDocument({ title: 'Laporan harian Snappie Studio ' + data.day });
  const page = pdf.addPage();
  page.rect(0, 0, 595.28, 62, brand);
  page.text(40, 31, 20, 'Snappie Studio', { bold: true, rgb: [1, 1, 1] });
  page.text(40, 49, 10, 'Laporan harian pengunjung', { rgb: [1, 1, 1] });
  page.text(555, 31, 12, longDay(data.day), { bold: true, rgb: [1, 1, 1], align: 'right' });
  page.text(555, 49, 9, 'Hari penuh dalam WIB (UTC+7)', { rgb: [1, 1, 1], align: 'right' });
  const section = (y, title) => { page.text(40, y, 12, title, { bold: true, rgb: ink }); page.line(40, y + 6, 555, y + 6, rule); };

  section(92, '1. Kemarin dibanding hari sebelumnya');
  const trendColor = data.difference > 0 ? good : data.difference < 0 ? bad : muted;
  page.text(40, 134, 30, whole.format(data.visitors), { bold: true, rgb: brand });
  page.text(40, 148, 9, `Browser unik ${shortDay(data.day)}`, { rgb: muted });
  page.text(230, 134, 30, whole.format(data.previousVisitors), { bold: true, rgb: ink });
  page.text(230, 148, 9, `Hari sebelumnya, ${shortDay(data.previousDay)}`, { rgb: muted });
  page.text(420, 134, 30, signed(data.difference), { bold: true, rgb: trendColor });
  page.text(420, 148, 9, data.percent === null ? 'Selisih (persen tidak tersedia)' : `Selisih ${data.percent > 0 ? '+' : ''}${decimal.format(data.percent)}%`, { rgb: muted });

  section(180, '2. Jumlah pengunjung');
  [[data.visitors, 'Browser unik kemarin'], [data.newBrowsers, 'Browser baru'], [data.returningBrowsers, 'Browser kembali'], [data.totalBrowsers, 'Total browser tercatat']]
    .forEach(([value, label], index) => {
      const x = 40 + index * 130;
      page.text(x, 220, 22, whole.format(value), { bold: true, rgb: ink });
      page.text(x, 234, 8.5, label, { rgb: muted });
    });

  section(262, '3. Asal pengunjung (browser aktif kemarin)');
  [['Negara', data.origin.countries], ['Provinsi', data.origin.provinces], ['Kota', data.origin.cities]].forEach(([title, rows], column) => {
    const x = 40 + column * 175;
    page.text(x, 290, 9, title, { bold: true, rgb: brand });
    if (!rows.length) page.text(x, 306, 9, 'Belum ada data', { rgb: muted });
    rows.forEach((row, index) => {
      const share = data.origin.total ? Math.round(row.count / data.origin.total * 100) : 0;
      page.text(x, 306 + index * 14, 9, clip(row.name, 17), { rgb: ink });
      page.text(x + 160, 306 + index * 14, 9, `${whole.format(row.count)} (${share}%)`, { rgb: muted, align: 'right' });
    });
  });

  section(392, '4. Penggunaan fitur');
  page.text(40, 416, 9, 'Fitur', { bold: true, rgb: brand });
  page.text(400, 416, 9, `Kemarin`, { bold: true, rgb: brand, align: 'right' });
  page.text(520, 416, 9, `Sebelumnya`, { bold: true, rgb: brand, align: 'right' });
  [['png', 'PNG diunduh'], ['gif', 'GIF diunduh'], ['support_shown', 'Popup dukungan tampil'], ['support_trakteer', 'Klik Trakteer'], ['support_kofi', 'Klik Ko-fi']]
    .forEach(([key, label], index) => {
      const y = 432 + index * 14;
      page.text(40, y, 9.5, label, { rgb: ink });
      page.text(400, y, 9.5, whole.format(data.usage.day[key]), { bold: true, rgb: ink, align: 'right' });
      page.text(520, y, 9.5, whole.format(data.usage.previous[key]), { rgb: muted, align: 'right' });
    });
  const top = rows => rows.length ? rows.slice(0, 3).map(row => `${row.name} (${whole.format(row.count)})`).join(', ') : 'belum ada';
  page.text(40, 512, 9, `Tema terpopuler: ${top(data.usage.themes)}`, { rgb: muted });
  page.text(40, 526, 9, `Efek foto terpopuler: ${top(data.usage.filters)}`, { rgb: muted });

  section(556, '5. Tren dan waktu');
  page.text(40, 580, 9, 'Browser unik 7 hari terakhir', { bold: true, rgb: brand });
  const peak = Math.max(1, ...data.trend.map(row => row.count));
  data.trend.forEach((row, index) => {
    const x = 40 + index * 74, height = row.count / peak * 70;
    page.rect(x, 664 - height, 54, Math.max(height, 0.5), index === data.trend.length - 1 ? brand : soft);
    page.text(x + 27, 658 - height, 8, whole.format(row.count), { rgb: ink, align: 'center' });
    page.text(x + 27, 677, 8, dateFormat(row.date, { weekday: 'short', day: 'numeric' }), { rgb: muted, align: 'center' });
  });
  page.text(40, 704, 9, 'Browser aktif per jam kemarin (WIB)', { bold: true, rgb: brand });
  const hourPeak = Math.max(1, ...data.hourly.map(row => row.count));
  data.hourly.forEach((row, index) => {
    const x = 40 + index * 21.5, height = row.count / hourPeak * 52;
    page.rect(x, 764 - height, 16, Math.max(height, 0.5), row.count === hourPeak && row.count > 0 ? brand : soft);
    if (index % 3 === 0) page.text(x + 8, 778, 8, String(index), { rgb: muted, align: 'center' });
  });
  const busiest = data.hourly.reduce((best, row) => row.count > best.count ? row : best, { count: 0 });
  page.text(40, 796, 9, busiest.count ? `Jam tersibuk ${String(busiest.hour).padStart(2, '0')}.00-${String(busiest.hour).padStart(2, '0')}.59 WIB (${whole.format(busiest.count)} browser aktif).` : 'Belum ada aktivitas pada hari ini.', { rgb: ink });
  page.text(40, 826, 7.5, 'Hanya hitungan anonim. Laporan tidak memuat ID browser, IP, foto, atau teks pengguna.', { rgb: muted });
  return pdf.toBuffer();
}
