/* Photo Booth — app logic: camera, filters, countdown, capture, result, stickers. */

import { FILTERS, THEMES, CHARS, CHAR_SVG, CHAR_NAMES, EMOJI_STICKERS, dateLine, formatDate, filterCss, fontTracking, fontLineHeight, DATE_COLORS } from './data.js';
import { compose } from './composer.js';
import { cameraCrop } from './camera.js';
import { LANGS, getLang, setLang, t as tr, applyI18n } from './i18n.js';
import bacUrl from './assets/bac.jpg';

/* ============ state ============ */
const LAYOUT_AR = { 1: '4 / 3', 3: '4 / 3', 4: '4 / 3', 6: '4 / 3' };
const LAYOUT_ARN = { 1: 4 / 3, 3: 4 / 3, 4: 4 / 3, 6: 4 / 3 };

const state = {
  stream: null,
  cameraZoom: 1,
  filter: 'normal',
  layout: 3,
  theme: 'pastel',
  photos: [],            // { canvas, filter }
  busy: false,
  stickers: [],
  selectedStickerId: null,
  selectedPhotoIndex: null,
  slotSelected: null,
  showDate: false,
  frame: true,
  customText: '',
  customDate: '',
  captionFont: 'Matcha Iced',
  dateFont: 'Matcha Iced',
  captionColor: '',
  dateColor: '',
  customFrame: {
    bg: '#ffffff', bg2: '#ffe6f2', gradient: true,
    outline: '#d63384', outlineOn: true, slot: '#ffffff', slotBorder: true, pattern: 'none',
  },
  replaceIndex: null,
  facing: 'user',
  mirror: true,
  countdown: 3,
  flash: 'on',
  sound: true
};
let dateWheel = null;
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ============ preferences (localStorage) ============ */
/* Catatan privasi: settingan BINGKAI (tema, warna, font, ukuran/caption frame)
   sengaja TIDAK disimpan. Web ini dipakai banyak orang, jadi tiap kunjungan
   selalu mulai dengan bingkai default/original. Hanya preferensi perangkat
   (filter, jumlah foto, kamera, dsb.) yang diingat. */
const PREFS_KEY = 'snappie-prefs-v1';
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      filter: state.filter, layout: state.layout,
      mirror: state.mirror, facing: state.facing,
      countdown: state.countdown, flash: state.flash, sound: state.sound,
      dark: document.body.classList.contains('dark-mode'),
    }));
  } catch (e) { /* storage tak tersedia — abaikan */ }
}
function loadPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch (e) { p = {}; }
  if (FILTERS.some(f => f.id === p.filter)) state.filter = p.filter;
  if (LAYOUT_AR[p.layout]) state.layout = +p.layout;
  if (typeof p.mirror === 'boolean') state.mirror = p.mirror;
  if (p.facing === 'user' || p.facing === 'environment') state.facing = p.facing;
  if ([0, 3, 5, 10].includes(p.countdown)) state.countdown = p.countdown;
  if (typeof p.flash === 'string' && ['on', 'auto', 'off'].includes(p.flash)) state.flash = p.flash;
  else if (typeof p.flash === 'boolean') state.flash = p.flash ? 'on' : 'off';
  if (typeof p.sound === 'boolean') state.sound = p.sound;
  if (p.dark) document.body.classList.add('dark-mode');
  return p;
}
loadPrefs();
document.body.classList.add('on-start');

let currentScreen = 'scr-start';
let historyWorks = true;
let updateFilterEdges = () => {};

function activateScreen(id) {
  if ((id === 'scr-preview' || id === 'scr-result') && !state.photos.length) id = 'scr-start';
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $(id);
  if (!el) return;
  el.classList.add('active');
  window.scrollTo(0, 0);
  currentScreen = id;
  /* Latar bermotif (fixed + mask besar) hanya di halaman awal — di halaman lain
     bikin komposit/repaint berat di HP lemah, jadi dimatikan. */
  document.body.classList.toggle('on-start', id === 'scr-start');
  if (id === 'scr-start' && state.stream) stopStream();
  if (id === 'scr-cam') {
    renderDots(); renderThumbs();
    requestAnimationFrame(updateFilterEdges);
    if (!state.stream) startCamera().then(ok => { if (ok) applyMirror(); });
  }
  if (id === 'scr-preview') renderPreview();
  else if (id === 'scr-result') renderResult();
}

function show(id, push = true) {
  if (id === currentScreen) return;
  activateScreen(id);
  if (push && historyWorks) {
    try { window.history.pushState({ screen: id }, ''); } catch (e) { historyWorks = false; }
  }
}

function goPreview() {
  if (!state.photos.length) { show('scr-cam'); return; }
  show('scr-preview');
}

window.addEventListener('popstate', (e) => {
  const openModals = document.querySelectorAll('.modal-overlay.open');
  if (openModals.length) {
    openModals.forEach(m => m.classList.remove('open'));
    if (historyWorks) { try { window.history.pushState({ screen: currentScreen }, ''); } catch (err) { /* abaikan */ } }
    return;
  }
  let id = (e.state && e.state.screen) ? e.state.screen : 'scr-start';
  if ((id === 'scr-preview' || id === 'scr-result') && !state.photos.length) {
    id = 'scr-start';
    if (historyWorks) { try { window.history.replaceState({ screen: id }, ''); } catch (err) { /* abaikan */ } }
  }
  activateScreen(id);
});

function openModal(id) {
  const m = $(id);
  if (!m) return;
  m.classList.add('open');
  const close = m.querySelector('.modal-close');
  if (close) setTimeout(() => close.focus(), 60);
}
function closeModal(id) {
  const m = $(id);
  if (m) m.classList.remove('open');
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

/* ============ setup UI ============ */
const filterModal = $('filter-modal');
const filterBtns = [];
function filterName() {
  return tr('filter.' + state.filter);
}
function syncFilterPicker() {
  filterBtns.forEach(b => { if (b) b.textContent = filterName(); });
  document.querySelectorAll('#filter-grid .filter-option').forEach(x => {
    x.classList.toggle('sel', x.dataset.id === state.filter);
  });
  document.querySelectorAll('#filter-strip .filter-chip').forEach(x => {
    x.classList.toggle('sel', x.dataset.id === state.filter);
  });
  const v = $('video');
  if (v) v.style.filter = filterCss(state.filter);
}

/* Strip horizontal: bisa digeser kiri-kanan (drag dengan mouse, swipe dengan layar sentuh). */
function makeDraggableScroll(el) {
  let down = false, startX = 0, startLeft = 0, moved = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;           // sentuh: pakai scroll native
    down = true; moved = 0; startX = e.clientX; startLeft = el.scrollLeft;
  });
  el.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    if (moved > 6) {
      el.classList.add('dragging');
      el.scrollLeft = startLeft - dx;
      e.preventDefault();
    }
  });
  const up = () => { down = false; el.classList.remove('dragging'); };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
  // Cegah filter ikut terpilih saat pengguna selesai menggeser.
  el.addEventListener('click', (e) => {
    if (moved > 6) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  // roda mouse: ubah gulir vertikal jadi horizontal
  el.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
}
function chooseFilter(id) {
  state.filter = id;
  const i = state.selectedPhotoIndex;
  if (i != null && state.photos[i]) {
    state.photos[i].filter = id;
    renderThumbs();
  }
  syncFilterPicker();
  savePrefs();
}
function buildFilterPicker() {
  const grid = $('filter-grid');
  if (grid) {
    grid.innerHTML = '';
    FILTERS.forEach(f => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'filter-option' + (f.id === state.filter ? ' sel' : '');
      b.dataset.id = f.id;
      b.innerHTML = '<span class="filter-sample" style="filter:' + f.css + '"></span>' +
        '<span class="filter-option-name">' + tr('filter.' + f.id) + '</span>';
      b.onclick = () => { chooseFilter(f.id); closeModal('filter-modal'); };
      grid.appendChild(b);
    });
  }
  const strip = $('filter-strip');
  if (strip) {
    strip.innerHTML = '';
    FILTERS.forEach(f => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'filter-chip' + (f.id === state.filter ? ' sel' : '');
      c.dataset.id = f.id;
      c.innerHTML = '<span class="filter-sample" style="filter:' + f.css + '"></span>' +
        '<span class="filter-option-name">' + tr('filter.' + f.id) + '</span>';
      c.onclick = () => chooseFilter(f.id);
      strip.appendChild(c);
    });
    makeDraggableScroll(strip);
    const wrap = $('filter-strip-wrap');
    updateFilterEdges = () => {
      if (!wrap) return;
      const max = strip.scrollWidth - strip.clientWidth;
      wrap.classList.toggle('can-left', strip.scrollLeft > 2);
      wrap.classList.toggle('can-right', max > 2 && strip.scrollLeft < max - 2);
    };
    strip.addEventListener('scroll', updateFilterEdges, { passive: true });
    window.addEventListener('resize', updateFilterEdges);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateFilterEdges);
  }
  const btn = $('filters');
  if (btn) {
    filterBtns.push(btn);
    btn.onclick = () => { syncFilterPicker(); openModal('filter-modal'); };
  }
  if ($('btn-close-filter')) $('btn-close-filter').onclick = () => closeModal('filter-modal');
  if (filterModal) filterModal.onclick = (e) => { if (e.target === filterModal) closeModal('filter-modal'); };
  syncFilterPicker();
}
buildFilterPicker();

const themeModal = $('theme-modal');
const themeBtns = [];
function themeName() {
  return tr('theme.' + state.theme);
}
function themeThumbHTML(t) {
  return '<span class="frame-outer th-' + t.id + ' theme-thumb">' +
    '<span class="frame"><span class="thumb-slots"><i></i><i></i><i></i></span>' +
    '<span class="thumb-stamp"></span></span></span>';
}
function syncThemePickers() {
  themeBtns.forEach(b => { if (b) b.textContent = themeName(); });
  document.querySelectorAll('#theme-grid .theme-option').forEach(x => {
    x.classList.toggle('sel', x.dataset.id === state.theme);
  });
}

