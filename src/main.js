/* Photo Booth — app logic: camera, filters, countdown, capture, result, stickers. */

import { FILTERS, THEMES, CHARS, EMOJI_STICKERS, dateLine, filterCss } from './data.js';
import { compose } from './composer.js';
import { LANGS, getLang, setLang, t as tr, applyI18n } from './i18n.js';
import bacUrl from './assets/bac.jpg';

/* ============ state ============ */
const LAYOUT_AR = { 1: '4 / 3', 3: '4 / 3', 4: '4 / 3', 6: '4 / 3' };
const LAYOUT_ARN = { 1: 4 / 3, 3: 4 / 3, 4: 4 / 3, 6: 4 / 3 };

const state = {
  stream: null,
  filter: 'normal',
  layout: 3,
  theme: 'pastel',
  photos: [],            // { canvas, filter }
  busy: false,
  stickers: [],
  selectedStickerId: null,
  selectedPhotoIndex: null,
  showDate: false,
  frame: true,
  customText: '',
  captionFont: 'Matcha Iced',
  replaceIndex: null,
  facing: 'user',
  mirror: true,
  countdown: 3,
  flash: 'on',
  sound: true
};
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ============ preferences (localStorage) ============ */
const PREFS_KEY = 'snappie-prefs-v1';
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      filter: state.filter, layout: state.layout, theme: state.theme,
      showDate: state.showDate, frame: state.frame,
      captionFont: state.captionFont, mirror: state.mirror, facing: state.facing,
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
  if (THEMES.some(t => t.id === p.theme)) state.theme = p.theme;
  if (typeof p.showDate === 'boolean') state.showDate = p.showDate;
  if (typeof p.frame === 'boolean') state.frame = p.frame;
  if (typeof p.captionFont === 'string') state.captionFont = p.captionFont;
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
  if (id === 'scr-start' && state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
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
      if (currentScreen === 'scr-result') renderResult();
      else if (currentScreen === 'scr-preview') renderPreview();
      savePrefs();
    };
    grid.appendChild(b);
  });
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
  state.replaceIndex = null;
  renderDots(); renderThumbs();
}

/* ============ camera ============ */
function applyMirror() {
  const v = $('video');
  if (v) v.style.transform = state.mirror ? 'scaleX(-1)' : 'none';
}

function doFlash() {
  const f = $('flash');
  if (!f) return;
  f.style.transition = 'none'; f.style.opacity = '.85';
  requestAnimationFrame(() => { f.style.transition = 'opacity .4s'; f.style.opacity = '0'; });
}
function ambientIsDark() {
  const v = $('video');
  if (!v || !v.videoWidth) return false;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 24;
  const x = c.getContext('2d');
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

async function startCamera() {
  if (state.stream) state.stream.getTracks().forEach(t => t.stop());
  const camerr = $('camerr');
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facing, width: { ideal: 1280 } }, audio: false,
    });
    $('video').srcObject = state.stream;
    camerr.style.display = 'none';
    return true;
  } catch (e) {
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
    resetPhotos();                 // sesi baru: pastikan tidak ada foto user sebelumnya
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* abaikan */ }
    applyMirror();
    show('scr-cam');
  }
};

const switchCamBtn = $('btn-switch-cam');
if (switchCamBtn) {
  switchCamBtn.onclick = async () => {
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
  scheduleDraft(); commitHistory();
}

renderDots();

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = .12;
    o.start(); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .18);
    o.stop(ctx.currentTime + .2);
  } catch (e) { /* audio not available — skip */ }
}

$('shutter').onclick = async () => {
  if (state.busy || !state.stream) return;
  if (state.photos.length >= state.layout && state.replaceIndex == null) return;
  const replacing = state.replaceIndex != null;
  state.busy = true; $('shutter').disabled = true;
  const cd = $('countdown');
  if (state.countdown > 0) {
    cd.style.display = 'flex';
    for (let n = state.countdown; n >= 1; n--) {
      cd.textContent = String(n);
      if (state.sound) beep();
      await sleep(1000);
    }
    cd.style.display = 'none';
  }
  capture();
  if (shouldScreenFlash()) doFlash();
  if (state.sound) beep();
  state.busy = false; $('shutter').disabled = false;
  if (replacing || state.photos.length >= state.layout) { await sleep(400); goPreview(); }
};

