import { initCmsTools, renderInsights } from './cms-tools.js';
import { excludeMaintenanceBrowser } from './cms-maintenance.js';

try { sessionStorage.removeItem('snappieCmsAuth'); } catch {}
const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('id-ID');
const percent = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const visitDate = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
});
const visitTime = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
let csrfToken = '';
let page = 1;
let pages = 1;
let appliedFilters = { from: '', to: '', q: '', province: '' };
let requestController;
let chartData;
let timer;
let lastInteraction = Date.now();
let currentView = 'overview';
const viewButtons = [...document.querySelectorAll('.dashboard-nav button')];
const viewText = {
  overview: ['Statistik kunjungan', 'Lihat kapan browser berkunjung dan dari wilayah mana.'],
  visits: ['Daftar kunjungan', 'Telusuri pengunjung dan unduh laporan sesuai filter.'],
  settings: ['Pengaturan CMS', 'Kelola akun, autentikator, dan status pemeliharaan.'],
};
for (const button of viewButtons) button.addEventListener('click', () => {
  currentView = button.dataset.view;
  for (const item of viewButtons) {
    const active = item === button;
    item.setAttribute('aria-pressed', String(active));
    $(item.getAttribute('aria-controls')).hidden = !active;
  }
  for (const element of document.querySelectorAll('[data-report-control], #tracking-note')) element.hidden = currentView === 'settings';
  [$('view-heading').textContent, $('view-description').textContent] = viewText[currentView];
  if (currentView === 'overview') drawCharts();
});
document.querySelector('.dashboard-nav').hidden = false;

function utcDate(value) {
  return new Date(`${value.replace(' ', 'T')}Z`);
}

function cell(text, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = text;
  return td;
}

function renderLocations(data) {
  const body = $('locations');
  body.replaceChildren();
  const total = data.total || 0;
  const known = data.locations.filter(row => row.country_code);
  $('countries').textContent = number.format(new Set(known.map(row => row.country_code)).size);
  $('provinces').textContent = number.format(new Set(known.filter(row => row.province).map(row => `${row.country_code}|${row.province}`)).size);
  $('cities').textContent = number.format(new Set(known.filter(row => row.city).map(row => `${row.country_code}|${row.province || ''}|${row.city}`)).size);
  $('unknown').textContent = number.format(data.locations.filter(row => !row.country_code).reduce((sum, row) => sum + row.count, 0));
  $('empty').hidden = data.locations.length > 0;
  for (const row of data.locations) {
    const share = total ? (row.count / total) * 100 : 0;
    const tr = document.createElement('tr');
    tr.append(cell(row.country || 'Tidak diketahui'), cell(row.province || 'Belum diketahui'), cell(row.city || 'Belum diketahui'), cell(number.format(row.count), 'num'));
    const barCell = document.createElement('td');
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', `${percent.format(share)}%`);
    const fill = document.createElement('i');
    fill.style.width = `${share}%`;
    bar.append(fill);
    barCell.append(bar);
    const shareText = document.createElement('span');
    shareText.className = 'share-text';
    shareText.textContent = `${percent.format(share)}%`;
    barCell.append(shareText);
    tr.append(barCell);
    body.append(tr);
  }
  renderProvinces(data);
}