/* ---------- custom frame: gaya + warna + motif ---------- */
const CUSTOM_PRESETS = [
  { id: 'plain',    key: 'cf.presetPlain',    gradient: false, pattern: 'none',    bg: '#ffffff', bg2: '#ffffff', outline: '#d63384', slot: '#ffffff' },
  { id: 'gradient', key: 'cf.presetGradient', gradient: true,  pattern: 'none',    bg: '#ffe6f2', bg2: '#e9dcff', outline: '#ffffff', slot: '#ffffff' },
  { id: 'dots',     key: 'cf.presetDots',     gradient: false, pattern: 'dots',    bg: '#fff7e6', bg2: '#fff7e6', outline: '#f5a623', slot: '#ffffff' },
  { id: 'stripes',  key: 'cf.presetStripes',  gradient: true,  pattern: 'stripes', bg: '#e9f7ff', bg2: '#d6ecff', outline: '#0a6bb0', slot: '#ffffff' },
  { id: 'neon',     key: 'cf.presetNeon',     gradient: true,  pattern: 'stripes', bg: '#1a0933', bg2: '#0d0f1a', outline: '#00f0ff', slot: '#ff007f' },
  { id: 'mono',     key: 'cf.presetMono',     gradient: false, pattern: 'none',    bg: '#111111', bg2: '#111111', outline: '#ffffff', slot: '#ffffff' },
];
function lighten(hex, f) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = v => Math.round(v + (255 - v) * f);
  return '#' + [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)]
    .map(v => v.toString(16).padStart(2, '0')).join('');
}
function paintColor(id, color) {
  const el = $(id);
  if (el) { el.dataset.color = color; el.style.background = color; }
}
function presetMatches(f, p) {
  return !!f.gradient === p.gradient && f.pattern === p.pattern &&
    String(f.bg).toLowerCase() === p.bg.toLowerCase() &&
    String(f.outline).toLowerCase() === p.outline.toLowerCase() &&
    String(f.slot).toLowerCase() === p.slot.toLowerCase();
}
function updateCustomFrameUI() {
  const f = state.customFrame;
  paintColor('cf-bg', f.bg);
  paintColor('cf-outline', f.outline);
  paintColor('cf-slot', f.slot);
  const g = $('cf-gradient');
  if (g) g.checked = !!f.gradient;
  const oo = $('cf-outline-on');
  if (oo) oo.checked = f.outlineOn !== false;
  const fot = $('toggle-frame-outline');
  if (fot) fot.checked = f.outlineOn !== false;
  const showSlotBorder = f.slotBorder !== false;
  const so = $('cf-slot-off');
  if (so) so.checked = showSlotBorder;
  const sbt = $('toggle-slot-border');
  if (sbt) sbt.checked = showSlotBorder;
  document.querySelectorAll('#cf-patterns .cf-pat').forEach(b => b.classList.toggle('sel', b.dataset.pat === f.pattern));
  document.querySelectorAll('#cf-styles .cf-style').forEach(b => {
    const p = CUSTOM_PRESETS.find(x => x.id === b.dataset.preset);
    b.classList.toggle('sel', !!p && presetMatches(f, p));
  });
}
function rerenderCustom() {
  updateCustomFrameUI();
  if (currentScreen === 'scr-result') renderResult();
  else if (currentScreen === 'scr-preview') renderPreview();
  savePrefs();
}
function applyCustomPreset(p) {
  const f = state.customFrame;
  f.gradient = p.gradient; f.pattern = p.pattern;
  f.bg = p.bg; f.bg2 = p.bg2; f.outline = p.outline; f.slot = p.slot;
  rerenderCustom();
}
function buildCustomStyles() {
  const wrap = $('cf-styles');
  if (!wrap) return;
  wrap.innerHTML = '';
  CUSTOM_PRESETS.forEach(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cf-style';
    b.dataset.preset = p.id;
    const bg = p.gradient ? 'linear-gradient(180deg,' + p.bg + ',' + p.bg2 + ')' : p.bg;
    const pat = p.pattern !== 'none' ? ' cf-prev-' + p.pattern : '';
    b.innerHTML = '<span class="cf-style-prev' + pat + '" style="--p-bg:' + bg +
      ';--p-outline:' + p.outline + ';--p-slot:' + p.slot + '"></span>' +
      '<span class="cf-style-name">' + tr(p.key) + '</span>';
    b.onclick = () => applyCustomPreset(p);
    wrap.appendChild(b);
  });
}
function buildCustomPanel() {
  if (!$('customframe-modal')) return;
  buildCustomStyles();
  const pats = $('cf-patterns');
  if (pats) {
    pats.innerHTML = '';
    [['none', 'cf.patNone'], ['dots', 'cf.patDots'], ['stripes', 'cf.patStripes']].forEach(([id, key]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cf-pat';
      b.dataset.pat = id;
      b.textContent = tr(key);
      b.onclick = () => { state.customFrame.pattern = id; rerenderCustom(); };
      pats.appendChild(b);
    });
  }
  ['cf-bg', 'cf-outline', 'cf-slot'].forEach(id => {
    const el = $(id);
    if (el) el.onclick = () => openColorPicker(id);
  });
  const grad = $('cf-gradient');
  if (grad) grad.onchange = () => { state.customFrame.gradient = grad.checked; rerenderCustom(); };
  const outlineOn = $('cf-outline-on');
  if (outlineOn) outlineOn.onchange = () => { state.customFrame.outlineOn = outlineOn.checked; rerenderCustom(); };
  const slotOff = $('cf-slot-off');
  if (slotOff) slotOff.onchange = () => { state.customFrame.slotBorder = slotOff.checked; rerenderCustom(); };
  const stk = $('cf-add-sticker');
  if (stk) stk.onclick = () => { closeModal('customframe-modal'); openModal('sticker-modal'); };
  const done = $('cf-done');
  if (done) done.onclick = () => closeModal('customframe-modal');
  if ($('btn-close-customframe')) $('btn-close-customframe').onclick = () => closeModal('customframe-modal');
  const cfModal = $('customframe-modal');
  if (cfModal) cfModal.onclick = (e) => { if (e.target === cfModal) closeModal('customframe-modal'); };
  updateCustomFrameUI();
}
function buildThemePicker() {
  const grid = $('theme-grid');
  if (!grid) return;
  grid.innerHTML = '';
  THEMES.forEach(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme-option' + (t.id === state.theme ? ' sel' : '');
    b.dataset.id = t.id;
    b.innerHTML = themeThumbHTML(t) + '<span class="theme-option-name">' + tr('theme.' + t.id) + '</span>';
    b.onclick = () => {
      state.theme = t.id;
      syncThemePickers();
      closeModal('theme-modal');
      updateCustomFrameUI();
      if (t.id === 'custom') openModal('customframe-modal');
      if (currentScreen === 'scr-result') renderResult();
      else if (currentScreen === 'scr-preview') renderPreview();
      savePrefs();
    };
    grid.appendChild(b);
  });
  buildCustomPanel();
  ['themepick', 'themepick2'].forEach(id => {
    const btn = $(id);
    if (!btn) return;
    themeBtns.push(btn);
    btn.onclick = () => { syncThemePickers(); openModal('theme-modal'); };
  });
  if ($('btn-close-theme')) $('btn-close-theme').onclick = () => closeModal('theme-modal');
  themeModal.onclick = (e) => { if (e.target === themeModal) closeModal('theme-modal'); };
  syncThemePickers();
}
buildThemePicker();

function refreshPickers() {
  document.querySelectorAll('#filter-grid .filter-option, #filter-strip .filter-chip').forEach(x => {
    const n = x.querySelector('.filter-option-name');
    if (n) n.textContent = tr('filter.' + x.dataset.id);
  });
  document.querySelectorAll('#theme-grid .theme-option').forEach(x => {
    const n = x.querySelector('.theme-option-name');
    if (n) n.textContent = tr('theme.' + x.dataset.id);
  });
  syncFilterPicker();
  syncThemePickers();
  if (typeof buildCustomPanel === 'function') buildCustomPanel();
  if (typeof buildCountdownPicker === 'function') buildCountdownPicker();
}

function applyLang(code) {
  setLang(code);
  applyI18n();
  refreshPickers();
  const grid = $('lang-grid');
  if (grid) grid.querySelectorAll('.lang-option').forEach(x => x.classList.toggle('sel', x.dataset.code === code));
  if (currentScreen === 'scr-preview') renderPreview();
  else if (currentScreen === 'scr-result') renderResult();
}

function buildLangPicker() {
  const grid = $('lang-grid');
  if (!grid) return;
  grid.innerHTML = '';
  LANGS.forEach(l => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lang-option' + (l.code === getLang() ? ' sel' : '');
    b.dataset.code = l.code;
    b.title = l.label;
    b.setAttribute('aria-label', l.label);
    b.innerHTML = '<span class="lang-flag">' + l.flag + '</span><span class="lang-abbr">' + l.abbr + '</span>';
    b.onclick = () => { applyLang(l.code); closeModal('lang-modal'); };
    grid.appendChild(b);
  });
}
buildLangPicker();

if ($('btn-lang')) $('btn-lang').onclick = () => openModal('lang-modal');
if ($('btn-close-lang')) $('btn-close-lang').onclick = () => closeModal('lang-modal');
const langModal = $('lang-modal');
if (langModal) langModal.onclick = (e) => { if (e.target === langModal) closeModal('lang-modal'); };

applyI18n();

function applyLayoutAspect() {
  const wrap = $('camwrap');
  if (wrap) wrap.style.aspectRatio = LAYOUT_AR[state.layout] || '4 / 3';
}
applyLayoutAspect();

document.querySelectorAll('#layoutseg button').forEach(b => {
  b.classList.toggle('sel', +b.dataset.layout === state.layout);
  b.onclick = () => {
    document.querySelectorAll('#layoutseg button').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    state.layout = +b.dataset.layout;
    applyLayoutAspect();
    resetPhotos();
    savePrefs();
  };
});

function resetPhotos() {
  state.photos = [];
  state.stickers = [];
  state.selectedStickerId = null;
  state.selectedPhotoIndex = null;
  state.slotSelected = null;
  state.replaceIndex = null;
  renderDots(); renderThumbs();
}

/* Sesi baru = bingkai balik ke default/original (bukan bingkai user sebelumnya). */
function resetFrameSettings() {
  state.theme = 'pastel';
  state.customFrame = {
    bg: '#ffffff', bg2: '#ffe6f2', gradient: true,
    outline: '#d63384', outlineOn: true, slot: '#ffffff', slotBorder: true, pattern: 'none',
  };
  state.captionFont = 'Matcha Iced';
  state.dateFont = 'Matcha Iced';
  state.captionColor = '';
  state.dateColor = '';
  state.showDate = false;
  state.frame = true;
  state.customText = '';
  state.customDate = '';
  if ($('caption-font')) $('caption-font').value = state.captionFont;
  if ($('date-font')) $('date-font').value = state.dateFont;
  if ($('custom-text')) $('custom-text').value = '';
  if (dateWheel) dateWheel.set('');
  if ($('toggle-date')) $('toggle-date').checked = false;
  if ($('toggle-frame')) $('toggle-frame').checked = true;
  if (typeof syncTextColorsUI === 'function') syncTextColorsUI();
  if (typeof updateCustomFrameUI === 'function') updateCustomFrameUI();
  if (typeof syncThemePickers === 'function') syncThemePickers();
}

/* ============ camera ============ */
/* Hentikan semua track kamera dan lepaskan referensinya. */
function stopStream() {
  if (state.stream) state.stream.getTracks().forEach(t => t.stop());
  state.stream = null;
}

function applyMirror() {
  const v = $('video');
  if (v) v.style.transform = `scale(${state.mirror ? -state.cameraZoom : state.cameraZoom}, ${state.cameraZoom})`;
}

function setCameraZoom(value) {
  state.cameraZoom = Math.round(Math.max(1, Math.min(3, Number(value) || 1)) * 10) / 10;
  const slider = $('camera-zoom');
  if (slider) slider.value = String(state.cameraZoom);
  const reset = $('camera-zoom-reset');
  if (reset) reset.textContent = state.cameraZoom.toFixed(1) + '×';
  $('camera-zoom-out').disabled = state.cameraZoom <= 1;
  $('camera-zoom-in').disabled = state.cameraZoom >= 3;
  applyMirror();
}

$('camera-zoom').addEventListener('input', e => setCameraZoom(e.target.value));
$('camera-zoom-out').onclick = () => setCameraZoom(state.cameraZoom - 0.1);
$('camera-zoom-in').onclick = () => setCameraZoom(state.cameraZoom + 0.1);
$('camera-zoom-reset').onclick = () => setCameraZoom(1);
setCameraZoom(1);

function doFlash() {
  const f = $('flash');
  if (!f) return;
  f.style.transition = 'none'; f.style.opacity = '.85';
  requestAnimationFrame(() => { f.style.transition = 'opacity .4s'; f.style.opacity = '0'; });
}
let ambientCanvas = null;   // dipakai ulang tiap cek (tidak alokasi canvas baru)
function ambientIsDark() {
  const v = $('video');
  if (!v || !v.videoWidth) return false;
  if (!ambientCanvas) { ambientCanvas = document.createElement('canvas'); ambientCanvas.width = 32; ambientCanvas.height = 24; }
  const x = ambientCanvas.getContext('2d', { willReadFrequently: true });
  try { x.drawImage(v, 0, 0, 32, 24); } catch (e) { return false; }
  const d = x.getImageData(0, 0, 32, 24).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return (sum / (d.length / 4)) < 90;
}
function shouldScreenFlash() {
  if (state.flash === 'on') return true;
  if (state.flash === 'auto') return ambientIsDark();
  return false;
}

/* ---- Lampu (torch) kamera belakang ---- */
function videoTrack() {
  return (state.stream && state.stream.getVideoTracks) ? state.stream.getVideoTracks()[0] : null;
}
function trackSupportsTorch() {
  const track = videoTrack();
  if (!track || typeof track.getCapabilities !== 'function') return false;
  try { return !!track.getCapabilities().torch; } catch (e) { return false; }
}
async function setTorch(on) {
  const track = videoTrack();
  if (!track || typeof track.applyConstraints !== 'function') return false;
  try { await track.applyConstraints({ advanced: [{ torch: !!on }] }); return true; }
  catch (e) { return false; }
}
/* Pakai lampu hanya untuk kamera belakang + mode flash yang minta cahaya. */
function shouldUseTorch() {
  if (state.facing !== 'environment') return false;
  if (state.flash === 'off') return false;
  if (state.flash === 'auto' && !ambientIsDark()) return false;
  return trackSupportsTorch();
}

async function startCamera() {
  stopStream();
  const camerr = $('camerr');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facing, width: { ideal: 1280 } }, audio: false,
    });
    state.stream = stream;
    setCameraZoom(1);
    /* Kamera dicabut sistem (mis. perangkat dilepas): anggap stream sudah mati
       supaya layar kamera meminta ulang, bukan memotret frame kosong. */
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      if (state.stream === stream) stopStream();
    }));
    $('video').srcObject = stream;
    camerr.style.display = 'none';
    return true;
  } catch (e) {
    state.stream = null;   // jangan simpan stream yang sudah mati
    const name = e && e.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      camerr.textContent = tr('err.denied');
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      camerr.textContent = tr('err.notfound');
    } else if (name === 'NotReadableError' || name === 'AbortError') {
      camerr.textContent = tr('err.inuse');
    } else {
      camerr.textContent = tr('err.generic');
    }
    camerr.style.display = 'block';
    return false;
  }
}

$('btn-start').onclick = async () => {
  if (await startCamera()) {
    startNewSession();             // sesi baru: foto, bingkai, dan riwayat undo di-reset
    applyMirror();
    show('scr-cam');
  }
};

const switchCamBtn = $('btn-switch-cam');
if (switchCamBtn) {
  switchCamBtn.onclick = async () => {
    await setTorch(false);   // matikan lampu sebelum ganti kamera
    state.facing = state.facing === 'user' ? 'environment' : 'user';
    switchCamBtn.disabled = true;
    await startCamera();
    switchCamBtn.disabled = false;
    savePrefs();
  };
}

const mirrorToggle = $('toggle-mirror');
function syncMirrorBtn() {
  if (!mirrorToggle) return;
  mirrorToggle.setAttribute('aria-pressed', String(state.mirror));
  mirrorToggle.classList.toggle('active', state.mirror);
}
if (mirrorToggle) {
  mirrorToggle.onclick = () => { state.mirror = !state.mirror; applyMirror(); syncMirrorBtn(); savePrefs(); };
  syncMirrorBtn();
  applyMirror();
}

function renderDots() {
  const sc = $('shot-count');
  if (sc) sc.textContent = state.photos.length + ' / ' + state.layout;
}

/* Layar kamera tidak menampilkan thumbnail foto — cukup indikator jumlah. */
function renderThumbs() {
  const pv = $('btn-to-preview');
  if (pv) pv.style.display = state.photos.length ? '' : 'none';
  renderDots();
  commitHistory();
}

renderDots();

/* Satu AudioContext dipakai ulang: membuat context baru tiap bunyi menumpuk
   context hidup dan browser bisa berhenti memutar bunyi. */