function capture() {
  const v = $('video');
  const vw = v.videoWidth || 1280, vh = v.videoHeight || 960;
  const ar = LAYOUT_ARN[state.layout] || (4 / 3);
  let cw = vw, ch = Math.round(vw / ar);
  if (ch > vh) { ch = vh; cw = Math.round(vh * ar); }   // crop to preview aspect
  const sx = (vw - cw) / 2, sy = (vh - ch) / 2;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const x = c.getContext('2d');
  if (state.mirror) { x.translate(cw, 0); x.scale(-1, 1); }   // mirror like preview
  x.drawImage(v, sx, sy, cw, ch, 0, 0, cw, ch);
  const photo = { id: Date.now() + Math.random(), canvas: c, filter: state.filter, zoom: 1, ox: 0, oy: 0 };   // filter + crop per foto
  if (state.replaceIndex != null && state.replaceIndex < state.photos.length) {
    state.photos[state.replaceIndex] = photo;                // re-jepret slot ini
    state.replaceIndex = null;
  } else {
    state.photos.push(photo);
  }
  renderDots(); renderThumbs();
}

/* ============ gallery import ============ */
async function fileToCanvas(file) {
  let src = null, objectUrl = null;
  if (window.createImageBitmap) {
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { src = null; }
  }
  if (!src) {
    objectUrl = URL.createObjectURL(file);
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
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  return c;
}

async function handleFiles(files) {
  const list = Array.from(files || []).filter(f => f.type.startsWith('image/'));
  let added = 0;
  const make = async (f) => ({ id: Date.now() + Math.random(), canvas: await fileToCanvas(f), filter: state.filter, zoom: 1, ox: 0, oy: 0 });
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
      const files = Array.from(fileInput.files || []).filter(f => f.type.startsWith('image/'));
      if (files.length) {
        setLayout(layoutForCount(files.length));
        resetPhotos();
        savePrefs();
      }
    }
    const added = await handleFiles(fileInput.files);
    fileInput.value = '';
    if (!added) return;
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

function slotMedia(p, i, gesture) {
  const style = 'filter:' + filterCss(p.filter) + ';transform:' + imgTransform(p);
  return '<img' + (gesture ? ' class="slot-img" data-i="' + i + '"' : '') + ' alt="Foto ' + (i + 1) +
    '" style="' + style + '" src="' + p.canvas.toDataURL('image/jpeg', .85) + '">';
}

function captionFontStyle() {
  return "font-family:'" + (state.captionFont || 'Matcha Iced') + "', 'Trebuchet MS', sans-serif";
}

function frameHTML() {
  const lay = state.layout === 1 ? 'single' : state.layout === 3 ? 'strip' : 'grid' + state.layout;
  const cls = state.layout === 1 ? 'photos-single' : state.layout === 3 ? 'photos-strip' : 'photos-grid';
  let slots = '';
  state.photos.forEach((p, i) => {
    slots += '<div class="slot">' + slotMedia(p, i, false) + '</div>';
  });
  const fs = captionFontStyle();
  const customHTML = state.customText ? '<div class="frame-date" style="' + fs + '">' + esc(state.customText) + '</div>' : '';
  const dateHTML = state.showDate ? '<div class="frame-date" style="' + fs + '">' + dateLine(getLang()) + '</div>' : '';
  const captionsHTML = '<div class="frame-captions">' + customHTML + dateHTML + '</div>';
  const th = state.frame ? 'th-' + state.theme : 'noframe';
  return '<div class="frame-outer ' + th + ' ' + lay + '">' +
    '<div class="frame"><div class="' + cls + '">' + slots + '</div>' +
    (state.frame ? captionsHTML : '') + '</div>' +
    '<div class="sticker-layer"></div></div>';
}

/* Ukuran kotak preview disamakan dengan bingkai 1 foto. */
let boxAspect = 300 / 278;
function measureBoxAspect() {
  const probe = document.createElement('div');
  probe.className = 'frame-outer single';
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;';
  probe.innerHTML = '<div class="frame"><div class="photos-single"><div class="slot"></div></div><div class="frame-captions"></div></div>';
  document.body.appendChild(probe);
  const w = probe.offsetWidth, h = probe.offsetHeight;
  probe.remove();
  if (w > 0 && h > 0) boxAspect = w / h;
}
measureBoxAspect();

function fitFrame(holderId) {
  const holder = $(holderId);
  if (!holder) return;
  const frame = holder.querySelector('.frame-outer');
  if (!frame) return;
  frame.style.transform = 'none';
  const fw = frame.offsetWidth, fh = frame.offsetHeight;
  const aw = holder.clientWidth, ah = holder.clientHeight;
  if (!fw || !fh || aw < 20 || ah < 20) return;
  let tw = aw, th = aw / boxAspect;
  if (th > ah) { th = ah; tw = ah * boxAspect; }
  const s = Math.max(0.05, Math.min((tw - 8) / fw, (th - 8) / fh));
  frame.style.transform = 'scale(' + s.toFixed(4) + ')';
}

function renderResult() {
  $('result-holder').innerHTML = frameHTML();
  syncThemePickers();
  renderUserStickers();
  fitFrame('result-holder');
  scheduleDraft(); commitHistory();
}

function previewHTML() {
  const lay = state.layout === 1 ? 'single' : state.layout === 3 ? 'strip' : 'grid' + state.layout;
  const cls = state.layout === 1 ? 'photos-single' : state.layout === 3 ? 'photos-strip' : 'photos-grid';
  let slots = '';
  state.photos.forEach((p, i) => {
    slots += '<div class="slot preview-slot">' +
      slotMedia(p, i, true) +
      '<div class="slot-actions">' +
        '<button type="button" class="slot-btn" data-act="del" data-i="' + i + '" aria-label="Buang foto" title="Buang"><span class="ms">delete</span></button>' +
        '<button type="button" class="slot-btn" data-act="retake" data-i="' + i + '" aria-label="Jepret ulang" title="Jepret ulang"><span class="ms">refresh</span></button>' +
      '</div></div>';
  });
  const fs = captionFontStyle();
  const customHTML = state.customText ? '<div class="frame-date" style="' + fs + '">' + esc(state.customText) + '</div>' : '';
  const dateHTML = state.showDate ? '<div class="frame-date" style="' + fs + '">' + dateLine(getLang()) + '</div>' : '';
  const captionsHTML = '<div class="frame-captions">' + customHTML + dateHTML + '</div>';
  const th = state.frame ? 'th-' + state.theme : 'noframe';
  return '<div class="frame-outer ' + th + ' ' + lay + '">' +
    '<div class="frame"><div class="' + cls + '">' + slots + '</div>' +
    (state.frame ? captionsHTML : '') + '</div>' +
    '<div class="sticker-layer"></div></div>';
}

/* Zoom/geser isi foto per slot (di layar Preview). */
function attachSlotGestures(img, p) {
  const pts = new Map();
  let start = null, pinch = null;
  const clampPan = () => {
    const lim = Math.max(0, ((p.zoom || 1) - 1) / 2);
    p.ox = Math.max(-lim, Math.min(lim, p.ox || 0));
    p.oy = Math.max(-lim, Math.min(lim, p.oy || 0));
  };
  const apply = () => { img.style.transform = imgTransform(p); };

  img.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.slot-btn')) return;
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
    const r = img.getBoundingClientRect();
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      p.zoom = Math.max(1, Math.min(4, pinch.zoom * (d / pinch.dist)));
      clampPan(); apply();
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
      img.classList.remove('slot-dragging');
      scheduleDraft(); commitHistory();
    }
  };
  img.addEventListener('pointerup', up);
  img.addEventListener('pointercancel', up);

  img.addEventListener('wheel', (e) => {
    e.preventDefault();
    p.zoom = Math.max(1, Math.min(4, (p.zoom || 1) * (e.deltaY < 0 ? 1.08 : 0.92)));
    clampPan(); apply();
  }, { passive: false });
}