function renderProvinces(data) {
  const provinces = new Map();
  let unknown = 0;
  for (const row of data.locations) {
    if (!row.province) { unknown += row.count; continue; }
    const key = JSON.stringify([row.country_code, row.province]);
    const entry = provinces.get(key) || { name: row.province, country: row.country || 'Tidak diketahui', count: 0 };
    entry.count += row.count;
    provinces.set(key, entry);
  }
  const rows = [...provinces.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'id'));
  const shown = rows.slice(0, 10);
  $('province-summary').textContent = data.total
    ? `${number.format(data.total)} browser sesuai filter. ${number.format(unknown)} browser belum memiliki data provinsi.${rows.length > 10 ? ' Diagram menampilkan 10 provinsi terbanyak; daftar lokasi memuat seluruh wilayah.' : ''}`
    : 'Tidak ada kunjungan sesuai filter. Pilih Semua data untuk melihat seluruh catatan.';
  const list = $('province-chart');
  list.replaceChildren();
  for (const row of shown) {
    const item = document.createElement('li');
    const heading = document.createElement('div');
    heading.className = 'province-label';
    const name = document.createElement('span');
    name.textContent = `${row.name}, ${row.country}`;
    const count = document.createElement('strong');
    count.textContent = `${number.format(row.count)} (${percent.format(row.count / data.total * 100)}%)`;
    heading.append(name, count);
    const bar = document.createElement('meter');
    bar.min = 0; bar.max = data.total; bar.value = row.count;
    bar.setAttribute('aria-label', `${row.name}, ${row.country}: ${number.format(row.count)} dari ${number.format(data.total)} browser`);
    item.append(heading, bar);
    list.append(item);
  }
  if (data.total && !rows.length) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Provinsi belum tersedia. Kunjungan baru akan mengisi diagram jika basis data lokasi menyediakan provinsi.';
    list.append(empty);
  }
}

async function api(path, { raw = false, ...options } = {}) {
  const response = await fetch(path, {
    cache: 'no-store', credentials: 'same-origin', ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.method === 'POST' ? { 'X-CSRF-Token': csrfToken } : {}) },
  });
  if (response.status === 401 || response.status === 403) {
    location.replace('/cms');
    throw new Error('Sesi berakhir');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Permintaan gagal');
  }
  return raw ? response : response.json();
}

function timestampCell(value) {
  const date = utcDate(value);
  const td = cell(visitDate.format(date), 'visit-time');
  const time = document.createElement('span');
  time.textContent = `${visitTime.format(date)} WIB`;
  td.append(time);
  return td;
}

function renderVisits(data) {
  const body = $('visits');
  body.replaceChildren();
  $('visits-empty').hidden = data.visits.length > 0;
  page = data.page;
  pages = data.pages;
  const first = data.total ? (page - 1) * data.pageSize + 1 : 0;
  const last = data.total ? first + data.visits.length - 1 : 0;
  $('visits-summary').textContent = `Menampilkan ${number.format(first)}–${number.format(last)} dari ${number.format(data.total)} browser unik sesuai filter. Diurutkan berdasarkan kunjungan terakhir.`;
  $('page-info').textContent = `Halaman ${number.format(page)} dari ${number.format(pages)}`;
  $('previous').disabled = page <= 1;
  $('next').disabled = page >= pages;
  for (const row of data.visits) {
    const tr = document.createElement('tr');
    tr.append(
      timestampCell(row.first_seen), timestampCell(row.last_seen),
      cell(row.country || 'Tidak diketahui'), cell(row.province || 'Belum diketahui'), cell(row.city || 'Belum diketahui'),
    );
    body.append(tr);
  }
}

function query() {
  return new window.URLSearchParams({ ...appliedFilters, page, pageSize: $('page-size').value }).toString();
}