let audioCtx = null;
function beep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const ctx = audioCtx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = .12;
    o.start(); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .18);
    o.stop(ctx.currentTime + .2);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  } catch (e) { /* audio not available — skip */ }
}

$('shutter').onclick = async () => {
  if (state.busy || !state.stream) return;
  if (state.photos.length >= state.layout && state.replaceIndex == null) return;
  const replacing = state.replaceIndex != null;
  state.busy = true; $('shutter').disabled = true;
  const cd = $('countdown');
  const cameraGone = () => !state.stream || currentScreen !== 'scr-cam';
  if (state.countdown > 0) {
    cd.style.display = 'flex';
    for (let n = state.countdown; n >= 1 && !cameraGone(); n--) {
      cd.textContent = String(n);
      if (state.sound) beep();
      await sleep(1000);
    }
    cd.style.display = 'none';
  }
  /* Kamera hilang / pindah layar saat hitung mundur: batalkan jepretan. */
  if (cameraGone()) { state.busy = false; $('shutter').disabled = false; return; }
  const useTorch = shouldUseTorch();
  if (useTorch) {
    await setTorch(true);
    await sleep(700);   // beri waktu sensor menyesuaikan exposure agar hasil cerah
  }
  const captured = capture();
  if (useTorch) { setTimeout(() => setTorch(false), 500); }   // matikan setelah jepret
  if (!captured) { state.busy = false; $('shutter').disabled = false; return; }
  if (!useTorch && shouldScreenFlash()) doFlash();
  if (state.sound) beep();
  state.busy = false; $('shutter').disabled = false;
  if (replacing || state.photos.length >= state.layout) { await sleep(400); goPreview(); }
};

function capture() {
  const v = $('video');
  if (!state.stream || !v.videoWidth) return false;   // tidak ada frame nyata untuk dipotret
  const ar = LAYOUT_ARN[state.layout] || (4 / 3);
  const { width: cw, height: ch, sx, sy, sw, sh } = cameraCrop(v.videoWidth, v.videoHeight, ar, state.cameraZoom);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const x = c.getContext('2d');
  if (state.mirror) { x.translate(cw, 0); x.scale(-1, 1); }   // mirror like preview
  x.drawImage(v, sx, sy, sw, sh, 0, 0, cw, ch);
  const photo = { id: Date.now() + Math.random(), canvas: c, filter: state.filter, zoom: 1, ox: 0, oy: 0 };   // filter + crop per foto
  warmPhotoUrl(c);
  if (state.replaceIndex != null && state.replaceIndex < state.photos.length) {
    state.photos[state.replaceIndex] = photo;                // re-jepret slot ini
    state.replaceIndex = null;
  } else {
    state.photos.push(photo);
  }
  renderDots(); renderThumbs();
  return true;
}

/* ============ gallery import ============ */
/* Sebagian Android mengembalikan file galeri dengan MIME type kosong —
   jangan sampai ikut tersaring keluar. */
function isImageFile(f) {
  return !f.type || f.type.startsWith('image/');
}
/* HEIC/HEIF: Chrome Android tak bisa decode sendiri → konversi ke JPEG dulu. */
function isHeic(f) {
  const t = (f.type || '').toLowerCase();
  if (t === 'image/heic' || t === 'image/heif') return true;
  return /\.(heic|heif)$/i.test(f.name || '');
}
async function heicToJpeg(file) {
  const mod = await import('heic2any');
  const heic2any = mod.default || mod;
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  const blob = Array.isArray(out) ? out[0] : out;
  const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}
