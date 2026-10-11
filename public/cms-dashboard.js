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
let appliedFilters = { from: '', to: '', q: '' };
let requestController;
let chartData;
let timer;
let lastInteraction = Date.now();

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
  $('cities').textContent = number.format(new Set(known.filter(row => row.city).map(row => `${row.country_code}|${row.city}`)).size);
  $('unknown').textContent = number.format(data.locations.filter(row => !row.country_code).reduce((sum, row) => sum + row.count, 0));
  $('empty').hidden = data.locations.length > 0;
  for (const row of data.locations) {
    const share = total ? (row.count / total) * 100 : 0;
    const tr = document.createElement('tr');
    tr.append(cell(row.country || 'Tidak diketahui'), cell(row.city || '—'), cell(number.format(row.count), 'num'));
    const barCell = document.createElement('td');
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', `${percent.format(share)}%`);
    const fill = document.createElement('i');
    fill.style.width = `${share}%`;
    bar.append(fill);
    barCell.append(bar);
    tr.append(barCell);
    body.append(tr);
  }
}

async function api(path, { raw = false, ...options } = {}) {
  const response = await fetch(path, {
    cache: 'no-store', credentials: 'same-origin', ...options,
    headers: { ...(options.method === 'POST' ? { 'X-CSRF-Token': csrfToken } : {}) },
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
      cell(row.country || 'Tidak diketahui'), cell(row.city || '—'),
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
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const text = dark ? '#c6b6ca' : '#806d7f';
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
    ctx.strokeStyle = dark ? '#4c3e52' : '#f2e6ee';
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - 8, y); ctx.stroke();
    ctx.fillStyle = text;
    ctx.textAlign = 'right';
    ctx.fillText(number.format(tick * (4 - i)), left - 6, y);
  }
  const step = plotWidth / Math.max(1, rows.length);
  rows.forEach((row, index) => {
    const barHeight = plotHeight * row.count / ceiling;
    ctx.fillStyle = '#d63384';
    ctx.fillRect(left + index * step + step * .15, top + plotHeight - barHeight, step * .7, barHeight);
    const labelStep = Math.max(1, Math.ceil(rows.length / 4));
    if (index % labelStep === 0 && (rows.length - 1 - index >= labelStep / 2 || index === rows.length - 1) || index === rows.length - 1) {
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
  $('trend-summary').textContent = `Browser unik per ${unit}, ${data.from} s.d. ${data.to} (WIB).`;
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

async function loadData() {
  requestController?.abort();
  const controller = new window.AbortController();
  requestController = controller;
  $('previous').disabled = true;
  $('next').disabled = true;
  $('status').textContent = 'Memuat…';
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
    $('filter-summary').textContent = `Filter daftar, lokasi, grafik, dan CSV: ${appliedFilters.from || 'awal pencatatan'} s.d. ${appliedFilters.to || 'sekarang'}${appliedFilters.q ? `; lokasi “${appliedFilters.q}”` : ''}. Tanpa tanggal, grafik menampilkan 30 hari terakhir.`;
    renderLocations(stats.locations);
    renderVisits(stats.visitors);
    renderCharts(stats.charts);
    $('status').textContent = `Diperbarui ${visitTime.format(new Date())} WIB.`;
  } catch (error) {
    if (controller.signal.aborted) return;
    $('status').textContent = `Tidak dapat memuat data: ${error.message}`;
    $('previous').disabled = page <= 1;
    $('next').disabled = page >= pages;
  }
}

$('refresh').addEventListener('click', loadData);
$('filters').addEventListener('submit', event => {
  event.preventDefault();
  if ($('from').value && $('to').value && $('from').value > $('to').value) {
    $('status').textContent = 'Tanggal mulai harus sebelum atau sama dengan tanggal akhir.';
    return;
  }
  appliedFilters = { from: $('from').value, to: $('to').value, q: $('search').value.trim() };
  page = 1;
  loadData();
});
$('clear-filters').addEventListener('click', () => {
  $('filters').reset();
  appliedFilters = { from: '', to: '', q: '' };
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
  if (!$('auto-refresh').checked || document.hidden || $('reset').disabled || $('logout').disabled) return;
  if (Date.now() - lastInteraction > 5 * 60 * 1000) return;
  loadData();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) autoRefresh(); });
new window.ResizeObserver(drawCharts).observe($('trend-chart').parentElement);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawCharts);
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
$('reset').addEventListener('click', async () => {
  if (!window.confirm('Reset total pengunjung menjadi 0? Seluruh riwayat kunjungan dan data lokasi juga terhapus. Tindakan ini tidak dapat dibatalkan.')) return;
  $('reset').disabled = true;
  requestController?.abort();
  try {
    await api('/api/admin/reset', { method: 'POST' });
    await loadData();
  } catch {
    $('status').textContent = 'Reset gagal. Coba lagi.';
  } finally { $('reset').disabled = false; }
});

async function start() {
  try {
    try { $('auto-refresh').checked = localStorage.getItem('snappie-cms-auto-refresh') !== '0'; } catch {}
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
start();