function drawChart(id, rows, label) {
  const canvas = $(id);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const styles = window.getComputedStyle(canvas);
  const text = styles.getPropertyValue('--muted').trim();
  const left = 42;
  const top = 18;
  const plotWidth = width - left - 8;
  const plotHeight = height - top - 32;
  const max = Math.max(1, ...rows.map(row => row.count));
  const tick = Math.ceil(max / 4);
  const ceiling = tick * 4;
  ctx.font = '11px system-ui';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = top + plotHeight * i / 4;
    ctx.strokeStyle = styles.getPropertyValue('--line').trim();
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - 8, y); ctx.stroke();
    ctx.fillStyle = text;
    ctx.textAlign = 'right';
    ctx.fillText(number.format(tick * (4 - i)), left - 6, y);
  }
  const step = plotWidth / Math.max(1, rows.length);
  const labelStep = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(plotWidth / 70))));
  rows.forEach((row, index) => {
    const barHeight = plotHeight * row.count / ceiling;
    ctx.fillStyle = styles.getPropertyValue('--accent').trim();
    ctx.fillRect(left + index * step + step * .15, top + plotHeight - barHeight, step * .7, barHeight);
    if (index % labelStep === 0 && rows.length - 1 - index >= labelStep || index === rows.length - 1) {
      ctx.fillStyle = text;
      ctx.textAlign = index === rows.length - 1 ? 'right' : 'center';
      ctx.fillText(label(row), left + (index + .5) * step, height - 12);
    }
  });
  const description = rows.map(row => `${label(row)}: ${number.format(row.count)}`).join('; ');
  canvas.setAttribute('aria-label', description);
  canvas.onpointermove = event => {
    const x = event.clientX - canvas.getBoundingClientRect().left;
    const index = Math.floor((x - left) / step);
    canvas.title = rows[index] ? `${label(rows[index])}: ${number.format(rows[index].count)} browser` : '';
  };
}

function drawCharts() {
  if (!chartData) return;
  drawChart('trend-chart', chartData.daily, row => chartData.unit === 'day'
    ? `${row.date.slice(8)}/${row.date.slice(5, 7)}`
    : chartData.unit === 'month' ? `${row.date.slice(5)}/${row.date.slice(2, 4)}` : row.date);
  drawChart('hour-chart', chartData.hourly, row => `${String(row.hour).padStart(2, '0')}.00`);
}

function renderCharts(data) {
  chartData = data;
  const unit = { day: 'hari', month: 'bulan', year: 'tahun' }[data.unit];
  document.querySelector('.trend-card h2').textContent = `Kunjungan per ${unit}`;
  $('trend-summary').textContent = `Browser unik per ${unit}, ${data.from} s.d. ${data.to} (WIB).${data.daily.some(row => row.count) ? '' : ' Belum ada kunjungan pada periode ini. Pilih periode lain atau Semua data.'}`;
  const peak = Math.max(...data.hourly.map(row => row.count));
  const peakHours = data.hourly.filter(row => row.count === peak).map(row => `${String(row.hour).padStart(2, '0')}.00`);
  const hours = peakHours.slice(0, 3).join(', ') + (peakHours.length > 3 ? ` dan ${peakHours.length - 3} jam lainnya` : '');
  $('hour-summary').textContent = peak ? `Teramai pukul ${hours} WIB: ${number.format(peak)} browser aktif. Periode mengikuti grafik perkembangan.` : 'Belum ada aktivitas pada periode grafik.';
  for (const [id, rows, label] of [
    ['trend-data', data.daily, row => row.date],
    ['hour-data', data.hourly, row => `${String(row.hour).padStart(2, '0')}.00`],
  ]) {
    $(id).replaceChildren();
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.append(cell(label(row)), cell(number.format(row.count), 'num'));
      $(id).append(tr);
    }
  }
  drawCharts();
}

function renderComparison(data) {
  if (!data) {
    $('comparison-note').textContent = 'Perbandingan belum tersedia. Muat ulang setelah pembaruan layanan selesai.';
    return;
  }
  const day = value => visitDate.format(new Date(`${value}T00:00:00+07:00`));
  $('comparison-current').textContent = number.format(data.current);
  $('comparison-previous').textContent = number.format(data.previous);
  $('comparison-current-label').textContent = `${day(data.from)} sampai ${day(data.to)}`;
  $('comparison-previous-label').textContent = `${day(data.previousFrom)} sampai ${day(data.previousTo)}`;
  $('comparison-note').textContent = `Browser unik dalam dua periode masing-masing ${number.format(data.days)} hari, sesuai filter lokasi. Tanpa tanggal, perbandingan memakai 7 hari terakhir.${data.includesToday ? ' Hari ini masih berjalan.' : ''}`;
  const difference = `${data.difference > 0 ? '+' : ''}${number.format(data.difference)}`;
  $('comparison-change').textContent = data.percent === null
    ? `Selisih ${difference} browser. Periode sebelumnya belum memiliki kunjungan; persentase belum dapat dihitung.`
    : `Selisih ${difference} browser (${data.percent > 0 ? '+' : ''}${percent.format(data.percent)}%) dibanding periode sebelumnya.`;
}