async function fileToCanvas(file) {
  let f = file;
  if (isHeic(file)) {
    try { f = await heicToJpeg(file); } catch (e) { f = file; }
  }
  let src = null, objectUrl = null;
  try {
    if (window.createImageBitmap) {
      try { src = await createImageBitmap(f, { imageOrientation: 'from-image' }); } catch (e) { src = null; }
    }
    if (!src) {
      objectUrl = URL.createObjectURL(f);
      src = await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = objectUrl;
      });
    }
    let w = src.width, h = src.height;
    const scale = Math.min(1, 1600 / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(src, 0, 0, w, h);
    if (src.close) src.close();
    return c;
  } finally {
    /* object URL dibuang di semua jalur (sukses maupun gagal) */
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

async function handleFiles(files) {
  const list = Array.from(files || []).filter(isImageFile);
  let added = 0;
  const make = async (f) => {
    const canvas = await fileToCanvas(f);
    warmPhotoUrl(canvas);
    return { id: Date.now() + Math.random(), canvas, filter: state.filter, zoom: 1, ox: 0, oy: 0 };
  };
  for (const f of list) {
    if (state.replaceIndex != null && state.replaceIndex < state.photos.length) {
      try { state.photos[state.replaceIndex] = await make(f); state.replaceIndex = null; added++; }
      catch (e) { /* lewati file yang gagal dimuat */ }
      continue;
    }
    if (state.photos.length >= state.layout) break;
    try { state.photos.push(await make(f)); added++; }
    catch (e) { /* lewati file yang gagal dimuat */ }
  }
  if (added) { renderDots(); renderThumbs(); }
  return added;
}

const fileInput = $('file-input');
let galleryIntent = 'cam';
const openGallery = (intent) => {
  galleryIntent = intent || 'cam';
  if (fileInput) fileInput.click();
};
if ($('btn-gallery')) $('btn-gallery').onclick = () => openGallery('cam');
if ($('btn-gallery-start')) $('btn-gallery-start').onclick = () => openGallery('start');
if ($('btn-to-preview')) $('btn-to-preview').onclick = () => goPreview();
if ($('btn-preview-fix')) $('btn-preview-fix').onclick = () => show('scr-result');
function layoutForCount(n) {
  if (n <= 1) return 1;
  if (n <= 3) return 3;
  if (n <= 4) return 4;
  return 6;
}
function setLayout(n) {
  state.layout = n;
  document.querySelectorAll('#layoutseg button').forEach(x => x.classList.toggle('sel', +x.dataset.layout === n));
  applyLayoutAspect();
}
if (fileInput) {
  fileInput.onchange = async () => {
    if (galleryIntent === 'start') {
      const files = Array.from(fileInput.files || []).filter(isImageFile);
      if (files.length) {
        setLayout(layoutForCount(files.length));
        startNewSession();
        savePrefs();
      }
    }
    const picked = Array.from(fileInput.files || []);
    const added = await handleFiles(fileInput.files);
    fileInput.value = '';
    if (!added) {
      if (picked.length) alert(tr('alert.badPhoto'));
      return;
    }
    if (galleryIntent === 'preview') {
      if (currentScreen === 'scr-preview') renderPreview();
      else show('scr-preview');
    } else if (galleryIntent === 'start') {
      await sleep(150); show('scr-preview');
    } else if (state.photos.length >= state.layout) {
      await sleep(150); show('scr-preview');
    }
  };
}

/* ============ result preview (HTML) ============ */
function imgTransform(p) {
  const z = p.zoom || 1, ox = p.ox || 0, oy = p.oy || 0;
  if (z === 1 && !ox && !oy) return 'none';
  return 'translate(' + (ox * 100).toFixed(2) + '%, ' + (oy * 100).toFixed(2) + '%) scale(' + z.toFixed(3) + ')';
}

/* URL gambar per foto. JPEG di-encode lewat canvas.toBlob (async, tidak memblokir
   thread utama) lalu dijadikan object URL — jauh lebih ringan daripada dataURL
   base64 yang disimpan di state & riwayat undo. Disimpan per canvas, jadi render
   ulang (toggle, dsb.) tetap sinkron tanpa encode ulang. Filter & zoom diterapkan
   lewat CSS, jadi URL-nya tetap valid. */
const photoUrlReady = new Map();     // canvas -> object URL siap pakai
const photoUrlPending = new Map();   // canvas -> Promise<string>
function photoUrl(canvas) {
  if (photoUrlReady.has(canvas)) return Promise.resolve(photoUrlReady.get(canvas));
  if (!photoUrlPending.has(canvas)) {
    const p = new Promise(res => canvas.toBlob(b => res(b ? URL.createObjectURL(b) : ''), 'image/jpeg', .85))
      .then(u => {
        /* Kalau canvas sudah dibuang (prunePhotoUrls) saat encode, jangan simpan. */
        if (photoUrlPending.get(canvas) === p) { photoUrlPending.delete(canvas); photoUrlReady.set(canvas, u); }
        else if (u) URL.revokeObjectURL(u);
        return u;
      });
    photoUrlPending.set(canvas, p);
  }
  return photoUrlPending.get(canvas);
}
function warmPhotoUrl(canvas) { photoUrl(canvas).catch(() => {}); }
/* Buang URL untuk canvas yang sudah tidak dipakai foto aktif maupun riwayat undo. */
function prunePhotoUrls() {
  const live = new Set();
  const addPhotos = list => list.forEach(p => live.add(p.canvas));
  addPhotos(state.photos);
  history.forEach(s => addPhotos(s.photos));
  redoStack.forEach(s => addPhotos(s.photos));
  for (const [c, u] of photoUrlReady) {
    if (!live.has(c)) { URL.revokeObjectURL(u); photoUrlReady.delete(c); }
  }
  for (const c of [...photoUrlPending.keys()]) {
    if (!live.has(c)) photoUrlPending.delete(c);
  }
}
function slotMedia(p, i, gesture) {
  const style = 'filter:' + filterCss(p.filter) + ';transform:' + imgTransform(p);
  const src = photoUrlReady.get(p.canvas);
  return '<img' + (gesture ? ' class="slot-img"' : '') + ' data-photo="' + i + '" draggable="false" alt="Foto ' + (i + 1) +
    '" style="' + style + '"' + (src ? ' src="' + src + '"' : '') + '>';
}
/* Isi src gambar yang belum siap setelah render (encode async), tanpa re-render. */
function hydrateSlotImages(root) {
  root.querySelectorAll('img[data-photo]:not([src])').forEach(img => {
    const p = state.photos[+img.dataset.photo];
    if (!p) return;
    photoUrl(p.canvas).then(u => { if (u && img.isConnected) img.src = u; });
  });
}

/* Ukur lebar teks untuk auto-fit caption (nilai dipakai preview & PNG). */
const _measureCanvas = document.createElement('canvas');
const _measureCtx = _measureCanvas.getContext('2d');
function measureTextWidth(text, family, size) {
  _measureCtx.font = '700 ' + size + 'px "' + family + '", "Trebuchet MS", sans-serif';
  return _measureCtx.measureText(String(text)).width;
}
/* Ukuran + letter-spacing satu baris teks agar muat di bingkai (per font). */
function lineLayout(text, font, innerW) {
  const base = 12;
  const lineHeight = fontLineHeight(font);
  let size = base;
  let spacing = fontTracking(font) * base;
  if (text) {
    const w = measureTextWidth(text, font, base);
    const maxW = innerW - 16;
    if (w > maxW && w > 0) {
      const k = maxW / w;
      size = Math.max(7, base * k);
      spacing = fontTracking(font) * size;
    }
  }
  return { font, size, spacing, lineHeight, height: size * lineHeight };
}
/* Teks tanggal: pakai tanggal kustom kalau diisi, kalau tidak otomatis hari ini. */
function currentDateText() { return state.customDate ? formatDate(state.customDate, getLang()) : dateLine(getLang()); }

/* Layout caption dan tanggal terpisah (font bisa berbeda). */
function captionLayout() {
  const innerW = (state.layout === 1 || state.layout === 3) ? 240 : 380;   // lebar dalam bingkai (px CSS)
  const cap = lineLayout(state.customText || '', state.captionFont || 'Matcha Iced', innerW);
  const date = lineLayout(state.showDate ? currentDateText() : '', state.dateFont || 'Matcha Iced', innerW);
  return { cap, date };
}
function lineStyleString(L, color) {
  return "font-family:'" + L.font + "', 'Trebuchet MS', sans-serif;font-size:" +
    L.size.toFixed(2) + 'px;letter-spacing:' + L.spacing.toFixed(2) + 'px;line-height:' +
    L.lineHeight + (color ? ';color:' + color : '');
}
function captionAreaMinHeight(L) {
  let h = 12;
  if (state.customText) h += L.cap.height;
  if (state.showDate) h += L.date.height;
  return Math.max(48, h);
}

/* Atribut bingkai custom: variabel warna + kelas motif. */
function customFrameAttr() {
  if (!state.frame || state.theme !== 'custom') return { cls: '', style: '' };
  const f = state.customFrame;
  const bg = f.gradient ? 'linear-gradient(180deg,' + f.bg + ',' + f.bg2 + ')' : f.bg;
  const pat = (f.pattern && f.pattern !== 'none') ? ' cf-pat-' + f.pattern : '';
  return {
    cls: pat,
    style: ' style="--cf-bg:' + bg + ';--cf-outline:' + f.outline + ';--cf-slot:' + f.slot + '"',
  };
}

function frameHTML() {
  const lay = state.layout === 1 ? 'single' : state.layout === 3 ? 'strip' : 'grid' + state.layout;
  const cls = state.layout === 1 ? 'photos-single' : state.layout === 3 ? 'photos-strip' : 'photos-grid';
  let slots = '';
  state.photos.forEach((p, i) => {
    slots += '<div class="slot">' + slotMedia(p, i, false) + '</div>';
  });
  const L = captionLayout();
  const fsCap = lineStyleString(L.cap, state.captionColor);
  const fsDate = lineStyleString(L.date, state.dateColor);
  const customHTML = state.customText ? '<div class="frame-date" style="' + fsCap + '">' + esc(state.customText) + '</div>' : '';
  const dateHTML = state.showDate ? '<div class="frame-date" style="' + fsDate + '">' + esc(currentDateText()) + '</div>' : '';
  const captionsHTML = '<div class="frame-captions" style="min-height:' + captionAreaMinHeight(L).toFixed(1) + 'px">' + customHTML + dateHTML + '</div>';
  const th = state.frame ? 'th-' + state.theme : 'noframe';
  const cf = customFrameAttr();
  const noSlot = (state.frame && state.customFrame.slotBorder === false) ? ' no-slot-border' : '';
  const noOutline = (state.frame && state.customFrame.outlineOn === false) ? ' no-frame-outline' : '';
  return '<div class="frame-outer ' + th + cf.cls + noSlot + noOutline + ' ' + lay + '"' + cf.style + '>' +
    '<div class="frame"><div class="' + cls + '">' + slots + '</div>' +
    (state.frame ? captionsHTML : '') + '</div>' +
    '<div class="sticker-layer"></div></div>';
}

/* Update bingkai DI TEMPAT tanpa membangun ulang elemen foto — dipakai untuk
   perubahan yang hanya menyentuh bingkai/caption (toggle, tema, font, warna,
   tanggal). Menghindari re-render berat saat toggle. */
function refreshActiveFrame() {
  const holderId = currentScreen === 'scr-preview' ? 'preview-holder'
    : currentScreen === 'scr-result' ? 'result-holder' : null;
  if (!holderId) return;
  const holder = $(holderId);
  const outer = holder && holder.querySelector('.frame-outer');
  if (!outer) { if (currentScreen === 'scr-preview') renderPreview(); else renderResult(); return; }

  const lay = state.layout === 1 ? 'single' : state.layout === 3 ? 'strip' : 'grid' + state.layout;
  const th = state.frame ? 'th-' + state.theme : 'noframe';
  const cf = customFrameAttr();
  const noSlot = (state.frame && state.customFrame.slotBorder === false) ? ' no-slot-border' : '';
  const noOutline = (state.frame && state.customFrame.outlineOn === false) ? ' no-frame-outline' : '';
  outer.className = 'frame-outer ' + th + cf.cls + noSlot + noOutline + ' ' + lay;

  ['--cf-bg', '--cf-outline', '--cf-slot'].forEach(pn => outer.style.removeProperty(pn));
  if (state.frame && state.theme === 'custom') {
    const f = state.customFrame;
    const bg = f.gradient ? 'linear-gradient(180deg,' + f.bg + ',' + f.bg2 + ')' : f.bg;
    outer.style.setProperty('--cf-bg', bg);
    outer.style.setProperty('--cf-outline', f.outline);
    outer.style.setProperty('--cf-slot', f.slot);
  }

  const frameEl = outer.querySelector('.frame');
  let caps = outer.querySelector('.frame-captions');
  if (state.frame) {
    const L = captionLayout();
    const fsCap = lineStyleString(L.cap, state.captionColor);
    const fsDate = lineStyleString(L.date, state.dateColor);
    const customHTML = state.customText ? '<div class="frame-date" style="' + fsCap + '">' + esc(state.customText) + '</div>' : '';
    const dateHTML = state.showDate ? '<div class="frame-date" style="' + fsDate + '">' + esc(currentDateText()) + '</div>' : '';
    if (!caps && frameEl) { caps = document.createElement('div'); caps.className = 'frame-captions'; frameEl.appendChild(caps); }
    if (caps) { caps.style.minHeight = captionAreaMinHeight(L).toFixed(1) + 'px'; caps.innerHTML = customHTML + dateHTML; }
  } else if (caps) {
    caps.remove();
  }

  updateDateButton();
  invalidateShareFile();
  /* Tunda fit + snapshot ke frame berikutnya: perubahan visual toggle langsung
     tergambar dulu, kerja layout/history tidak menahan paint. */
  requestAnimationFrame(() => { fitFrame(holderId); commitHistory(); });
}

/* Besarkan bingkai sebesar mungkin agar pas di area yang tersedia (boleh diperbesar). */
function fitFrame(holderId) {
  const holder = $(holderId);
  if (!holder) return;
  const frame = holder.querySelector('.frame-outer');
  if (!frame) return;
  /* Tinggi area frame dipatok lewat CSS (min-height) → tinggi halaman STABIL,
     jadi tidak ada geseran/kedut saat toggle. Frame cukup di-scale agar muat. */
  holder.style.minHeight = '';
  holder.style.height = '';
  const fw = frame.offsetWidth, fh = frame.offsetHeight;   // offset* tak terpengaruh transform
  const aw = holder.clientWidth, ah = holder.clientHeight;
  if (!fw || !fh || aw < 20 || ah < 20) return;
  const s = Math.max(0.05, Math.min((aw - 8) / fw, (ah - 8) / fh));
  const prev = parseFloat(holder.dataset.fitScale || '0');
  if (Math.abs(s - prev) > 0.01) {   // hysteresis: jangan re-raster tiap render
    holder.dataset.fitScale = String(s);
    frame.style.transform = 'scale(' + s.toFixed(4) + ')';
  }
}

function renderResult() {
  const holder = $('result-holder');
  holder.innerHTML = frameHTML();
  hydrateSlotImages(holder);
  syncThemePickers();
  syncTextColorsUI();
  renderUserStickers();
  updateDateButton();
  fitFrame('result-holder');
  invalidateShareFile();          // invalidasi cache share (murah, tanpa compose)
  commitHistory();
}


function previewHTML() {
  const lay = state.layout === 1 ? 'single' : state.layout === 3 ? 'strip' : 'grid' + state.layout;
  const cls = state.layout === 1 ? 'photos-single' : state.layout === 3 ? 'photos-strip' : 'photos-grid';
  let slots = '';
  state.photos.forEach((p, i) => {
    slots += '<div class="slot preview-slot" data-i="' + i + '">' +
      slotMedia(p, i, true) +
      '<div class="slot-actions">' +
        '<button type="button" class="slot-btn" data-act="retake" data-i="' + i + '" aria-label="' + esc(tr('slot.retake')) + '" title="' + esc(tr('slot.retake')) + '"><span class="ms">refresh</span></button>' +
        '<button type="button" class="slot-btn" data-act="del" data-i="' + i + '" aria-label="' + esc(tr('slot.remove')) + '" title="' + esc(tr('slot.removeShort')) + '"><span class="ms">delete</span></button>' +
      '</div></div>';
  });
  const L = captionLayout();
  const fsCap = lineStyleString(L.cap, state.captionColor);
  const fsDate = lineStyleString(L.date, state.dateColor);
  const customHTML = state.customText ? '<div class="frame-date" style="' + fsCap + '">' + esc(state.customText) + '</div>' : '';
  const dateHTML = state.showDate ? '<div class="frame-date" style="' + fsDate + '">' + esc(currentDateText()) + '</div>' : '';
  const captionsHTML = '<div class="frame-captions" style="min-height:' + captionAreaMinHeight(L).toFixed(1) + 'px">' + customHTML + dateHTML + '</div>';
  const th = state.frame ? 'th-' + state.theme : 'noframe';
  const cf = customFrameAttr();
  const noSlot = (state.frame && state.customFrame.slotBorder === false) ? ' no-slot-border' : '';
  const noOutline = (state.frame && state.customFrame.outlineOn === false) ? ' no-frame-outline' : '';
  return '<div class="frame-outer ' + th + cf.cls + noSlot + noOutline + ' ' + lay + '"' + cf.style + '>' +
    '<div class="frame"><div class="' + cls + '">' + slots + '</div>' +
    (state.frame ? captionsHTML : '') + '</div>' +
    '<div class="sticker-layer"></div></div>';
}

/* Zoom/geser isi foto per slot (di layar Preview). */
function applySlotSelection() {
  document.querySelectorAll('#preview-holder .preview-slot').forEach(el => {
    el.classList.toggle('sel', state.slotSelected != null && +el.dataset.i === state.slotSelected);
  });
}

function attachSlotGestures(img, p, index) {
  const pts = new Map();
  let start = null, pinch = null, rect = null;
  const clampPan = () => {
    const lim = Math.max(0, ((p.zoom || 1) - 1) / 2);
    p.ox = Math.max(-lim, Math.min(lim, p.ox || 0));
    p.oy = Math.max(-lim, Math.min(lim, p.oy || 0));
  };
  const apply = () => { img.style.transform = imgTransform(p); };

  img.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.slot-btn')) return;
    if (state.slotSelected !== index) { state.slotSelected = index; applySlotSelection(); }
    try { img.setPointerCapture(e.pointerId); } catch (err) { /* abaikan */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      start = { x: e.clientX, y: e.clientY, ox: p.ox || 0, oy: p.oy || 0 };
      img.classList.add('slot-dragging');
    } else if (pts.size === 2) {
      start = null;
      const [a, b] = [...pts.values()];
      pinch = { dist: Math.hypot(b.x - a.x, b.y - a.y) || 1, zoom: p.zoom || 1 };
    }
    e.preventDefault();
  });

  img.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    /* ukuran elemen diukur sekali per gesture (bukan tiap event gerak → hindari layout paksa) */
    const r = rect || (rect = img.getBoundingClientRect());
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      p.zoom = Math.max(1, Math.min(6, pinch.zoom * (d / pinch.dist)));
      if (p.zoom <= 1.02) { p.zoom = 1; p.ox = 0; p.oy = 0; }   // zoom-out pas ke kolom frame
      clampPan(); apply();
      e.preventDefault();
    } else if (pts.size === 1 && start) {
      p.ox = start.ox + (e.clientX - start.x) / r.width;
      p.oy = start.oy + (e.clientY - start.y) / r.height;
      clampPan(); apply();
    }
  });

  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 1) {
      const q = [...pts.values()][0];
      start = { x: q.x, y: q.y, ox: p.ox || 0, oy: p.oy || 0 };
    } else if (pts.size === 0) {
      start = null;
      rect = null;
      img.classList.remove('slot-dragging');
      commitHistory();
    }
  };
  img.addEventListener('pointerup', up);
  img.addEventListener('pointercancel', up);

  img.addEventListener('wheel', (e) => {
    e.preventDefault();
    p.zoom = Math.max(1, Math.min(6, (p.zoom || 1) * (e.deltaY < 0 ? 1.08 : 0.92)));
    if (p.zoom <= 1.02) { p.zoom = 1; p.ox = 0; p.oy = 0; }
    clampPan(); apply();
  }, { passive: false });
}

function renderPreview() {
  const holder = $('preview-holder');
  if (!holder) return;
  holder.innerHTML = previewHTML();
  hydrateSlotImages(holder);
  holder.querySelectorAll('.slot-img').forEach(img => {
    const i = +img.dataset.photo;
    const p = state.photos[i];
    if (p) attachSlotGestures(img, p, i);
  });
  applySlotSelection();
  renderUserStickers();
  fitFrame('preview-holder');
  invalidateShareFile();
  commitHistory();
}

let refitPending = false;
function refitFrames() {
  if (refitPending) return;
  refitPending = true;
  requestAnimationFrame(() => {
    refitPending = false;
    if (currentScreen === 'scr-preview') fitFrame('preview-holder');
    else if (currentScreen === 'scr-result') fitFrame('result-holder');
  });
}
/* Refit hanya saat LEBAR viewport berubah (orientasi/resize). Perubahan tinggi
   murni (toolbar browser HP muncul/hilang) DIABAIKAN — kalau tidak, tinggi
   bingkai yang kita ubah memicu resize lagi → layar kedut-kedut. */
let lastVpW = window.innerWidth;
window.addEventListener('resize', () => {
  if (Math.abs(window.innerWidth - lastVpW) < 2) return;
  lastVpW = window.innerWidth;
  refitFrames();
});
window.addEventListener('orientationchange', refitFrames);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
  refitFrames();
  /* ukur ulang caption setelah semua font selesai dimuat */
  if (currentScreen === 'scr-preview') renderPreview();
  else if (currentScreen === 'scr-result') renderResult();
});

let replaceChoiceIndex = null;
function onPreviewAction(act, i) {
  if (act === 'del') {
    /* "Buang": tanya mau retake atau buka galeri untuk ganti foto ini. */
    replaceChoiceIndex = i;
    openModal('replace-modal');
  } else if (act === 'retake') {
    state.replaceIndex = i;
    show('scr-cam');
  } else if (act === 'gallery') {
    state.replaceIndex = i;
    openGallery('preview');
  }
}
if ($('rp-retake')) $('rp-retake').onclick = () => {
  const i = replaceChoiceIndex;
  closeModal('replace-modal');
  if (i != null) { state.replaceIndex = i; show('scr-cam'); }
};
if ($('rp-gallery')) $('rp-gallery').onclick = () => {
  const i = replaceChoiceIndex;
  closeModal('replace-modal');
  if (i != null) { state.replaceIndex = i; openGallery('preview'); }
};
if ($('btn-close-replace')) $('btn-close-replace').onclick = () => closeModal('replace-modal');
{
  const rm = $('replace-modal');
  if (rm) rm.onclick = (e) => { if (e.target === rm) closeModal('replace-modal'); };
}

if ($('preview-holder')) {
  $('preview-holder').addEventListener('click', (e) => {
    const btn = e.target.closest('.slot-btn');
    if (!btn) return;
    onPreviewAction(btn.dataset.act, +btn.dataset.i);
  });
}

const dateToggle = $('toggle-date');
if (dateToggle) {
  dateToggle.checked = state.showDate;
  dateToggle.onchange = () => {
    state.showDate = dateToggle.checked;
    refreshActiveFrame();
    savePrefs();
  };
}

const frameToggle = $('toggle-frame');
if (frameToggle) {
  frameToggle.checked = state.frame;
  frameToggle.onchange = () => {
    state.frame = frameToggle.checked;
    refreshActiveFrame();
    savePrefs();
  };
}