function renderPreview() {
  const holder = $('preview-holder');
  if (!holder) return;
  holder.innerHTML = previewHTML();
  holder.querySelectorAll('.slot-img').forEach(img => {
    const p = state.photos[+img.dataset.i];
    if (p) attachSlotGestures(img, p);
  });
  renderUserStickers();
  fitFrame('preview-holder');
  scheduleDraft(); commitHistory();
}

function refitFrames() {
  if (currentScreen === 'scr-preview') fitFrame('preview-holder');
  else if (currentScreen === 'scr-result') fitFrame('result-holder');
}
window.addEventListener('resize', () => { measureBoxAspect(); refitFrames(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureBoxAspect(); refitFrames(); });

function onPreviewAction(act, i) {
  if (act === 'del') {
    state.photos.splice(i, 1);
    state.selectedPhotoIndex = null;
    renderThumbs();
    if (!state.photos.length) { show('scr-cam'); return; }
    renderPreview();
  } else if (act === 'retake') {
    state.replaceIndex = i;
    show('scr-cam');
  } else if (act === 'gallery') {
    state.replaceIndex = i;
    openGallery('preview');
  }
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
    if (currentScreen === 'scr-result') renderResult();
    savePrefs();
  };
}

const frameToggle = $('toggle-frame');
if (frameToggle) {
  frameToggle.checked = state.frame;
  frameToggle.onchange = () => {
    state.frame = frameToggle.checked;
    if (currentScreen === 'scr-preview') renderPreview();
    else if (currentScreen === 'scr-result') renderResult();
    savePrefs();
  };
}