async function loadData() {
  requestController?.abort();
  const controller = new window.AbortController();
  requestController = controller;
  $('previous').disabled = true;
  $('next').disabled = true;
  $('status').textContent = 'Memuat statistik kunjungan…';
  document.querySelector('.dashboard').setAttribute('aria-busy', 'true');
  try {
    const stats = await api(`/api/admin/report?${query()}`, { signal: controller.signal });
    if (controller.signal.aborted) return;
    $('total').textContent = number.format(stats.total);
    $('since').textContent = stats.since
      ? `Mulai dihitung ${visitDate.format(utcDate(stats.since))}, ${visitTime.format(utcDate(stats.since))} WIB`
      : 'Belum ada pengunjung tercatat';
    for (const key of ['today', 'yesterday', 'week', 'month']) $(key).textContent = number.format(stats.summary[key]);
    const since = utcDate(stats.summary.trackingSince);
    $('tracking-note').textContent = `Ringkasan di atas mencakup seluruh lokasi dan tidak mengikuti filter. Satu browser dihitung sekali per periode, termasuk kunjungan ulang. Riwayat kunjungan ulang tersedia mulai ${visitDate.format(since)}, ${visitTime.format(since)} WIB; data sebelumnya hanya memuat kunjungan pertama.`;
    $('filter-summary').textContent = `Filter daftar, lokasi, grafik, dan CSV: ${appliedFilters.from || 'awal pencatatan'} s.d. ${appliedFilters.to || 'sekarang'}${appliedFilters.q ? `; lokasi “${appliedFilters.q}”` : ''}${appliedFilters.province ? `; provinsi “${appliedFilters.province}”` : ''}. Tanpa tanggal, grafik menampilkan 30 hari terakhir.`;
    renderLocations(stats.locations);
    renderVisits(stats.visitors);
    renderCharts(stats.charts);
    renderComparison(stats.comparison);
    const selectedProvince = appliedFilters.province || '';
    $('province-filter').replaceChildren(new window.Option('Semua provinsi', ''), ...(stats.provinces || []).map(name => new window.Option(name, name)));
    $('province-filter').value = selectedProvince;
    renderInsights(stats.insights, stats.locations);
    try { localStorage.setItem('snappie-cms-report-preferences', JSON.stringify({ ...appliedFilters, pageSize: $('page-size').value })); } catch {}
    $('status').textContent = `Diperbarui ${visitTime.format(new Date())} WIB.`;
  } catch (error) {
    if (controller.signal.aborted) return;
    $('status').textContent = `Tidak dapat memuat statistik: ${error.message}. Tekan Muat ulang untuk mencoba lagi. Data yang sudah tampil belum diperbarui.`;
    $('previous').disabled = page <= 1;
    $('next').disabled = page >= pages;
  } finally {
    if (requestController === controller) document.querySelector('.dashboard').setAttribute('aria-busy', 'false');
  }
}

