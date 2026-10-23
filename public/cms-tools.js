const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('id-ID');
const date = value => new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
const text = (tag, value) => { const node = document.createElement(tag); node.textContent = value; return node; };
let regions = [];
const SEASONS = [['halloween', 'Halloween'], ['lebaran', 'Lebaran'], ['natal', 'Natal'], ['newyear', 'Tahun Baru'], ['imlek', 'Imlek'], ['valentine', 'Valentine'],
  ['ramadan', 'Ramadan'], ['iduladha', 'Idul Adha'], ['paskah', 'Paskah'], ['merdeka', '17 Agustus']];
const WIB_OFFSET = 7 * 3600000;
const wibInput = iso => iso ? new Date(Date.parse(iso) + WIB_OFFSET).toISOString().slice(0, 16) : '';
const wibIso = value => value ? new Date(Date.parse(value + ':00+07:00')).toISOString() : null;
const wibDay = time => new Date(time + WIB_OFFSET).toISOString().slice(0, 10);

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
  const total = data.newBrowsers + data.returningBrowsers;
  const newShare = total ? data.newBrowsers / total * 100 : 0;
  const returningShare = total ? 100 - newShare : 0;
  const share = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value) + '%';
  $('donut-new').setAttribute('stroke-dasharray', `${newShare} ${100 - newShare}`);
  $('donut-returning').setAttribute('stroke-dasharray', `${returningShare} ${100 - returningShare}`);
  $('donut-returning').setAttribute('stroke-dashoffset', String(-newShare));
  $('donut-total').textContent = number.format(total);
  $('new-share').textContent = share(newShare);
  $('returning-share').textContent = share(returningShare);
  $('audience-donut-title').textContent = `${number.format(total)} browser: ${number.format(data.newBrowsers)} baru (${share(newShare)}), ${number.format(data.returningBrowsers)} kembali (${share(returningShare)}).`;
  $('audience-empty').hidden = total > 0;
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
  const eventNames = { login: 'Login berhasil', login_failed: 'Login gagal', logout: 'Keluar', logout_all: 'Keluar semua sesi', password_changed: 'Password diubah', mfa_enabled: '2FA diaktifkan', mfa_disabled: '2FA dinonaktifkan', recovery_regenerated: 'Kode pemulihan diganti', session_revoked: 'Sesi dicabut', visitors_reset: 'Data kunjungan direset', content_updated: 'Pengumuman diubah', site_config_updated: 'Pengaturan musim atau dukungan diubah', discord_notice_published: 'Pengumuman dipasang lewat Discord', discord_notice_hidden: 'Pengumuman disembunyikan lewat Discord', discord_migration_scheduled: 'Jadwal migrasi dibuat', discord_migration_started: 'Jadwal migrasi dimulai', discord_migration_skipped: 'Jadwal migrasi dilewati', discord_migration_done: 'Migrasi ditandai selesai', discord_migration_cancelled: 'Jadwal migrasi dibatalkan' };
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
      $('notice-title').value = content.title; $('notice-message').value = content.message;
      $('notice-starts').value = wibInput(content.startsAt); $('notice-ends').value = wibInput(content.endsAt);
      $('content-status').textContent = content.visibleNow ? 'Pengumuman sedang tampil di situs.' : content.enabled ? 'Pengumuman aktif, tetapi sedang di luar jadwal tampil.' : 'Pengumuman tidak aktif.';
    } catch (error) { $('content-status').textContent = 'Konten gagal dimuat: ' + error.message; }
  });
  $('content-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter || $('content-form').querySelector('button[type=submit]'); button.disabled = true;
    try {
      await api('/api/admin/content', { method: 'POST', body: JSON.stringify({ enabled: $('notice-enabled').checked, title: $('notice-title').value, message: $('notice-message').value, startsAt: wibIso($('notice-starts').value), endsAt: wibIso($('notice-ends').value) }) });
      $('content-status').textContent = 'Pengumuman tersimpan. Tab website yang aktif memuat perubahan maksimal sekitar satu menit.';
    } catch (error) { $('content-status').textContent = 'Gagal menyimpan: ' + error.message; }
    finally { button.disabled = false; }
  });

  function seasonRows() {
    if ($('seasons-rows').children.length) return;
    for (const [id, label] of SEASONS) {
      const row = document.createElement('div'); row.className = 'season-row';
      const field = (name, input) => { const wrap = document.createElement('label'); wrap.className = 'season-field'; wrap.append(text('span', name), input); return wrap; };
      const mode = document.createElement('select'); mode.id = 'season-mode-' + id;
      for (const [value, name] of [['auto', 'Otomatis'], ['on', 'Selalu tampil'], ['off', 'Sembunyikan']]) mode.add(new window.Option(name, value));
      const from = document.createElement('input'); from.type = 'date'; from.id = 'season-from-' + id;
      const to = document.createElement('input'); to.type = 'date'; to.id = 'season-to-' + id;
      row.append(text('strong', label), field('Mode', mode), field('Mulai', from), field('Selesai', to)); $('seasons-rows').append(row);
    }
  }
  async function siteConfig() {
    seasonRows();
    try {
      const config = await api('/api/admin/site-config');
      for (const [id] of SEASONS) {
        const rule = config.seasons[id] || {};
        $('season-mode-' + id).value = rule.mode || 'auto'; $('season-from-' + id).value = rule.from || ''; $('season-to-' + id).value = rule.to || '';
      }
      $('support-enabled').checked = config.support.enabled; $('support-trakteer-url').value = config.support.trakteerUrl; $('support-kofi-url').value = config.support.kofiUrl;
      $('seasons-status').textContent = 'Pengaturan musim sudah dimuat.'; $('support-status').textContent = 'Pengaturan dukungan sudah dimuat.';
    } catch (error) { $('seasons-status').textContent = $('support-status').textContent = 'Pengaturan gagal dimuat: ' + error.message; }
  }
  $('seasons-settings').addEventListener('toggle', () => { if ($('seasons-settings').open) siteConfig(); });
  $('support-settings').addEventListener('toggle', () => { if ($('support-settings').open) siteConfig(); });
  async function save(form, status, body, message) {
    const button = form.querySelector('button[type=submit]'); button.disabled = true;
    try { await api('/api/admin/site-config', { method: 'POST', body: JSON.stringify(body) }); $(status).textContent = message; }
    catch (error) { $(status).textContent = 'Gagal menyimpan: ' + error.message; }
    finally { button.disabled = false; }
  }
  $('seasons-form').addEventListener('submit', event => {
    event.preventDefault();
    const seasons = Object.fromEntries(SEASONS.map(([id]) => [id, { mode: $('season-mode-' + id).value, from: $('season-from-' + id).value, to: $('season-to-' + id).value }]));
    save($('seasons-form'), 'seasons-status', { seasons }, 'Musim tersimpan. Pengunjung memuat perubahan saat membuka atau memuat ulang situs.');
  });
  $('support-form').addEventListener('submit', event => {
    event.preventDefault();
    save($('support-form'), 'support-status', { support: { enabled: $('support-enabled').checked, trakteerUrl: $('support-trakteer-url').value, kofiUrl: $('support-kofi-url').value } },
      'Tautan dukungan tersimpan. Pengunjung memuat perubahan saat membuka atau memuat ulang situs.');
  });
  function usageRange() {
    const days = Number($('usage-range').value), today = wibDay(Date.now());
    return `from=${wibDay(Date.now() - (days - 1) * 86400000)}&to=${today}`;
  }
  function usageList(id, rows) {
    const peak = Math.max(1, ...rows.map(row => row.count));
    $(id).replaceChildren(...rows.map(row => {
      const item = document.createElement('li'); const bar = document.createElement('div'); bar.className = 'bar'; const fill = document.createElement('i'); fill.style.width = (row.count / peak * 100) + '%'; bar.append(fill);
      item.append(text('span', `${row.name}: ${number.format(row.count)}`), bar); return item;
    }));
    if (!rows.length) $(id).append(text('li', 'Belum ada data pada periode ini.'));
  }
  async function usage() {
    $('usage-status').textContent = 'Memuat penggunaan fitur…';
    try {
      const data = await api('/api/admin/usage?' + usageRange()); const t = data.totals; const clicks = t.support_trakteer + t.support_kofi;
      $('usage-png').textContent = number.format(t.png); $('usage-gif').textContent = number.format(t.gif);
      $('usage-shown').textContent = number.format(t.support_shown); $('usage-clicks').textContent = number.format(clicks);
      $('usage-support').textContent = t.support_shown ? `Trakteer ${number.format(t.support_trakteer)}, Ko-fi ${number.format(t.support_kofi)}. ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(clicks / t.support_shown * 100)}% dari popup yang tampil berujung klik.` : 'Belum ada popup dukungan pada periode ini.';
      usageList('usage-themes', data.themes); usageList('usage-filters', data.filters);
      $('usage-days').replaceChildren(...[...data.daily].reverse().map(row => { const tr = document.createElement('tr'); tr.append(text('td', row.date), ...[row.png, row.gif, row.support_shown, row.support_trakteer, row.support_kofi].map(value => { const td = text('td', number.format(value)); td.className = 'num'; return td; })); return tr; }));
      $('usage-status').textContent = `${data.from} s.d. ${data.to} (WIB). Hitungan anonim per kejadian.`;
    } catch (error) { $('usage-status').textContent = 'Penggunaan fitur gagal dimuat: ' + error.message; }
  }
  document.querySelector('[data-view="usage"]').addEventListener('click', usage); $('usage-range').addEventListener('change', usage);
  $('usage-export').addEventListener('click', async () => {
    $('usage-export').disabled = true;
    try {
      const response = await api('/api/admin/stats.csv?' + usageRange(), { raw: true }); const url = window.URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'snappie-statistik.csv'; document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000); $('usage-status').textContent = 'CSV statistik berhasil diunduh.';
    } catch (error) { $('usage-status').textContent = 'Unduhan gagal: ' + error.message; }
    finally { $('usage-export').disabled = false; }
  });
  const dailyReportText = state => !state ? 'Belum pernah dijalankan (jadwal 00.10 WIB)'
    : state.error === 'not_configured' ? 'Webhook Discord belum dikonfigurasi'
      : state.error === 'send_failed' ? `Pengiriman ${state.day} gagal, dicoba lagi pada jadwal berikutnya`
        : `Terkirim untuk ${state.sentDay} (${date(state.sentAt)})`;
  async function health() {
    $('health-status').textContent = 'Memeriksa layanan…'; $('refresh-health').disabled = true;
    try {
      const value = await api('/api/admin/health'); const gib = bytes => (bytes / 1073741824).toFixed(2) + ' GiB';
      const rows = [['Backend', `Aktif, berjalan ${Math.floor(value.uptimeSeconds / 60)} menit`], ['Database', value.databaseOk ? 'Integritas baik' : 'Pemeriksaan gagal'], ['Ukuran database utama', gib(value.databaseBytes)], ['Penyimpanan tersedia', `${gib(value.storageFreeBytes)} dari ${gib(value.storageTotalBytes)}`], ['Laporan harian Discord', dailyReportText(value.dailyReport)], ['Pemantauan terakhir', value.monitor ? date(value.monitor.checkedAt) : 'Belum berjalan'], ['Notifikasi', value.monitor?.notificationsConfigured ? (value.monitor.notificationChannel === 'discord' ? 'Discord: ' : '') + ( value.monitor.notificationOk === false ? 'Pengiriman terakhir gagal' : 'Tujuan terkonfigurasi') : 'Belum dikonfigurasi'], ['Backup luar server', value.offsite?.configured ? value.offsite.ok ? 'Berhasil terakhir: ' + date(value.offsite.lastSuccess) : 'Pengiriman terakhir gagal' : 'Belum dikonfigurasi']];
      $('health-data').replaceChildren(...rows.map(([label, content]) => { const row = document.createElement('div'); row.append(text('dt', label), text('dd', content)); return row; }));
      $('health-status').textContent = value.monitor?.issues?.length ? 'Perlu diperiksa: ' + value.monitor.issues.join(', ') : 'Status diperiksa ' + date(value.checkedAt) + '. Pemantauan berjalan setiap 5 menit.';
    } catch (error) { $('health-status').textContent = 'Status gagal dimuat: ' + error.message; }
    finally { $('refresh-health').disabled = false; }
  }
  $('health-settings').addEventListener('toggle', () => { if ($('health-settings').open) health(); }); $('refresh-health').addEventListener('click', health);
  async function discordStatus() {
    $('discord-bot-status').textContent = 'Memuat status bot…'; $('refresh-discord').disabled = true;
    try {
      const data = await api('/api/admin/discord');
      $('discord-bot-status').textContent = (data.configured ? 'Aplikasi bot sudah dikonfigurasi.' : 'Aplikasi bot belum dikonfigurasi; hubungkan aplikasi Discord melalui pengelola server.')
        + (data.scheduler ? ` Jadwal diperiksa ${date(data.scheduler.lastRun)}.${data.scheduler.failedDeliveries ? ' Ada pengingat yang belum terkirim dan akan dicoba lagi.' : ''}${!data.scheduler.discordConfigured ? ' Tujuan pengingat Discord belum dikonfigurasi.' : ''}` : ' Pemeriksa jadwal belum mencatat hasil.');
      const states = { scheduled: 'Menunggu jadwal', active: 'Waktu migrasi sudah tiba', done: 'Selesai', cancelled: 'Dibatalkan', superseded: 'Dilewati karena pengumuman diubah manual', missed: 'Dilewati karena terlambat lebih dari 24 jam' };
      $('discord-jobs').replaceChildren(...data.jobs.map(job => text('li', `${job.id}: ${job.title}; ${date(job.due_at)}; ${states[job.status] || job.status}; otomatis ${job.automatic ? 'ya' : 'tidak'}.`)));
      if (!data.jobs.length) $('discord-jobs').append(text('li', 'Belum ada jadwal migrasi.'));
    } catch (error) { $('discord-bot-status').textContent = 'Status bot gagal dimuat: ' + error.message; }
    finally { $('refresh-discord').disabled = false; }
  }
  $('discord-settings').addEventListener('toggle', () => { if ($('discord-settings').open) discordStatus(); });
  $('refresh-discord').addEventListener('click', discordStatus);
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