/* Toggle "Garis Bingkai": tercentang = pakai garis bingkai, tidak dicentang = tanpa garis. */
const frameOutlineToggle = $('toggle-frame-outline');
if (frameOutlineToggle) {
  frameOutlineToggle.checked = state.customFrame.outlineOn !== false;
  frameOutlineToggle.onchange = () => {
    state.customFrame.outlineOn = frameOutlineToggle.checked;
    updateCustomFrameUI();
    refreshActiveFrame();
    savePrefs();
  };
}

const slotBorderToggle = $('toggle-slot-border');
if (slotBorderToggle) {
  slotBorderToggle.checked = state.customFrame.slotBorder !== false;
  slotBorderToggle.onchange = () => {
    state.customFrame.slotBorder = slotBorderToggle.checked;
    updateCustomFrameUI();
    refreshActiveFrame();
    savePrefs();
  };
}

const customInput = $('custom-text');
if (customInput) {
  customInput.value = state.customText;
  customInput.oninput = () => {
    state.customText = customInput.value.trim();
    refreshActiveFrame();
  };
}

/* ============ pemilih tanggal kustom (roda angka) ============ */
function initDateWheel() {
  const dayEl = $('dw-day'), monEl = $('dw-month'), yearEl = $('dw-year');
  if (!dayEl || !monEl || !yearEl) return;
  const ITEM = 40;
  const now = new Date();
  const yearMin = now.getFullYear() - 80;
  const yearMax = now.getFullYear() + 10;
  const pad = n => String(n).padStart(2, '0');
  const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };
  const daysIn = (yy, mm) => new Date(yy, mm, 0).getDate();
  const fill = (el, arr) => { el.innerHTML = arr.map(v => '<div class="dw-item">' + v + '</div>').join(''); };
  const indexOf = el => Math.max(0, Math.min(el.children.length - 1, Math.round(el.scrollTop / ITEM)));
  const scrollTo = (el, i) => { el.scrollTop = i * ITEM; };

  let cur = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  let settling = false, timer = null;

  fill(yearEl, range(yearMin, yearMax));
  fill(monEl, range(1, 12));
  fill(dayEl, range(1, 31));

  function rebuildDays() {
    const n = daysIn(cur.y, cur.m);
    if (cur.d > n) cur.d = n;
    if (dayEl.children.length !== n) fill(dayEl, range(1, n));
  }
  function position() {
    rebuildDays();
    scrollTo(yearEl, cur.y - yearMin);
    scrollTo(monEl, cur.m - 1);
    scrollTo(dayEl, cur.d - 1);
  }
  function withGuard(fn) {
    settling = true; fn();
    setTimeout(() => { settling = false; }, 350);
  }
  function apply() {
    state.customDate = cur.y + '-' + pad(cur.m) + '-' + pad(cur.d);
    refreshActiveFrame();
  }
  function settle() {
    cur.d = indexOf(dayEl) + 1;
    cur.m = indexOf(monEl) + 1;
    cur.y = yearMin + indexOf(yearEl);
    withGuard(rebuildDays);
    scrollTo(dayEl, cur.d - 1);
    apply();
  }
  const onScroll = () => {
    if (settling) return;
    clearTimeout(timer);
    timer = setTimeout(settle, 140);
  };
  [dayEl, monEl, yearEl].forEach(el => el.addEventListener('scroll', onScroll, { passive: true }));

  dateWheel = {
    set(iso) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
      if (m) cur = { y: +m[1], m: +m[2], d: +m[3] };
      else { const n = new Date(); cur = { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() }; }
    },
    refresh() { withGuard(position); },
  };
  dateWheel.set(state.customDate);

  const auto = $('dp-auto');
  if (auto) auto.onclick = () => {
    state.customDate = '';
    dateWheel.set('');
    dateWheel.refresh();
    updateDateButton();
    refreshActiveFrame();
  };
}
initDateWheel();

function updateDateButton() {
  const lbl = $('date-edit-label');
  if (lbl) lbl.textContent = currentDateText();
  const btn = $('date-edit-btn');
  if (btn) {
    btn.disabled = !state.showDate;          // aktif hanya saat toggle tanggal menyala
    btn.setAttribute('aria-disabled', String(!state.showDate));
  }
}
updateDateButton();

const dateEditBtn = $('date-edit-btn');
if (dateEditBtn) {
  dateEditBtn.onclick = () => {
    openModal('date-modal');
    if (dateWheel) dateWheel.set(state.customDate);
    requestAnimationFrame(() => { if (dateWheel) dateWheel.refresh(); });
  };
}
const dateModal = $('date-modal');
if ($('btn-close-date')) $('btn-close-date').onclick = () => closeModal('date-modal');
if ($('dp-done')) $('dp-done').onclick = () => closeModal('date-modal');
if (dateModal) dateModal.onclick = (e) => { if (e.target === dateModal) closeModal('date-modal'); };

const captionFontSel = $('caption-font');
if (captionFontSel) {
  captionFontSel.value = state.captionFont || 'Matcha Iced';
  captionFontSel.onchange = () => {
    state.captionFont = captionFontSel.value;
    refreshActiveFrame();
    savePrefs();
  };
}

const dateFontSel = $('date-font');
if (dateFontSel) {
  dateFontSel.value = state.dateFont || 'Matcha Iced';
  dateFontSel.onchange = () => {
    state.dateFont = dateFontSel.value;
    refreshActiveFrame();
    savePrefs();
  };
}

/* ============ pemilih font: tampilkan contoh bentuk + nama font ============ */
const FONT_LABELS = {
  'Matcha Iced': 'Matcha Iced',
  'The Magic Cookie': 'The Magic Cookie',
  'Orange Lovely': 'Orange Lovely',
  'Quicksand': 'Quicksand',
  'Fredoka': 'Fredoka',
  'Always Classy': 'Always Classy',
  'Melon Tea': 'Melon Tea',
  'Smart Water': 'Smart Water',
  'Stay With Me': 'Stay With Me',
  'Streat Coffee': 'Streat Coffee',
  'Super Waffles': 'Super Waffles',
  'Anak Bijak': 'Anak Bijak',
};
const fontLabel = v => FONT_LABELS[v] || v;
const fontCss = v => '"' + v + '", "Quicksand", sans-serif';

function closeFontPickers(except) {
  document.querySelectorAll('.font-picker.open').forEach(p => {
    if (p === except) return;
    if (typeof p._fpClose === 'function') p._fpClose();
    else p.classList.remove('open');
  });
}

function buildFontPicker(select) {
  if (!select || select.dataset.fpReady) return;
  select.dataset.fpReady = '1';
  select.classList.add('font-select-native');

  const wrap = document.createElement('div');
  wrap.className = 'font-picker';
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'font-pick-toggle';
  toggle.setAttribute('aria-haspopup', 'listbox');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', select.getAttribute('aria-label') || 'Font');
  const tSample = document.createElement('span');
  tSample.className = 'font-pick-sample';
  tSample.textContent = 'Aa';
  const tName = document.createElement('span');
  tName.className = 'font-pick-name';
  const caret = document.createElement('span');
  caret.className = 'ms font-pick-caret';
  caret.textContent = 'expand_more';
  toggle.append(tSample, tName, caret);

  /* Menu ditempel ke <body> (bukan di dalam modal) supaya tidak terpotong
     overflow modal. Posisinya dihitung fixed mengikuti tombol. */
  const menu = document.createElement('div');
  menu.className = 'font-pick-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  document.body.appendChild(menu);

  const opts = Array.from(select.options).map(o => ({ value: o.value, label: fontLabel(o.value) }));

  function sync() {
    const cur = select.value || (opts[0] && opts[0].value);
    const css = fontCss(cur);
    tSample.style.fontFamily = css;
    tName.style.fontFamily = css;
    tName.textContent = fontLabel(cur);
    menu.querySelectorAll('.font-pick-item').forEach(b => b.classList.toggle('sel', b.dataset.value === cur));
  }

  function place() {
    const r = toggle.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, gap = 6, pad = 8;
    const width = Math.min(Math.max(r.width, 180), vw - pad * 2);
    menu.style.width = width + 'px';
    menu.style.left = Math.max(pad, Math.min(r.left, vw - pad - width)) + 'px';

    menu.style.maxHeight = 'none';
    const natural = menu.scrollHeight;
    const below = vh - r.bottom - gap - pad;
    const above = r.top - gap - pad;
    if (below >= Math.min(natural, 240) || below >= above) {
      menu.style.top = (r.bottom + gap) + 'px';
      menu.style.maxHeight = Math.max(120, below) + 'px';
    } else {
      menu.style.maxHeight = Math.max(120, above) + 'px';
      menu.style.top = Math.max(pad, r.top - gap - menu.offsetHeight) + 'px';
    }
  }

  const onScroll = (e) => {
    if (!wrap.classList.contains('open')) return;
    if (e.target === menu) return; /* jangan hitung ulang saat menggeser isi dropdown */
    place();
  };
  const onResize = () => { if (wrap.classList.contains('open')) place(); };

  function close() {
    wrap.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
  }
  function open() {
    closeFontPickers(wrap);
    wrap.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
  }
  wrap._fpClose = close;

  opts.forEach(o => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'font-pick-item';
    item.dataset.value = o.value;
    item.setAttribute('role', 'option');
    const s = document.createElement('span');
    s.className = 'font-pick-sample';
    s.textContent = 'Aa';
    s.style.fontFamily = fontCss(o.value);
    const n = document.createElement('span');
    n.className = 'font-pick-name';
    n.textContent = o.label;
    n.style.fontFamily = fontCss(o.value);
    item.append(s, n);
    item.onclick = () => {
      select.value = o.value;
      sync();
      close();
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    menu.appendChild(item);
  });

  toggle.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (wrap.classList.contains('open')) close(); else open();
  };

  wrap.append(toggle);

  /* Ikut tersinkron saat value diubah dari kode (mis. restore preferensi/undo). */
  try {
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value');
    if (desc && desc.get && desc.set) {
      Object.defineProperty(select, 'value', {
        configurable: true,
        get() { return desc.get.call(this); },
        set(v) { desc.set.call(this, v); try { sync(); } catch (err) { /* abaikan */ } },
      });
    }
  } catch (e) { /* abaikan */ }

  sync();
}

function initFontPickers() {
  document.querySelectorAll('select[id$="-font"]').forEach(buildFontPicker);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.font-picker') && !e.target.closest('.font-pick-menu')) closeFontPickers(null);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFontPickers(null); });
}
initFontPickers();

const darkToggle = $('toggle-dark');
if (darkToggle) {
  const syncDarkIcon = () => {
    const ico = $('dark-ico');
    if (ico) ico.textContent = document.body.classList.contains('dark-mode') ? 'dark_mode' : 'light_mode';
  };
  syncDarkIcon();
  darkToggle.onclick = () => {
    document.body.classList.toggle('dark-mode');
    syncDarkIcon();
    savePrefs();
  };
}

/* ============ capture settings ============ */
const countdownBtn = $('set-countdown-btn');
function countdownLabel(v) {
  return v === 0 ? tr('cam.off') : tr('cam.s' + v);
}
function syncCountdown() {
  if (countdownBtn) countdownBtn.textContent = countdownLabel(state.countdown);
  const val = $('countdown-val');
  if (val) val.textContent = state.countdown === 0 ? '—' : state.countdown + 's';
  const grid = $('countdown-grid');
  if (grid) grid.querySelectorAll('.cd-option').forEach(b => b.classList.toggle('sel', +b.dataset.v === state.countdown));
}
function buildCountdownPicker() {
  const grid = $('countdown-grid');
  if (!grid) return;
  grid.innerHTML = '';
  [0, 3, 5, 10].forEach(v => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cd-option' + (v === state.countdown ? ' sel' : '');
    b.dataset.v = v;
    b.textContent = countdownLabel(v);
    b.onclick = () => { state.countdown = v; syncCountdown(); closeModal('countdown-modal'); savePrefs(); };
    grid.appendChild(b);
  });
  syncCountdown();
}
buildCountdownPicker();
if (countdownBtn) countdownBtn.onclick = () => { syncCountdown(); openModal('countdown-modal'); };
if ($('btn-close-countdown')) $('btn-close-countdown').onclick = () => closeModal('countdown-modal');
const countdownModal = $('countdown-modal');
if (countdownModal) countdownModal.onclick = (e) => { if (e.target === countdownModal) closeModal('countdown-modal'); };

/* tombol flash di dalam preview kamera + popover pilihan mode */
const flashBtn = $('btn-flash');
const flashMenu = $('flash-menu');
function syncFlashBtn() {
  const g = $('flash-glyph');
  if (g) {
    g.textContent = state.flash === 'off' ? 'flash_off' : state.flash === 'auto' ? 'flash_auto' : 'flash_on';
  }
  const v = $('flash-val');
  if (v) v.textContent = '';
  if (flashBtn) flashBtn.setAttribute('aria-expanded', String(!!flashMenu && !flashMenu.hidden));
  if (flashMenu) flashMenu.querySelectorAll('[data-flash]').forEach(b =>
    b.classList.toggle('sel', b.dataset.flash === state.flash));
}
if (flashMenu) flashMenu.querySelectorAll('[data-flash]').forEach(b => {
  b.onclick = () => {
    state.flash = b.dataset.flash;
    flashMenu.hidden = true;
    syncFlashBtn();
    savePrefs();
  };
});
if (flashBtn) flashBtn.onclick = (e) => {
  e.stopPropagation();
  if (!flashMenu) return;
  flashMenu.hidden = !flashMenu.hidden;
  syncFlashBtn();
};
document.addEventListener('click', (e) => {
  if (!flashMenu || flashMenu.hidden) return;
  if (!e.target.closest('.cam-top-controls')) { flashMenu.hidden = true; syncFlashBtn(); }
});
syncFlashBtn();