$('refresh').addEventListener('click', loadData);
$('filters').addEventListener('submit', event => {
  event.preventDefault();
  if ($('from').value && $('to').value && $('from').value > $('to').value) {
    $('status').textContent = 'Tanggal mulai harus sebelum atau sama dengan tanggal akhir.';
    return;
  }
  appliedFilters = { from: $('from').value, to: $('to').value, q: $('search').value.trim(), province: $('province-filter').value };
  page = 1;
  loadData();
});
$('clear-filters').addEventListener('click', () => {
  $('filters').reset();
  appliedFilters = { from: '', to: '', q: '', province: '' };
  page = 1;
  loadData();
});
for (const button of document.querySelectorAll('[data-period]')) {
  button.addEventListener('click', () => {
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const period = button.dataset.period;
    $('to').value = today;
    $('from').value = period === 'month' ? today.slice(0, 8) + '01' : period === 'today' ? today
      : new Date(Date.parse(`${today}T00:00:00Z`) - (Number(period) - 1) * 86400000).toISOString().slice(0, 10);
    $('filters').requestSubmit();
  });
}
$('previous').addEventListener('click', () => { if (page > 1) { page--; loadData(); } });
$('next').addEventListener('click', () => { if (page < pages) { page++; loadData(); } });
$('page-size').addEventListener('change', () => { page = 1; loadData(); });
$('export').addEventListener('click', async () => {
  $('export').disabled = true;
  try {
    const response = await api(`/api/admin/export.csv?${query()}`, { raw: true });
    const url = window.URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url; link.download = 'snappie-pengunjung.csv';
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    $('status').textContent = 'CSV seluruh halaman sesuai filter berhasil diunduh.';
  } catch (error) { $('status').textContent = `Unduhan gagal: ${error.message}`; }
  finally { $('export').disabled = false; }
});
$('auto-refresh').addEventListener('change', () => {
  try { localStorage.setItem('snappie-cms-auto-refresh', $('auto-refresh').checked ? '1' : '0'); } catch {}
});
for (const event of ['pointerdown', 'keydown', 'input']) document.addEventListener(event, () => { lastInteraction = Date.now(); }, { passive: true });
function autoRefresh() {
  if (currentView === 'settings' || accountBusy || !$('auto-refresh').checked || document.hidden || $('reset').disabled || $('logout').disabled) return;
  if (Date.now() - lastInteraction > 5 * 60 * 1000) return;
  loadData();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) autoRefresh(); });
new window.ResizeObserver(drawCharts).observe($('trend-chart').parentElement);
window.addEventListener('cms-theme-change', drawCharts);
$('logout').addEventListener('click', async () => {
  $('logout').disabled = true;
  requestController?.abort();
  try {
    await api('/api/admin/logout', { method: 'POST' });
    csrfToken = '';
    window.clearInterval(timer);
    location.replace('/cms');
  } catch {
    $('status').textContent = 'Gagal keluar. Coba lagi untuk mengakhiri sesi di server.';
    $('logout').disabled = false;
  }
});
$('reset').addEventListener('click', () => {
  $('reset-confirmation').value = ''; $('reset-error').textContent = '';
  $('reset-dialog').showModal(); $('reset-confirmation').focus();
});
$('cancel-reset').addEventListener('click', () => $('reset-dialog').close());
$('reset-form').addEventListener('submit', async event => {
  event.preventDefault();
  if ($('reset-confirmation').value !== 'RESET KUNJUNGAN') { $('reset-error').textContent = 'Ketik RESET KUNJUNGAN persis seperti contoh.'; return; }
  const button = event.submitter || $('reset-form').querySelector('button[type=submit]'); button.disabled = true; $('reset').disabled = true;
  requestController?.abort();
  try {
    await api('/api/admin/reset', { method: 'POST', body: JSON.stringify({ confirmation: $('reset-confirmation').value }) });
    $('reset-dialog').close(); await loadData();
  } catch (error) { $('reset-error').textContent = `Reset gagal: ${error.message}`; }
  finally { button.disabled = false; $('reset').disabled = false; }
});

let recoveryCodes = [];
let accountBusy = false;

function clearEnrollment() {
  $('mfa-enrollment').hidden = true;
  $('mfa-secret').textContent = '';
  $('mfa-qr').removeAttribute('src');
  $('mfa-setup-code').value = '';
}

function clearRecovery() {
  recoveryCodes = [];
  $('recovery-codes').textContent = '';
  $('recovery-result').hidden = true;
}

