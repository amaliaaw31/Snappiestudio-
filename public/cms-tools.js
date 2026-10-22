const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('id-ID');
const date = value => new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
const text = (tag, value) => { const node = document.createElement(tag); node.textContent = value; return node; };
let regions = [];

function compareRegions() {
  const first = regions[Number($('region-first').value)], second = regions[Number($('region-second').value)];
  $('region-comparison-result').textContent = !first || !second ? 'Belum cukup data wilayah untuk dibandingkan.'
    : first === second ? 'Pilih dua wilayah berbeda.'
      : `${first.name}: ${number.format(first.count)} browser. ${second.name}: ${number.format(second.count)} browser. Selisih ${number.format(Math.abs(first.count - second.count))} browser. Wilayah yang saling mencakup tidak boleh dijumlahkan.`;
}

export function renderInsights(data, locations) {
  if (!data) return;
  $('new-browsers').textContent = number.format(data.newBrowsers);
  $('returning-browsers').textContent = number.format(data.returningBrowsers);
  $('audience-summary').textContent = `${data.from} s.d. ${data.to}, mengikuti filter. “Kembali” berarti pertama tercatat sebelum periode ini. Riwayat aktivitas tersedia sejak ${date(data.trackingSince.replace(' ', 'T') + 'Z')}; data lama bisa belum lengkap.`;
  $('audience-trend').replaceChildren(...data.trend.map(row => { const item = document.createElement('tr'); item.append(text('td', row.date), text('td', number.format(row.newBrowsers)), text('td', number.format(row.returningBrowsers))); return item; }));
  const calendar = $('visit-calendar'); calendar.replaceChildren();
  $('calendar-month').textContent = new Date(data.calendar.month + '-01T00:00:00Z').toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  for (const day of ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']) calendar.append(text('span', day));
  const offset = (new Date(data.calendar.month + '-01T00:00:00Z').getUTCDay() + 6) % 7;
  for (let i = 0; i < offset; i++) calendar.append(document.createElement('span'));
  const peak = Math.max(1, ...data.calendar.days.map(day => day.count));
  for (const day of data.calendar.days) {
    const item = text('div', day.date.slice(-2)); item.className = 'calendar-day calendar-level-' + (day.count ? Math.ceil(day.count / peak * 3) : 0);
    item.append(text('strong', number.format(day.count))); item.title = `${day.date}: ${day.count} browser unik`; calendar.append(item);
  }
  const map = new Map();
  for (const row of locations.locations) for (const [kind, name] of [['Negara', row.country], ['Provinsi', row.province ? `${row.province}, ${row.country || '?'}` : ''], ['Kota', row.city ? `${row.city}, ${row.province || row.country || '?'}` : '']]) {
    if (!name) continue;
    const label = kind + ': ' + name; map.set(label, (map.get(label) || 0) + row.count);
  }
  const old = [$('region-first').selectedOptions[0]?.textContent, $('region-second').selectedOptions[0]?.textContent];
  regions = [...map].map(([name, count]) => ({ name, count }));
  for (const [index, id] of ['region-first', 'region-second'].entries()) {
    $(id).replaceChildren(...regions.map((region, i) => new window.Option(region.name, String(i))));
    const previous = regions.findIndex(region => region.name === old[index]);
    $(id).value = String(previous >= 0 ? previous : Math.min(index, regions.length - 1));
  }
  compareRegions();
}

export function initCmsTools({ api }) {
  $('region-first').addEventListener('change', compareRegions); $('region-second').addEventListener('change', compareRegions);
  const printReport = () => { document.querySelector('[data-view="overview"]').click(); window.print(); };
  $('print-report').addEventListener('click', printReport); $('print-overview').addEventListener('click', printReport);
  let auditCursor = null;
  const eventNames = { login: 'Login berhasil', login_failed: 'Login gagal', logout: 'Keluar', logout_all: 'Keluar semua sesi', password_changed: 'Password diubah', mfa_enabled: '2FA diaktifkan', mfa_disabled: '2FA dinonaktifkan', recovery_regenerated: 'Kode pemulihan diganti', session_revoked: 'Sesi dicabut', visitors_reset: 'Data kunjungan direset', content_updated: 'Pengumuman diubah' };
  async function audit(append = false) {
    $('audit-status').textContent = 'Memuat riwayat…';
    $('audit-refresh').disabled = true; $('audit-more').disabled = true;
    try {
      const data = await api('/api/admin/audit' + (append && auditCursor ? '?before=' + auditCursor : ''));
      if (!append) $('audit-list').replaceChildren();
      for (const event of data.events) $('audit-list').append(text('li', `${date(event.at)}: ${eventNames[event.event] || event.event}`));
      auditCursor = data.events.at(-1)?.id;
      $('audit-more').disabled = data.events.length < 50;
      $('audit-status').textContent = $('audit-list').children.length ? `${$('audit-list').children.length} kejadian ditampilkan.` : 'Belum ada aktivitas tercatat.';
    } catch (error) { $('audit-status').textContent = 'Riwayat gagal dimuat: ' + error.message; }
    finally { $('audit-refresh').disabled = false; }
  }
  $('audit-settings').addEventListener('toggle', () => { if ($('audit-settings').open) audit(); });
  $('audit-refresh').addEventListener('click', () => audit()); $('audit-more').addEventListener('click', () => audit(true));
  async function sessions() {
    $('sessions-status').textContent = 'Memuat sesi…'; $('refresh-sessions').disabled = true;
    try {
      const data = await api('/api/admin/account/sessions');
      $('session-id').replaceChildren(new window.Option('Pilih sesi lain', ''));
      for (const session of data.sessions) {
        const option = new window.Option(`${session.device}${session.current ? ' (sesi ini)' : ''} · terakhir ${date(session.lastSeen)}`, session.id);
        option.disabled = session.current; $('session-id').add(option);
      }
      $('sessions-status').textContent = `${data.sessions.length} sesi aktif. Untuk mencabut sesi lain, pilih sesi lalu isi password dan kode 2FA jika aktif.`;
    } catch (error) { $('sessions-status').textContent = 'Daftar sesi gagal dimuat: ' + error.message; }
    finally { $('refresh-sessions').disabled = false; }
  }
  $('refresh-sessions').addEventListener('click', sessions);
  $('account-settings').addEventListener('toggle', () => { if ($('account-settings').open) sessions(); });
  $('content-settings').addEventListener('toggle', async () => {
    if (!$('content-settings').open) return;
    try {
      const content = await api('/api/admin/content'); $('notice-enabled').checked = content.enabled;
      $('notice-title').value = content.title; $('notice-message').value = content.message; $('content-status').textContent = 'Konten saat ini sudah dimuat.';
    } catch (error) { $('content-status').textContent = 'Konten gagal dimuat: ' + error.message; }
  });
  $('content-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter || $('content-form').querySelector('button[type=submit]'); button.disabled = true;
    try {
      await api('/api/admin/content', { method: 'POST', body: JSON.stringify({ enabled: $('notice-enabled').checked, title: $('notice-title').value, message: $('notice-message').value }) });
      $('content-status').textContent = 'Pengumuman tersimpan. Pengunjung melihat perubahan saat halaman dibuka kembali.';
    } catch (error) { $('content-status').textContent = 'Gagal menyimpan: ' + error.message; }
    finally { button.disabled = false; }
  });
  async function health() {
    $('health-status').textContent = 'Memeriksa layanan…'; $('refresh-health').disabled = true;
    try {
      const value = await api('/api/admin/health'); const gib = bytes => (bytes / 1073741824).toFixed(2) + ' GiB';
      const rows = [['Backend', `Aktif, berjalan ${Math.floor(value.uptimeSeconds / 60)} menit`], ['Database', value.databaseOk ? 'Integritas baik' : 'Pemeriksaan gagal'], ['Ukuran database utama', gib(value.databaseBytes)], ['Penyimpanan tersedia', `${gib(value.storageFreeBytes)} dari ${gib(value.storageTotalBytes)}`], ['Pemantauan terakhir', value.monitor ? date(value.monitor.checkedAt) : 'Belum berjalan'], ['Notifikasi', value.monitor?.notificationsConfigured ? value.monitor.notificationOk === false ? 'Pengiriman terakhir gagal' : 'Tujuan terkonfigurasi' : 'Belum dikonfigurasi'], ['Backup luar server', value.offsite?.configured ? value.offsite.ok ? 'Berhasil terakhir: ' + date(value.offsite.lastSuccess) : 'Pengiriman terakhir gagal' : 'Belum dikonfigurasi']];
      $('health-data').replaceChildren(...rows.map(([label, content]) => { const row = document.createElement('div'); row.append(text('dt', label), text('dd', content)); return row; }));
      $('health-status').textContent = value.monitor?.issues?.length ? 'Perlu diperiksa: ' + value.monitor.issues.join(', ') : 'Status diperiksa ' + date(value.checkedAt) + '. Pemantauan berjalan setiap 5 menit.';
    } catch (error) { $('health-status').textContent = 'Status gagal dimuat: ' + error.message; }
    finally { $('refresh-health').disabled = false; }
  }
  $('health-settings').addEventListener('toggle', () => { if ($('health-settings').open) health(); }); $('refresh-health').addEventListener('click', health);
  let reports = [];
  function selectedReport() {
    const value = reports[Number($('saved-report').value)]; $('download-saved-report').disabled = !value;
    $('saved-report-summary').textContent = value ? `${value.from} s.d. ${value.to}: ${value.comparison.current} browser unik; sebelumnya ${value.comparison.previous}. Baru ${value.insights.newBrowsers}, kembali ${value.insights.returningBrowsers}. Dibuat ${date(value.generatedAt)}.` : 'Belum ada laporan tersimpan. Laporan dibuat otomatis setiap hari pukul 03.00 WIB.';
  }
  $('reports-settings').addEventListener('toggle', async () => {
    if (!$('reports-settings').open) return;
    try { reports = (await api('/api/admin/reports')).reports; $('saved-report').replaceChildren(...reports.map((report, index) => new window.Option(report.type + ': ' + report.from + ' s.d. ' + report.to, String(index)))); selectedReport(); }
    catch (error) { $('saved-report-summary').textContent = 'Laporan gagal dimuat: ' + error.message; }
  });
  $('saved-report').addEventListener('change', selectedReport);
  $('download-saved-report').addEventListener('click', () => {
    const value = reports[Number($('saved-report').value)]; if (!value) return;
    const url = window.URL.createObjectURL(new window.Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'snappie-' + value.period + '.json'; link.click(); window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  });
  let printTheme;
  window.addEventListener('beforeprint', () => {
    printTheme = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = 'light';
    window.dispatchEvent(new window.CustomEvent('cms-theme-change'));
  });
  window.addEventListener('afterprint', () => {
    if (printTheme) document.documentElement.dataset.theme = printTheme;
    else delete document.documentElement.dataset.theme;
    window.dispatchEvent(new window.CustomEvent('cms-theme-change'));
  });
}