/* tombol suara: tap untuk aktif/nonaktif, ikon volume_off saat mati */
const soundBtn = $('btn-sound');
function syncSoundBtn() {
  const g = $('sound-glyph');
  if (g) { g.textContent = state.sound ? 'volume_up' : 'volume_off'; g.classList.toggle('muted', !state.sound); }
  if (soundBtn) soundBtn.setAttribute('aria-pressed', String(state.sound));
}
if (soundBtn) soundBtn.onclick = () => { state.sound = !state.sound; syncSoundBtn(); if (state.sound) beep(); savePrefs(); };
syncSoundBtn();

/* tombol hitung mundur: tap berulang untuk ganti durasi */
const CD_VALUES = [0, 3, 5, 10];
const countdownInCam = $('btn-countdown');
if (countdownInCam) countdownInCam.onclick = () => {
  const i = CD_VALUES.indexOf(state.countdown);
  state.countdown = CD_VALUES[(i + 1) % CD_VALUES.length];
  syncCountdown();
  savePrefs();
};
syncCountdown();

/* ============ interactive stickers ============ */
function updateStickerTransform(el, st, isDragging = false) {
  const dragScale = isDragging ? 1.08 : 1.0;
  const scale = (st.scale || 1) * dragScale;
  const rot = st.rotation || 0;
  el.style.left = (st.x * 100) + '%';
  el.style.top = (st.y * 100) + '%';
  el.style.transform = `translate(-50%, -50%) scale(${scale}) rotate(${rot}deg)`;
}

function renderUserStickers() {
  const active = document.querySelector('.screen.active');
  const layer = active ? active.querySelector('.sticker-layer') : null;
  if (!layer) return;
  layer.innerHTML = '';
  const frameOuter = layer.closest('.frame-outer');   // frame hasil (bukan preview tema)

  state.stickers.forEach((st, idx) => {
    const isSelected = st.id === state.selectedStickerId;
    const el = document.createElement('div');
    el.className = 'user-sticker' + (isSelected ? ' selected' : '');
    el.dataset.id = st.id;
    el.style.zIndex = isSelected ? 99 : (10 + idx);

    updateStickerTransform(el, st);

    let innerContent = '';
    if (st.type === 'char') {
      innerContent = `<div class="char-inner"><svg><use href="#ch-${st.value}"/></svg></div>`;
    } else if (st.type === 'text') {
      const fam = st.font || 'Matcha Iced';
      const col = st.color || '#23233a';
      innerContent = '<div class="text-inner' + (st.outline === false ? '' : ' has-outline') +
        '" style="font-family:\'' + fam + '\', Quicksand, sans-serif;color:' + col +
        ';letter-spacing:' + fontTracking(fam) + 'em">' +
        esc(st.value) + '</div>';
    } else {
      innerContent = `<div class="sticker-inner">${st.value}</div>`;
    }

    el.innerHTML = innerContent;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    const label = st.type === 'text' ? (tr('st.text') + st.value)
      : st.type === 'char' ? tr('st.char') + ' ' + CHAR_NAMES[st.value] : (tr('st.emoji') + st.value);
    el.setAttribute('aria-label', label + '. ' + tr('st.hint'));
    el.addEventListener('focus', () => {
      state.selectedStickerId = st.id;
      layer.querySelectorAll('.user-sticker').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
      el.style.zIndex = 99;
    });
    attachStickerGestures(el, st, frameOuter);

    layer.appendChild(el);
  });
  commitHistory();
}

/* Finger gestures: 1 jari = pindah, 2 jari = zoom + putar.
   Tap/klik stiker = pilih & tampilkan tombol hapus.
   Desktop: scroll = zoom, Shift+scroll = putar. Tombol kontrol tidak dipakai. */
function attachStickerGestures(el, st, frameOuter) {
  const pts = new Map();          // pointerId aktif -> posisi
  let pinch = null;               // data awal pinch
  let dragStart = null;           // data awal drag
  let active = false;

  const two = () => [...pts.values()];
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  const rectOf = () => (frameOuter ? frameOuter.getBoundingClientRect() : el.getBoundingClientRect());

  const select = () => {
    const l = el.parentElement;
    if (l) l.querySelectorAll('.user-sticker').forEach(x => { x.classList.remove('selected'); x.style.zIndex = ''; });
    el.classList.add('selected');
    el.style.zIndex = 99;
    state.selectedStickerId = st.id;
  };

  const removeSticker = () => {
    state.stickers = state.stickers.filter(s => s.id !== st.id);
    if (state.selectedStickerId === st.id) state.selectedStickerId = null;
    renderUserStickers();
    return true;
  };

  // Tombol hapus muncul saat stiker dipilih (tap/klik).
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'sticker-delete';
  delBtn.innerHTML = '<span class="ms">close</span>';
  delBtn.title = tr('st.delete');
  delBtn.setAttribute('aria-label', tr('st.deleteAria'));
  delBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
  delBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); removeSticker(); });
  el.appendChild(delBtn);

  const startPinch = () => {
    dragStart = null;
    const [a, b] = two();
    pinch = { dist: dist(a, b) || 1, angle: ang(a, b), scale: st.scale || 1, rotation: st.rotation || 0 };
  };

  const onMove = (e) => {
    if (!active || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size >= 2 && pinch) {
      const [a, b] = two();
      st.scale = Math.max(0.3, Math.min(3.5, pinch.scale * (dist(a, b) / pinch.dist)));
      st.rotation = Math.round((pinch.rotation + (ang(a, b) - pinch.angle)) + 360) % 360;
      updateStickerTransform(el, st);
      return;
    }

    if (dragStart && pts.size === 1) {
      const dx = e.clientX - dragStart.px;
      const dy = e.clientY - dragStart.py;
      st.x = Math.max(-0.25, Math.min(1.25, dragStart.x + dx / dragStart.rect.width));
      st.y = Math.max(-0.25, Math.min(1.25, dragStart.y + dy / dragStart.rect.height));
      updateStickerTransform(el, st, true);
    }
  };

  const onExtraDown = (e) => {
    if (!active) return;
    e.stopPropagation();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2) startPinch();
  };

  const onUp = (e) => {
    if (!active) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 1) {
      const pid = [...pts.keys()][0];
      const p = pts.get(pid);
      dragStart = { px: p.x, py: p.y, x: st.x, y: st.y, rect: rectOf() };
    }
    if (pts.size === 0) endGesture();
  };

  const endGesture = () => {
    active = false;
    pts.clear();
    pinch = null;
    dragStart = null;
    el.classList.remove('is-dragging');
    window.removeEventListener('pointerdown', onExtraDown, true);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);
    updateStickerTransform(el, st);
    commitHistory();
  };

  el.addEventListener('pointerdown', (e) => {
    if (active) return;
    e.stopPropagation();
    active = true;
    select();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    el.classList.add('is-dragging');
    dragStart = { px: e.clientX, py: e.clientY, x: st.x, y: st.y, rect: rectOf() };
    window.addEventListener('pointerdown', onExtraDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  });

  el.addEventListener('dblclick', (e) => {
    if (st.type !== 'text') return;
    e.stopPropagation();
    openTextEditor(st);
  });

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.shiftKey) st.rotation = ((st.rotation || 0) - Math.sign(e.deltaY) * 10 + 360) % 360;
    else st.scale = Math.max(0.3, Math.min(3.5, (st.scale || 1) * (e.deltaY < 0 ? 1.06 : 0.94)));
    updateStickerTransform(el, st);
  }, { passive: false });
}

document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.user-sticker') && !e.target.closest('#btn-add-sticker') && !e.target.closest('#btn-preview-sticker') && !e.target.closest('#sticker-modal')) {
    if (state.selectedStickerId !== null) {
      state.selectedStickerId = null;
      renderUserStickers();
    }
  }
});

function initStickerPicker() {
  const modal = $('sticker-modal');
  const btnOpen = $('btn-add-sticker');
  const btnClose = $('btn-close-sticker');
  const charGrid = $('char-sticker-grid');
  const emojiGrid = $('emoji-sticker-grid');

  if (!modal) return;

  // One artwork source keeps the picker, photo preview and PNG in sync.
  $('sticker-defs').innerHTML = CHARS.map(c =>
    `<symbol id="ch-${c}" viewBox="0 0 48 48">${CHAR_SVG[c]}</symbol>`
  ).join('');

  if (btnOpen) btnOpen.onclick = () => openModal('sticker-modal');
  const btnPreviewSticker = $('btn-preview-sticker');
  if (btnPreviewSticker) btnPreviewSticker.onclick = () => openModal('sticker-modal');

  btnClose.onclick = () => {
    closeModal('sticker-modal');
  };

  modal.onclick = (e) => {
    if (e.target === modal) closeModal('sticker-modal');
  };

  charGrid.innerHTML = '';
  CHARS.forEach(c => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'sticker-item';
    item.title = CHAR_NAMES[c];
    item.setAttribute('aria-label', CHAR_NAMES[c]);
    item.innerHTML = `<svg><use href="#ch-${c}"/></svg>`;
    item.onclick = () => {
      addSticker('char', c);
      modal.classList.remove('open');
    };
    charGrid.appendChild(item);
  });

  emojiGrid.innerHTML = '';
  EMOJI_STICKERS.forEach(em => {
    const item = document.createElement('div');
    item.className = 'sticker-item';
    item.textContent = em;
    item.onclick = () => {
      addSticker('emoji', em);
      modal.classList.remove('open');
    };
    emojiGrid.appendChild(item);
  });

  const textInput = $('sticker-text-input');
  const btnAddText = $('btn-add-text');
  if (textInput && btnAddText) {
    btnAddText.onclick = () => {
      if (addTextSticker(textInput.value)) { textInput.value = ''; modal.classList.remove('open'); }
      else textInput.focus();
    };
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); btnAddText.click(); }
    });
  }
}

function addTextSticker(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  const id = Date.now() + Math.random();
  const count = state.stickers.length;
  const offsetX = ((count % 5) - 2) * 0.1;
  const offsetY = ((Math.floor(count / 5) % 5) - 2) * 0.08;
  const fontSel = $('sticker-font'), outIn = $('sticker-outline');
  state.stickers.push({
    id, type: 'text', value,
    font: (fontSel && fontSel.value) || 'Matcha Iced',
    color: colorOf('sticker-color'),
    outline: outIn ? outIn.checked : true,
    x: 0.5 + offsetX, y: 0.45 + offsetY, scale: 1, rotation: 0,
  });
  state.selectedStickerId = id;
  renderUserStickers();
  return true;
}

function addSticker(type, value) {
  const id = Date.now() + Math.random();
  const count = state.stickers.length;
  const offsetX = ((count % 5) - 2) * 0.1;
  const offsetY = ((Math.floor(count / 5) % 5) - 2) * 0.08;

  const newSticker = {
    id,
    type,
    value,
    x: 0.5 + offsetX,
    y: 0.45 + offsetY,
    scale: 1.0,
    rotation: 0
  };
  state.stickers.push(newSticker);
  state.selectedStickerId = id;
  renderUserStickers();
}

initStickerPicker();

/* ============ pemilih warna modal ============ */
let colorTargetId = 'sticker-color';

function colorOf(id) {
  const el = $(id);
  return (el && el.dataset.color) || '#23233a';
}
function setColor(id, color) {
  paintColor(id, color);
  if (id && id.indexOf('cf-') === 0) {
    const f = state.customFrame;
    if (id === 'cf-bg') { f.bg = color; f.bg2 = lighten(color, .6); }
    else if (id === 'cf-outline') f.outline = color;
    else if (id === 'cf-slot') f.slot = color;
    rerenderCustom();
  } else if (id === 'caption-color' || id === 'date-color') {
    if (id === 'caption-color') state.captionColor = color; else state.dateColor = color;
    refreshActiveFrame();
    savePrefs();
  }
}
/* ---------- palet rekomendasi ---------- */
const RECOMMENDED_PALETTES = [
  { name: 'Pastel Dream', colors: ['#ffd1e8', '#ffe6f2', '#e9dcff', '#c9e4ff', '#d5f5e3', '#fff3c4'] },
  { name: 'Sunset Glow', colors: ['#ff9a8b', '#ff6a88', '#ff99ac', '#f9c74f', '#f8961e', '#f3722c'] },
  { name: 'Neon Pop', colors: ['#ff007f', '#00f0ff', '#7b68ee', '#39ff14', '#ffea00', '#ff5e00'] },
  { name: 'Earthy', colors: ['#8a6a3c', '#b08968', '#ddb892', '#e6ccb2', '#7f5539', '#9c6644'] },
  { name: 'Ocean', colors: ['#0a6bb0', '#4facfe', '#00f0ff', '#3f9fe0', '#b8c6db', '#0f6b3a'] },
  { name: 'Monokrom', colors: ['#111111', '#333333', '#555555', '#9a9a9a', '#cccccc', '#ffffff'] },
  { name: 'Sweet Pink', colors: ['#d63384', '#e1306c', '#ff8fab', '#ffb3c7', '#f7c8d8', '#fff0f4'] },
  { name: 'Fresh', colors: ['#25d366', '#a8e6cf', '#6fbf5f', '#0f6b3a', '#e6c766', '#4facfe'] },
];

