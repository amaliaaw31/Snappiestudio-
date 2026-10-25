import { createAnalytics } from './analytics.js';
import { createSiteConfig } from './site-config.js';

const DAY = 86400000;
const WIB = 7 * 3600000;
const number = value => value.toLocaleString('id-ID');
const localDay = time => new Date(time + WIB).toISOString().slice(0, 10);
const noFilter = { from: '', to: '', q: '', province: '', page: 1, pageSize: 100 };
const option = (interaction, name) => (interaction.data?.options || []).find(item => item.name === name)?.value;
const percent = value => value === null ? 'tidak ada pembanding' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

// Hanya membaca data yang sama dengan menu Ringkasan, Tren, Wilayah, dan Penggunaan fitur di CMS.
export function createStatsCommands({ db, now = Date.now }) {
  // Lazy: skema visitors/usage baru dibuat saat command dipakai.
  let analytics, usage;
  const ready = () => { analytics ??= createAnalytics(db, now); usage ??= createSiteConfig(db, now); };
  const total = () => db.prepare('SELECT COUNT(*) AS total FROM visitors').get().total;
  const sections = {
    ringkasan() {
      ready();
      const s = analytics.summary(), c = analytics.comparison(noFilter);
      return `Ringkasan kunjungan (browser unik, WIB)\nTotal: ${number(total())}\nHari ini: ${number(s.today)}; kemarin: ${number(s.yesterday)}\nMinggu ini: ${number(s.week)}; bulan ini: ${number(s.month)}\n7 hari terakhir (${c.from} s/d ${c.to}): ${number(c.current)} baru, ${percent(c.percent)} dari periode sebelumnya (${number(c.previous)})`;
    },
    tren() {
      ready();
      const to = localDay(now());
      const chart = analytics.charts({ ...noFilter, from: localDay(now() - 6 * DAY), to });
      const peaks = chart.hourly.filter(row => row.count).sort((a, b) => b.count - a.count || a.hour - b.hour).slice(0, 3);
      return `Browser aktif per hari (7 hari terakhir)\n${chart.daily.map(row => `${row.date}: ${number(row.count)}`).join('\n')}\nJam tersibuk: ${peaks.length ? peaks.map(row => `${String(row.hour).padStart(2, '0')}.00 WIB (${number(row.count)})`).join(', ') : 'belum ada data'}`;
    },
    wilayah() {
      ready();
      const provinces = new Map();
      for (const row of analytics.locations(noFilter).locations) {
        const name = row.province || row.country || 'Tidak diketahui';
        provinces.set(name, (provinces.get(name) || 0) + row.count);
      }
      const top = [...provinces].sort((a, b) => b[1] - a[1]).slice(0, 10);
      return top.length ? `Wilayah teratas (browser unik)\n${top.map(([name, count], index) => `${index + 1}. ${name}: ${number(count)}`).join('\n')}` : 'Belum ada data wilayah.';
    },
  };
  return {
    pengunjung: interaction => {
      const run = sections[interaction.data?.options?.[0]?.name];
      return run ? run() : 'Gunakan /pengunjung ringkasan, tren, atau wilayah.';
    },
    penggunaan: interaction => {
      const days = option(interaction, 'hari') ?? 7;
      if (!Number.isInteger(days) || days < 1 || days > 90) return 'Jumlah hari harus 1–90.';
      ready();
      const to = localDay(now());
      const report = usage.report({ from: localDay(now() - (days - 1) * DAY), to });
      const list = rows => rows.length ? rows.slice(0, 5).map(row => `${row.name} (${number(row.count)})`).join(', ') : 'belum ada';
      const t = report.totals;
      return `Penggunaan fitur ${report.from} s/d ${report.to}\nPNG diunduh: ${number(t.png)}; GIF diunduh: ${number(t.gif)}\nPopup dukungan tampil: ${number(t.support_shown)}; klik Trakteer: ${number(t.support_trakteer)}; klik Ko-fi: ${number(t.support_kofi)}\nTema teratas: ${list(report.themes)}\nEfek foto teratas: ${list(report.filters)}`;
    },
  };
}