const customInput = $('custom-text');
if (customInput) {
  customInput.value = state.customText;
  customInput.oninput = () => {
    state.customText = customInput.value.trim();
    if (currentScreen === 'scr-result') renderResult();
  };
}

const captionFontSel = $('caption-font');
if (captionFontSel) {
  captionFontSel.value = state.captionFont || 'Matcha Iced';
  captionFontSel.onchange = () => {
    state.captionFont = captionFontSel.value;
    if (currentScreen === 'scr-result') renderResult();
    savePrefs();
  };
}

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

/* tombol suara: tap untuk aktif/nonaktif, simbol dicoret saat mati */
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
        '" style="font-family:\'' + fam + '\', Quicksand, sans-serif;color:' + col + '">' +
        esc(st.value) + '</div>';
    } else {
      innerContent = `<div class="sticker-inner">${st.value}</div>`;
    }

    el.innerHTML = innerContent;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    const label = st.type === 'text' ? ('Teks: ' + st.value)
      : st.type === 'char' ? 'Stiker karakter' : ('Stiker ' + st.value);
    el.setAttribute('aria-label', label + '. Panah: pindah, +/-: ukuran, [ ]: putar, Delete: hapus.');
    el.addEventListener('focus', () => {
      state.selectedStickerId = st.id;
      layer.querySelectorAll('.user-sticker').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
      el.style.zIndex = 99;
    });
    attachStickerGestures(el, st, frameOuter);

    layer.appendChild(el);
  });
  scheduleDraft(); commitHistory();
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
  delBtn.title = 'Hapus';
  delBtn.setAttribute('aria-label', 'Hapus stiker');
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
    scheduleDraft(); commitHistory();
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
    const item = document.createElement('div');
    item.className = 'sticker-item';
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
const COLOR_PALETTE = [
  '#23233a', '#000000', '#555555', '#9a9a9a', '#ffffff', '#f8e9d2',
  '#d63384', '#e1306c', '#e0487b', '#ff8fab', '#ff6b9d', '#c2557e',
  '#ff007f', '#c46998', '#9c27b0', '#7b68ee', '#b8c6db', '#d5a8ff',
  '#ff8c1a', '#f5a623', '#ffd166', '#f0d98a', '#8a6a3c', '#9a7b4f',
  '#0f6b3a', '#25d366', '#6fbf5f', '#a8e6cf', '#0a6bb0', '#1877f2',
  '#4facfe', '#00f0ff', '#e6c766', '#ffb3c7', '#bfe3ff', '#111111',
];
let colorTargetId = 'sticker-color';