/* ---------- konversi warna ---------- */
function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, xx = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = xx; } else if (h < 120) { r = xx; g = c; }
  else if (h < 180) { g = c; b = xx; } else if (h < 240) { g = xx; b = c; }
  else if (h < 300) { r = xx; b = c; } else { r = c; b = xx; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max ? d / max : 0, max];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToCmyk(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k >= 1) return [0, 0, 0, 100];
  return [
    Math.round((1 - rn - k) / (1 - k) * 100),
    Math.round((1 - gn - k) / (1 - k) * 100),
    Math.round((1 - bn - k) / (1 - k) * 100),
    Math.round(k * 100),
  ];
}

/* ---------- pemilih warna custom (bisa diseret) ---------- */
/* Parse kode warna manual: #RGB, #RRGGBB, atau rgb(r,g,b). */
function parseColorCode(str) {
  const s = String(str || '').trim().toLowerCase();
  if (!s) return null;
  let m = /^#?([0-9a-f]{3})$/.exec(s);
  if (m) { const h = m[1]; return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
  m = /^#?([0-9a-f]{6})$/.exec(s);
  if (m) return '#' + m[1];
  m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(s);
  if (m) {
    const r = +m[1], g = +m[2], b = +m[3];
    if (r < 256 && g < 256 && b < 256) return rgbToHex(r, g, b);
  }
  return null;
}
let ccHsv = [330, 0.6, 1];
function updateCustomColorUI() {
  const [h, s, v] = ccHsv;
  const rgb = hsvToRgb(h, s, v);
  const hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
  const area = $('cc-area');
  if (area) area.style.setProperty('--cc-h', String(Math.round(h)));
  const cur = $('cc-cursor');
  if (cur) {
    cur.style.left = (s * 100) + '%';
    cur.style.top = ((1 - v) * 100) + '%';
    cur.style.background = hex;
  }
  const hue = $('cc-hue');
  if (hue) hue.value = String(Math.round(h));
  const prev = $('cc-preview');
  if (prev) prev.style.background = hex;
  if ($('cc-hex')) $('cc-hex').textContent = hex.toUpperCase();
  if ($('cc-rgb')) $('cc-rgb').textContent = rgb[0] + ', ' + rgb[1] + ', ' + rgb[2];
  if ($('cc-cmyk')) {
    const c = rgbToCmyk(rgb[0], rgb[1], rgb[2]);
    $('cc-cmyk').textContent = c[0] + '%, ' + c[1] + '%, ' + c[2] + '%, ' + c[3] + '%';
  }
  const code = $('cc-code-input');
  if (code && document.activeElement !== code) code.value = hex.toUpperCase();
}
function setCustomFromHex(hex) {
  const [r, g, b] = hexToRgb(hex);
  ccHsv = rgbToHsv(r, g, b);
  updateCustomColorUI();
}
/* Pilih warna dari palet: tampilkan kode HEX/RGB/CMYK dulu, terapkan lewat "Pakai Warna". */
function selectColorChoice(hex) {
  setCustomFromHex(hex);
  const low = String(hex).toLowerCase();
  document.querySelectorAll('#color-modal .color-swatch').forEach(x => {
    x.classList.toggle('sel', String(x.dataset.color).toLowerCase() === low);
  });
}
function bindCustomColorPicker() {
  const area = $('cc-area');
  if (area) {
    const pick = (e) => {
      const rect = area.getBoundingClientRect();
      const s = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const v = 1 - Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      ccHsv = [ccHsv[0], s, v];
      updateCustomColorUI();
    };
    let dragging = false;
    area.addEventListener('pointerdown', (e) => {
      dragging = true;
      try { area.setPointerCapture(e.pointerId); } catch (err) { /* abaikan */ }
      pick(e); e.preventDefault();
    });
    area.addEventListener('pointermove', (e) => { if (dragging) pick(e); });
    const end = (e) => { dragging = false; try { area.releasePointerCapture(e.pointerId); } catch (err) { /* abaikan */ } };
    area.addEventListener('pointerup', end);
    area.addEventListener('pointercancel', end);
  }
  const hue = $('cc-hue');
  if (hue) hue.addEventListener('input', () => { ccHsv = [Number(hue.value), ccHsv[1], ccHsv[2]]; updateCustomColorUI(); });
  const apply = $('cc-apply');
  if (apply) apply.onclick = () => {
    const rgb = hsvToRgb(ccHsv[0], ccHsv[1], ccHsv[2]);
    setColor(colorTargetId, rgbToHex(rgb[0], rgb[1], rgb[2]));
    closeModal('color-modal');
  };
  /* Input kode warna manual (HEX / RGB) */
  const codeInput = $('cc-code-input');
  if (codeInput) {
    codeInput.addEventListener('input', () => {
      const hex = parseColorCode(codeInput.value);
      if (hex) setCustomFromHex(hex);
    });
    codeInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const hex = parseColorCode(codeInput.value);
      if (hex) { setCustomFromHex(hex); codeInput.blur(); }
    });
  }
  /* Eyedropper: ambil warna dari mana saja di layar */
  const drop = $('cc-eyedropper');
  if (drop) drop.onclick = async () => {
    if (!window.EyeDropper) { showToast(tr('toast.noEyedrop')); return; }
    try {
      const res = await new window.EyeDropper().open();
      if (res && res.sRGBHex) setCustomFromHex(res.sRGBHex);
    } catch (e) { /* dibatalkan user */ }
  };
  updateCustomColorUI();
}

/* Dropdown palet rekomendasi + swatch di bawahnya. */
function buildPalettePicker() {
  const picker = $('pal-picker');
  const menu = $('pal-menu');
  const toggle = $('pal-toggle');
  const nameEl = $('pal-toggle-name');
  const chipsEl = $('pal-toggle-chips');
  const swatches = $('pal-swatches');
  if (!picker || !menu || !toggle) return;

  const chips = colors => colors.map(c => '<i style="background:' + c + '"></i>').join('');

  function selectPalette(idx) {
    const p = RECOMMENDED_PALETTES[idx];
    if (!p) return;
    toggle.dataset.idx = String(idx);
    if (nameEl) nameEl.textContent = p.name;
    if (chipsEl) chipsEl.innerHTML = chips(p.colors);
    if (swatches) {
      swatches.innerHTML = '';
      p.colors.forEach(c => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'color-swatch';
        b.style.background = c;
        b.dataset.color = c;
        b.setAttribute('aria-label', c);
        b.onclick = () => selectColorChoice(c);
        swatches.appendChild(b);
      });
    }
    menu.querySelectorAll('.pal-option').forEach(x => x.classList.toggle('sel', +x.dataset.i === idx));
  }
  function closeMenu() {
    menu.hidden = true;
    picker.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  menu.innerHTML = '';
  RECOMMENDED_PALETTES.forEach((p, idx) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pal-option';
    b.dataset.i = String(idx);
    b.setAttribute('role', 'option');
    b.innerHTML = '<span class="pal-option-name">' + p.name + '</span>' +
      '<span class="pal-option-chips">' + chips(p.colors) + '</span>';
    b.onclick = () => { selectPalette(idx); closeMenu(); };
    menu.appendChild(b);
  });

  toggle.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    picker.classList.toggle('open', willOpen);
    toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  };
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.pal-picker')) closeMenu();
  });

  selectPalette(0);
}

function buildColorPicker() {
  const modal = $('color-modal');
  if (!modal) return;

  buildPalettePicker();

  bindCustomColorPicker();
  if ($('btn-close-color')) $('btn-close-color').onclick = () => closeModal('color-modal');
  modal.onclick = (e) => { if (e.target === modal) closeModal('color-modal'); };
}
buildColorPicker();

function openColorPicker(targetId) {
  colorTargetId = targetId;
  selectColorChoice(colorOf(targetId));
  openModal('color-modal');
}
['sticker-color', 'edit-color', 'caption-color', 'date-color'].forEach(id => {
  const el = $(id);
  if (el) el.onclick = () => openColorPicker(id);
});

/* Warna efektif caption/tanggal (mengikuti tema bila belum dipilih). */
function syncTextColorsUI() {
  const def = DATE_COLORS[state.theme] || '#8a5b7e';
  paintColor('caption-color', state.captionColor || def);
  paintColor('date-color', state.dateColor || def);
}

/* Editor teks inline (menggantikan prompt/confirm) */
let editingTextId = null;
function openTextEditor(st) {
  editingTextId = st.id;
  const input = $('text-edit-input');
  if (input) input.value = st.value;
  if ($('edit-font')) $('edit-font').value = st.font || 'Matcha Iced';
  setColor('edit-color', st.color || '#23233a');
  if ($('edit-outline')) $('edit-outline').checked = st.outline !== false;
  openModal('text-edit-modal');
  if (input) setTimeout(() => input.focus(), 60);
}
function commitTextEdit() {
  const input = $('text-edit-input');
  const st = state.stickers.find(s => s.id === editingTextId);
  if (st) {
    if (input && input.value.trim()) st.value = input.value.trim();
    if ($('edit-font')) st.font = $('edit-font').value;
    st.color = colorOf('edit-color');
    if ($('edit-outline')) st.outline = $('edit-outline').checked;
  }
  editingTextId = null;
  closeModal('text-edit-modal');
  renderUserStickers();
}
if ($('btn-save-text-edit')) $('btn-save-text-edit').onclick = commitTextEdit;
if ($('btn-cancel-text-edit')) $('btn-cancel-text-edit').onclick = () => {
  editingTextId = null;
  closeModal('text-edit-modal');
};
if ($('btn-close-text-edit')) $('btn-close-text-edit').onclick = () => {
  editingTextId = null;
  closeModal('text-edit-modal');
};
if ($('text-edit-input')) $('text-edit-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); commitTextEdit(); }
});

/* Kontrol keyboard untuk stiker yang dipilih (aksesibilitas) */
document.addEventListener('keydown', (e) => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const id = state.selectedStickerId;
  if (id == null) return;
  const st = state.stickers.find(s => s.id === id);
  if (!st) return;
  const step = e.shiftKey ? 0.05 : 0.01;
  let used = true;
  switch (e.key) {
    case 'ArrowLeft': st.x = Math.max(-0.25, st.x - step); break;
    case 'ArrowRight': st.x = Math.min(1.25, st.x + step); break;
    case 'ArrowUp': st.y = Math.max(-0.25, st.y - step); break;
    case 'ArrowDown': st.y = Math.min(1.25, st.y + step); break;
    case '+': case '=': st.scale = Math.min(3.5, (st.scale || 1) + 0.1); break;
    case '-': case '_': st.scale = Math.max(0.3, (st.scale || 1) - 0.1); break;
    case '[': st.rotation = ((st.rotation || 0) - 15 + 360) % 360; break;
    case ']': st.rotation = ((st.rotation || 0) + 15) % 360; break;
    case 'Delete': case 'Backspace':
      state.stickers = state.stickers.filter(s => s.id !== id);
      state.selectedStickerId = null;
      renderUserStickers();
      break;
    default: used = false;
  }
  if (used) {
    e.preventDefault();
    const el = document.querySelector('.screen.active .sticker-layer [data-id="' + id + '"]');
    if (el) updateStickerTransform(el, st);
  }
});

/* ============ social share ============ */
async function getWatermarkedFile() {
  const cv = await compose(state.photos, state.layout, state.theme, state.stickers, state.showDate, state.customText, state.frame, state.captionFont, state.customFrame, captionLayout(), state.dateFont, state.captionColor, state.dateColor, state.customFrame.outlineOn, state.customDate ? currentDateText() : '');
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const fileName = 'snappie-studio-' + state.theme + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.png';
  return new File([blob], fileName, { type: 'image/png' });
}

/* Toast singkat untuk notifikasi (mis. caption & link berhasil disalin). */
let toastTimer = null;
function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* Teks bagikan: caption + URL halaman ini. */
const shareCaption = () => tr('share.caption');
const shareUrl = () => window.location.href;

/* Salin caption & URL ke clipboard otomatis setiap kali user membagikan. */
async function copyShareText(prefix) {
  const text = (prefix ? prefix + '\n' : '') + shareCaption() + '\n' + shareUrl();
  try {
    await navigator.clipboard.writeText(text);
    showToast(tr('toast.copied'));
    return true;
  } catch (e) {
    showToast(tr('toast.copyFail'));
    return false;
  }
}

/* Buka aplikasi sosmed yang terpasang di perangkat lewat skema URL.
   Kalau ada 2 varian (mis. WhatsApp & WhatsApp Business), sistem Android yang menanya. */
function launchApp(scheme) {
  offerAnotherSession();
  window.location.href = scheme;
}

/* Cache file PNG untuk share. navigator.share (khususnya iOS) butuh "user
   activation"; kalau menyusun PNG dulu (async) aktivasi bisa hilang dan share
   gagal → sistem cuma berbagi teks. Jadi PNG disiapkan lebih awal & disimpan. */
let shareFileCache = null;
let shareFilePending = null;   // Promise compose yang sedang jalan (dipakai ulang, tidak dobel)
let shareGen = 0;              // naik tiap frame berubah; hasil compose lama tidak boleh disimpan
function invalidateShareFile() {
  shareFileCache = null;
  shareFilePending = null;
  shareGen++;
}
function currentShareFile() {
  if (shareFileCache) return Promise.resolve(shareFileCache);
  if (shareFilePending) return shareFilePending;
  const p = (async () => {
    for (;;) {
      const gen = shareGen;
      const f = await getWatermarkedFile();
      if (gen === shareGen) { shareFileCache = f; return f; }   // tidak berubah selama compose
    }
  })();
  shareFilePending = p;
  const clear = () => { if (shareFilePending === p) shareFilePending = null; };
  p.then(clear, clear);
  return p;
}
function primeShareFile() { currentShareFile().catch(() => {}); }