async function loadAccount() {
  const data = await api('/api/admin/account');
  $('account-info').textContent = `Akun ${data.username}. ${data.mfaEnabled ? `2FA aktif, ${number.format(data.recoveryCodesRemaining)} kode pemulihan tersisa.` : '2FA belum aktif.'} ${number.format(data.activeSessions)} sesi aktif.`;
  $('account-otp-fields').hidden = !data.mfaEnabled;
  $('account-otp').required = data.mfaEnabled;
  $('mfa-setup').hidden = data.mfaEnabled;
  $('mfa-disable').hidden = !data.mfaEnabled;
  $('mfa-recovery').hidden = !data.mfaEnabled;
}

$('account-settings').addEventListener('toggle', async () => {
  if (!$('account-settings').open || accountBusy) return;
  $('account-status').textContent = 'Memuat status akun…';
  try { await loadAccount(); $('account-status').textContent = ''; }
  catch (error) { $('account-status').textContent = `Status akun gagal dimuat: ${error.message}. Tutup lalu buka kembali bagian ini untuk mencoba lagi.`; }
});

$('account-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (accountBusy) return;
  const action = event.submitter?.value;
  if (!action) return;
  if (action === 'sessions/revoke' && !$('session-id').value) { $('account-status').textContent = 'Pilih sesi lain yang akan diakhiri.'; $('session-id').focus(); return; }
  if (action === 'password' && [...$('new-password').value].length < 12) {
    $('account-status').textContent = 'Masukkan password baru dengan minimal 12 karakter.';
    $('new-password').focus();
    return;
  }
  accountBusy = true;
  requestController?.abort();
  const controls = [...$('account-form').querySelectorAll('button')];
  controls.forEach(button => { button.disabled = true; });
  $('account-status').textContent = 'Memeriksa dan menyimpan perubahan akun…';
  try {
    const body = { currentPassword: $('current-password').value, otp: $('account-otp').value.trim() };
    if (action === 'sessions/revoke') body.id = $('session-id').value;
    if (action === 'password') body.newPassword = $('new-password').value;
    if (action === 'mfa/enable') body.setupCode = $('mfa-setup-code').value.trim();
    const data = await api(`/api/admin/account/${action}`, { method: 'POST', body: JSON.stringify(body) });
    if (data.csrfToken) csrfToken = data.csrfToken;
    if (data.signedOut) {
      location.replace(`/cms?updated=${action === 'password' ? 'password' : 'sessions'}`);
      return;
    }
    if (action === 'mfa/setup') {
      clearRecovery();
      $('mfa-qr').src = data.qrCode;
      $('mfa-secret').textContent = data.secret;
      $('mfa-enrollment').hidden = false;
      $('mfa-setup-code').focus();
      $('account-status').textContent = 'Pindai QR, lalu masukkan kode aplikasi dan password saat ini untuk mengaktifkan 2FA.';
    } else {
      clearEnrollment();
      clearRecovery();
      if (data.recoveryCodes) {
        recoveryCodes = data.recoveryCodes;
        $('recovery-codes').textContent = recoveryCodes.join('\n');
        $('recovery-result').hidden = false;
      }
      await loadAccount();
      $('account-status').textContent = action === 'sessions/revoke' ? 'Sesi terpilih sudah diakhiri. Muat ulang daftar sesi.' : action === 'mfa/disable' ? '2FA dinonaktifkan. Sesi lain sudah diakhiri.'
        : 'Perubahan 2FA tersimpan. Simpan kode pemulihan sekarang; sesi lain sudah diakhiri.';
    }
  } catch (error) {
    $('account-status').textContent = `Perubahan gagal: ${error.message}`;
  } finally {
    $('current-password').value = '';
    $('account-otp').value = '';
    $('new-password').value = '';
    if (action !== 'mfa/setup') $('mfa-setup-code').value = '';
    controls.forEach(button => { button.disabled = false; });
    accountBusy = false;
  }
});