function colorOf(id) {
  const el = $(id);
  return (el && el.dataset.color) || '#23233a';
}
function setColor(id, color) {
  const el = $(id);
  if (!el) return;
  el.dataset.color = color;
  el.style.background = color;
}
function buildColorPicker() {
  const modal = $('color-modal');
  const grid = $('color-grid');
  if (!modal || !grid) return;
  grid.innerHTML = '';
  COLOR_PALETTE.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'color-swatch';
    b.style.background = c;
    b.dataset.color = c;
    b.setAttribute('aria-label', c);
    b.onclick = () => {
      setColor(colorTargetId, c);
      grid.querySelectorAll('.color-swatch').forEach(x => x.classList.toggle('sel', x.dataset.color === c));
      closeModal('color-modal');
    };
    grid.appendChild(b);
  });
  if ($('btn-close-color')) $('btn-close-color').onclick = () => closeModal('color-modal');
  modal.onclick = (e) => { if (e.target === modal) closeModal('color-modal'); };
}
buildColorPicker();

function openColorPicker(targetId) {
  colorTargetId = targetId;
  const cur = colorOf(targetId);
  const grid = $('color-grid');
  if (grid) grid.querySelectorAll('.color-swatch').forEach(x => x.classList.toggle('sel', x.dataset.color === cur));
  openModal('color-modal');
}
['sticker-color', 'edit-color'].forEach(id => {
  const el = $(id);
  if (el) el.onclick = () => openColorPicker(id);
});

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
  const cv = await compose(state.photos, state.layout, state.theme, state.stickers, state.showDate, state.customText, state.frame, state.captionFont);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const fileName = 'snappie-studio-' + state.theme + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.png';
  return new File([blob], fileName, { type: 'image/png' });
}

function downloadFile(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* Buka aplikasi sosmed yang terpasang di perangkat lewat skema URL.
   Kalau ada 2 varian (mis. WhatsApp & WhatsApp Business), sistem Android yang menanya. */
function launchApp(scheme, copyText) {
  if (copyText) navigator.clipboard.writeText(copyText).catch(() => {});
  offerAnotherSession();
  window.location.href = scheme;
}

/* Ikon sosmed di layar hasil langsung membagikan foto ke platform terkait. */
function initShareButtons() {
  const ig = $('share-ig'), wa = $('share-wa'), fb = $('share-fb'), tt = $('share-tt');
  if (!ig || !wa || !fb || !tt) return;

  const captionText = tr('share.caption');

  /* Coba kirim foto langsung lewat Web Share; kalau tidak didukung, baru unduh.
     Return: 'shared' | 'cancelled' | 'unsupported'. */
  const sharePhoto = async (file) => {
    if (!navigator.share) return 'unsupported';
    try {
      await navigator.share({ title: 'Snappie Studio', text: captionText, files: [file] });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      return 'unsupported';
    }
  };

  // Instagram — pilih Feed atau Story
  ig.onclick = () => openModal('ig-modal');

  const igModal = $('ig-modal');
  if ($('btn-close-ig')) $('btn-close-ig').onclick = () => closeModal('ig-modal');
  if (igModal) igModal.onclick = (e) => { if (e.target === igModal) closeModal('ig-modal'); };

  if ($('ig-feed')) $('ig-feed').onclick = async () => {
    closeModal('ig-modal');
    try {
      downloadFile(await getWatermarkedFile());
      launchApp('instagram://app', captionText);
    } catch (e) { /* batal — abaikan */ }
  };

  if ($('ig-story')) $('ig-story').onclick = async () => {
    closeModal('ig-modal');
    try {
      downloadFile(await getWatermarkedFile());
      launchApp('instagram://story-camera', captionText);
    } catch (e) { /* batal — abaikan */ }
  };

  // WhatsApp — lewat share sheet agar foto ikut
  wa.onclick = async () => {
    try {
      const file = await getWatermarkedFile();
      const r = await sharePhoto(file);
      if (r === 'shared') { offerAnotherSession(); }
      else if (r === 'unsupported') {
        downloadFile(file);
        const waText = encodeURIComponent(captionText + '\n' + window.location.href);
        launchApp('whatsapp://send?text=' + waText);
      }
    } catch (e) { /* batal — abaikan */ }
  };

  // Facebook
  fb.onclick = async () => {
    try {
      downloadFile(await getWatermarkedFile());
      launchApp('fb://');
    } catch (e) { /* batal — abaikan */ }
  };

  // TikTok
  tt.onclick = async () => {
    try {
      downloadFile(await getWatermarkedFile());
      launchApp('snssdk1233://camera', captionText + ' #SnappieStudio #yourlittlephotomoment');
    } catch (e) { /* batal — abaikan */ }
  };
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
  resetPhotos();
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* abaikan */ }
  show('scr-start');
};
if ($('btn-again-yes')) $('btn-again-yes').onclick = () => {
  closeModal('again-modal');
  resetPhotos();
  show('scr-cam');
};