/* Ikon sosmed di layar hasil langsung membagikan foto ke platform terkait. */
function initShareButtons() {
  const ig = $('share-ig'), wa = $('share-wa'), fb = $('share-fb'), tt = $('share-tt');
  if (!ig || !wa || !fb || !tt) return;
  /* Panaskan PNG begitu jari menyentuh tombol → share punya file siap pakai. */
  [ig, wa, fb, tt].forEach(b => b.addEventListener('pointerdown', primeShareFile, { passive: true }));

  /* Kirim foto lewat share sheet (Web Share API). Tidak mengunduh file otomatis.
     Return: 'shared' | 'cancelled' | 'unsupported'. */
  const sharePhoto = async (file) => {
    if (!navigator.share) return 'unsupported';
    if (navigator.canShare && !navigator.canShare({ files: [file] })) return 'unsupported';
    try {
      await navigator.share({ title: 'Snappie Studio', text: shareCaption() + '\n' + shareUrl(), files: [file] });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      return 'unsupported';
    }
  };

  // Instagram — pilih Feed atau Story
  ig.onclick = () => { primeShareFile(); openModal('ig-modal'); };

  const igModal = $('ig-modal');
  if ($('btn-close-ig')) $('btn-close-ig').onclick = () => closeModal('ig-modal');
  if (igModal) igModal.onclick = (e) => { if (e.target === igModal) closeModal('ig-modal'); };

  if ($('ig-feed')) $('ig-feed').onclick = async () => {
    closeModal('ig-modal');
    copyShareText();
    try {
      const file = await currentShareFile();
      const r = await sharePhoto(file);
      if (r === 'shared') { offerAnotherSession(); }
      else if (r === 'unsupported') launchApp('instagram://app');
    } catch (e) { /* batal — abaikan */ }
  };

  if ($('ig-story')) $('ig-story').onclick = async () => {
    closeModal('ig-modal');
    copyShareText();
    try {
      const file = await currentShareFile();
      const r = await sharePhoto(file);
      if (r === 'shared') { offerAnotherSession(); }
      else if (r === 'unsupported') launchApp('instagram://story-camera');
    } catch (e) { /* batal — abaikan */ }
  };

  // WhatsApp — lewat share sheet agar foto ikut
  wa.onclick = async () => {
    copyShareText();
    try {
      const file = await currentShareFile();
      const r = await sharePhoto(file);
      if (r === 'shared') { offerAnotherSession(); }
      else if (r === 'unsupported') {
        const waText = encodeURIComponent(shareCaption() + '\n' + shareUrl());
        launchApp('whatsapp://send?text=' + waText);
      }
    } catch (e) { /* batal — abaikan */ }
  };

  // Facebook — pilih Feed / Story / Reels
  fb.onclick = () => { primeShareFile(); openModal('fb-modal'); };
  const fbModal = $('fb-modal');
  if ($('btn-close-fb')) $('btn-close-fb').onclick = () => closeModal('fb-modal');
  if (fbModal) fbModal.onclick = (e) => { if (e.target === fbModal) closeModal('fb-modal'); };
  const shareFacebook = async (fallbackScheme) => {
    closeModal('fb-modal');
    copyShareText();
    try {
      const r = await sharePhoto(await currentShareFile());
      if (r === 'shared') { offerAnotherSession(); }
      else if (r === 'unsupported') launchApp(fallbackScheme || 'fb://');
    } catch (e) { /* batal — abaikan */ }
  };
  if ($('fb-feed')) $('fb-feed').onclick = () => shareFacebook('fb://');
  if ($('fb-story')) $('fb-story').onclick = () => shareFacebook('fb://');
  if ($('fb-reels')) $('fb-reels').onclick = () => shareFacebook('fb://');

  // TikTok — pilih Video / Foto / Story
  tt.onclick = () => { primeShareFile(); openModal('tt-modal'); };
  const ttModal = $('tt-modal');
  if ($('btn-close-tt')) $('btn-close-tt').onclick = () => closeModal('tt-modal');
  if (ttModal) ttModal.onclick = (e) => { if (e.target === ttModal) closeModal('tt-modal'); };
  const shareTiktok = async () => {
    closeModal('tt-modal');
    copyShareText('#SnappieStudio #yourlittlephotomoment');
    try {
      const r = await sharePhoto(await currentShareFile());
      if (r === 'shared') { offerAnotherSession(); }
      else if (r === 'unsupported') launchApp('snssdk1233://camera');
    } catch (e) { /* batal — abaikan */ }
  };
  if ($('tt-video')) $('tt-video').onclick = shareTiktok;
  if ($('tt-photo')) $('tt-photo').onclick = shareTiktok;
  if ($('tt-story')) $('tt-story').onclick = shareTiktok;
}

initShareButtons();

/* ============ tawaran lanjut sesi baru ============ */
function offerAnotherSession() {
  openModal('again-modal');
}
const againModal = $('again-modal');
if (againModal) againModal.onclick = (e) => { if (e.target === againModal) closeModal('again-modal'); };
if ($('btn-close-again')) $('btn-close-again').onclick = () => closeModal('again-modal');
if ($('btn-again-no')) $('btn-again-no').onclick = () => {
  closeModal('again-modal');
  startNewSession();
  show('scr-start');
};
if ($('btn-again-yes')) $('btn-again-yes').onclick = () => {
  closeModal('again-modal');
  startNewSession();
  show('scr-cam');
};

/* ============ download ============ */
$('btn-download').onclick = async () => {
  const btn = $('btn-download');
  const ico = $('download-ico');
  const label = $('download-label');
  btn.disabled = true;
  if (ico) ico.textContent = 'progress_activity';
  if (label) label.textContent = tr('rs.making');
  if (ico) ico.classList.add('spin');
  try {
    const cv = await compose(state.photos, state.layout, state.theme, state.stickers, state.showDate, state.customText, state.frame, state.captionFont, state.customFrame, captionLayout(), state.dateFont, state.captionColor, state.dateColor, state.customFrame.outlineOn, state.customDate ? currentDateText() : '');
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const a = document.createElement('a');
    const d = new Date(), p = n => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = 'snappie-studio-' + state.theme + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    offerAnotherSession();
  } catch (e) {
    alert(tr('toast.failPng'));
  }
  btn.disabled = false;
  if (ico) { ico.textContent = 'download'; ico.classList.remove('spin'); }
  if (label) label.textContent = tr('rs.download');
};

/* ============ undo / redo ============ */
const HISTORY_MAX = 30;   // batas langkah undo; juga membatasi foto lama yang tertahan di memori
let history = [];
let redoStack = [];
let lastKey = null;
let applyingHistory = false;
let historyTimer = null;

function snapshotState() {
  return {
    photos: state.photos.map(p => ({ ...p })),
    stickers: state.stickers.map(s => ({ ...s })),
    theme: state.theme, layout: state.layout, showDate: state.showDate,
    frame: state.frame, customText: state.customText, customDate: state.customDate, captionFont: state.captionFont,
    dateFont: state.dateFont, captionColor: state.captionColor, dateColor: state.dateColor,
    customFrame: { ...state.customFrame },
  };
}
function stateKey() {
  return JSON.stringify({
    p: state.photos.map(p => [p.id, p.filter, p.zoom || 1, p.ox || 0, p.oy || 0]),
    s: state.stickers,
    t: state.theme, l: state.layout, d: state.showDate, f: state.frame, c: state.customText, cd: state.customDate,
    ff: state.captionFont, df: state.dateFont, cc: state.captionColor, dc: state.dateColor,
    cf: state.customFrame,
  });
}
function updateUndoUI() {
  const cu = history.length > 1, cr = redoStack.length > 0;
  document.querySelectorAll('.undo-btn').forEach(b => { b.disabled = !cu; });
  document.querySelectorAll('.redo-btn').forEach(b => { b.disabled = !cr; });
}
function commitHistory() {
  if (applyingHistory) return;
  clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    const k = stateKey();
    if (k === lastKey) return;
    lastKey = k;
    history.push(snapshotState());
    if (history.length > HISTORY_MAX) history.shift();
    redoStack = [];
    prunePhotoUrls();
    updateUndoUI();
  }, 250);
}
function applySnapshot(s) {
  applyingHistory = true;
  state.photos = s.photos.map(p => ({ ...p }));
  state.stickers = s.stickers.map(x => ({ ...x }));
  state.theme = s.theme; state.layout = s.layout; state.showDate = s.showDate;
  state.frame = s.frame; state.customText = s.customText; state.customDate = s.customDate || ''; state.captionFont = s.captionFont || 'Matcha Iced';
  state.dateFont = s.dateFont || 'Matcha Iced';
  state.captionColor = s.captionColor || '';
  state.dateColor = s.dateColor || '';
  if (s.customFrame) state.customFrame = { ...state.customFrame, ...s.customFrame };
  setLayout(state.layout);
  syncThemePickers();
  updateCustomFrameUI();
  syncFilterPicker();
  if ($('toggle-date')) $('toggle-date').checked = state.showDate;
  if ($('toggle-frame')) $('toggle-frame').checked = state.frame;
  if ($('custom-text')) $('custom-text').value = state.customText;
  if (dateWheel) dateWheel.set(state.customDate);
  if ($('caption-font')) $('caption-font').value = state.captionFont;
  if ($('date-font')) $('date-font').value = state.dateFont;
  renderDots(); renderThumbs();
  if (currentScreen === 'scr-preview') renderPreview();
  else if (currentScreen === 'scr-result') renderResult();
  savePrefs();
  applyingHistory = false;
}
function undo() {
  if (history.length < 2) return;
  redoStack.push(history.pop());
  applySnapshot(history[history.length - 1]);
  lastKey = stateKey();
  updateUndoUI();
}
function redo() {
  if (!redoStack.length) return;
  history.push(redoStack.pop());
  applySnapshot(history[history.length - 1]);
  lastKey = stateKey();
  updateUndoUI();
}
function initHistory() {
  clearTimeout(historyTimer);
  history = [snapshotState()];
  redoStack = [];
  lastKey = stateKey();
  prunePhotoUrls();
  updateUndoUI();
}
/* Sesi baru: kosongkan foto, kembalikan bingkai ke default, dan reset riwayat undo
   (supaya Ctrl+Z tidak memunculkan foto sesi sebelumnya). */
function startNewSession() {
  resetPhotos();
  resetFrameSettings();
  initHistory();
}

/* ============ background line-art dari gambar user ============ */
async function buildLineBackground() {
  try {
    const img = new Image();
    img.src = bacUrl;
    if (img.decode) await img.decode();
    else await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.min(1, 1100 / Math.max(1, iw));
    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));

    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h);
    const src = x.getImageData(0, 0, w, h).data;

    const gray = new Float32Array(w * h);
    for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
      gray[j] = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
    }
    const blur = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let xx = 0; xx < w; xx++) {
        let s = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const x2 = xx + dx; if (x2 < 0 || x2 >= w) continue;
            s += gray[yy * w + x2]; n++;
          }
        }
        blur[y * w + xx] = s / n;
      }
    }
    const edge = new Uint8Array(w * h);
    const thr = 45;
    for (let y = 1; y < h - 1; y++) {
      for (let xx = 1; xx < w - 1; xx++) {
        const i = y * w + xx;
        const gx = -blur[i - w - 1] - 2 * blur[i - 1] - blur[i + w - 1]
          + blur[i - w + 1] + 2 * blur[i + 1] + blur[i + w + 1];
        const gy = -blur[i - w - 1] - 2 * blur[i - w] - blur[i - w + 1]
          + blur[i + w - 1] + 2 * blur[i + w] + blur[i + w + 1];
        edge[i] = Math.sqrt(gx * gx + gy * gy) > thr ? 1 : 0;
      }
    }
    const out = x.createImageData(w, h);
    const o = out.data;
    for (let y = 0; y < h; y++) {
      for (let xx = 0; xx < w; xx++) {
        const i = y * w + xx;
        let on = edge[i];
        if (!on) {
          if ((xx > 0 && edge[i - 1]) || (xx < w - 1 && edge[i + 1])
            || (y > 0 && edge[i - w]) || (y < h - 1 && edge[i + w])) on = 1;
        }
        const k = i * 4;
        o[k] = 255; o[k + 1] = 255; o[k + 2] = 255; o[k + 3] = on ? 255 : 0;
      }
    }
    x.putImageData(out, 0, 0);
    document.documentElement.style.setProperty('--bg-lines', 'url("' + c.toDataURL('image/png') + '")');
    document.body.classList.add('has-lines');
  } catch (e) { /* gagal memuat — biarkan tanpa garis */ }
}
buildLineBackground();

/* ============ header (judul + tagline) di tiap halaman selain awal ============ */
function goHome() {
  if (currentScreen !== 'scr-start') show('scr-start');
}
function addHeaders() {
  document.querySelectorAll('.screen:not(#scr-start)').forEach(scr => {
    if (scr.querySelector('.mini-header')) return;
    const h = document.createElement('button');
    h.type = 'button';
    h.className = 'mini-header';
    h.setAttribute('aria-label', tr('hdr.home'));
    h.innerHTML = '<span class="mh-title">Snappie Studio</span>' +
      '<span class="mh-tag">your little photo moment</span>';
    h.onclick = goHome;
    scr.insertBefore(h, scr.firstChild);
  });
}
addHeaders();

/* undo/redo: tombol + pintasan papan tombol */
document.querySelectorAll('.undo-btn').forEach(b => b.addEventListener('click', undo));
document.querySelectorAll('.redo-btn').forEach(b => b.addEventListener('click', redo));
document.addEventListener('keydown', (e) => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault(); redo();
  }
});

initHistory();