$('mfa-cancel').addEventListener('click', () => {
  clearEnrollment();
  $('account-status').textContent = 'Pendaftaran dibatalkan. 2FA belum diaktifkan.';
});
$('hide-recovery').addEventListener('click', clearRecovery);
$('download-recovery').addEventListener('click', () => {
  if (!recoveryCodes.length) return;
  const text = 'Snappie Studio: kode pemulihan 2FA\nSetiap kode hanya berlaku sekali. Simpan di tempat aman.\n\n' + recoveryCodes.join('\n') + '\n';
  const url = window.URL.createObjectURL(new window.Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'snappie-kode-pemulihan.txt';
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
});
window.addEventListener('pagehide', () => {
  clearEnrollment(); clearRecovery();
  for (const id of ['current-password', 'new-password', 'account-otp']) $(id).value = '';
});

async function loadAutomation() {
  $('automation-status').textContent = 'Memuat status cadangan dan data lokasi…';
  $('refresh-automation').disabled = true;
  try {
    const { backup, geoip } = await api('/api/admin/maintenance');
    const date = value => value ? `${visitDate.format(new Date(value))}, ${visitTime.format(new Date(value))} WIB` : 'Belum ada keberhasilan tercatat';
    $('backup-last').textContent = date(backup?.lastSuccess);
    $('backup-verified').textContent = date(backup?.restoreVerifiedAt);
    $('backup-copies').textContent = backup ? `${number.format(backup.copies || 0)} dari ${number.format(backup.retention || 14)}` : 'Belum tersedia';
    $('geoip-last').textContent = `${date(geoip?.lastSuccess)}${geoip?.edition ? `, edisi ${geoip.edition}` : ''}`;
    const failed = [backup?.ok === false ? 'Cadangan terakhir gagal.' : '', geoip?.ok === false ? 'Pembaruan lokasi terakhir gagal.' : ''].filter(Boolean).join(' ');
    $('automation-status').textContent = failed ? `${failed} Data keberhasilan sebelumnya tetap ditampilkan. Periksa layanan di server sebelum mencoba ulang.`
      : backup && geoip ? 'Status otomatisasi sudah diperbarui.' : 'Sebagian proses belum mencatat hasil. Muat ulang status setelah proses terjadwal berjalan.';
  } catch (error) { $('automation-status').textContent = `Status gagal dimuat: ${error.message}. Tekan Muat ulang status untuk mencoba lagi.`; }
  finally { $('refresh-automation').disabled = false; }
}
$('maintenance-settings').addEventListener('toggle', () => { if ($('maintenance-settings').open) loadAutomation(); });
$('refresh-automation').addEventListener('click', loadAutomation);

async function start() {
  try {
    try { $('auto-refresh').checked = localStorage.getItem('snappie-cms-auto-refresh') !== '0'; } catch {}
    try {
      const saved = JSON.parse(localStorage.getItem('snappie-cms-report-preferences') || 'null');
      if (saved && typeof saved === 'object') {
        for (const key of ['from', 'to']) if (typeof saved[key] === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(saved[key])) $(key).value = saved[key];
        if (typeof saved.q === 'string') $('search').value = saved.q.slice(0, 100);
        if (typeof saved.province === 'string' && saved.province.length <= 100) $('province-filter').add(new window.Option(saved.province, saved.province, true, true));
        if (['25', '50', '100'].includes(saved.pageSize)) $('page-size').value = saved.pageSize;
        appliedFilters = { from: $('from').value, to: $('to').value, q: $('search').value, province: $('province-filter').value };
      }
    } catch {}
    const session = await api('/api/admin/session');
    csrfToken = session.csrfToken;
    const excluded = await excludeMaintenanceBrowser(csrfToken);
    $('maintenance-status').textContent = excluded
      ? 'Mode maintenance aktif: browser ini tidak dihitung sebagai pengunjung, termasuk kunjungan sebelumnya.'
      : 'Browser belum dikecualikan. Izinkan penyimpanan data situs, lalu muat ulang CMS untuk mengaktifkan mode maintenance.';
    await loadData();
    timer = window.setInterval(autoRefresh, 30000);
  } catch { $('status').textContent = 'Sesi tidak tersedia. Silakan masuk kembali.'; }
}
initCmsTools({ api });
start();