/* ============ download ============ */
$('btn-download').onclick = async () => {
  const btn = $('btn-download');
  const ico = $('download-ico');
  const label = $('download-label');
  btn.disabled = true;
  if (ico) ico.textContent = 'progress_activity';
  if (label) label.textContent = 'Bikin PNG...';
  if (ico) ico.classList.add('spin');
  try {
    const cv = await compose(state.photos, state.layout, state.theme, state.stickers, state.showDate, state.customText, state.frame, state.captionFont);
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
    frame: state.frame, customText: state.customText, captionFont: state.captionFont,
  };
}
function stateKey() {
  return JSON.stringify({
    p: state.photos.map(p => [p.id, p.filter, p.zoom || 1, p.ox || 0, p.oy || 0]),
    s: state.stickers,
    t: state.theme, l: state.layout, d: state.showDate, f: state.frame, c: state.customText,
    ff: state.captionFont,
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
    if (history.length > 60) history.shift();
    redoStack = [];
    updateUndoUI();
  }, 250);
}
function applySnapshot(s) {
  applyingHistory = true;
  state.photos = s.photos.map(p => ({ ...p }));
  state.stickers = s.stickers.map(x => ({ ...x }));
  state.theme = s.theme; state.layout = s.layout; state.showDate = s.showDate;
  state.frame = s.frame; state.customText = s.customText; state.captionFont = s.captionFont || 'Matcha Iced';
  setLayout(state.layout);
  syncThemePickers();
  syncFilterPicker();
  if ($('toggle-date')) $('toggle-date').checked = state.showDate;
  if ($('toggle-frame')) $('toggle-frame').checked = state.frame;
  if ($('custom-text')) $('custom-text').value = state.customText;
  if ($('caption-font')) $('caption-font').value = state.captionFont;
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
  history = [snapshotState()];
  redoStack = [];
  lastKey = stateKey();
  updateUndoUI();
}

/* ============ draft otomatis (biar tidak hilang saat refresh) ============ */
const DRAFT_KEY = 'snappie-draft-v1';
let draftTimer = null;
function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 600);
}
function saveDraft() {
  if (!state.photos.length) { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* abaikan */ } return; }
  try {
    const maxW = 720;
    const photos = state.photos.map(ph => {
      const c = ph.canvas;
      let src;
      if (c.width > maxW) {
        const s = maxW / c.width;
        const t = document.createElement('canvas');
        t.width = maxW; t.height = Math.max(1, Math.round(c.height * s));
        t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
        src = t.toDataURL('image/jpeg', .8);
      } else {
        src = c.toDataURL('image/jpeg', .8);
      }
      return { src, filter: ph.filter, zoom: ph.zoom || 1, ox: ph.ox || 0, oy: ph.oy || 0 };
    });
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      v: 1, layout: state.layout, theme: state.theme, showDate: state.showDate,
      frame: state.frame, customText: state.customText, captionFont: state.captionFont,
      stickers: state.stickers, photos,
    }));
  } catch (e) { /* penyimpanan penuh — abaikan */ }
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
    h.setAttribute('aria-label', 'Snappie Studio — ke tampilan awal');
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

/* Privasi: jangan pulihkan foto sesi sebelumnya saat halaman dibuka.
   Setiap kunjungan selalu mulai bersih agar user berikutnya tidak
   melihat foto user sebelumnya. */
try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* abaikan */ }
initHistory();
