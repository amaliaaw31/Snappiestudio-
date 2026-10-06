/* Photo Booth — app logic: camera, filters, countdown, capture, result, stickers. */

import { FILTERS, THEMES, CHARS, EMOJI_STICKERS, dateLine, filterCss } from './data.js';
import { compose } from './composer.js';

/* ============ state ============ */
const LAYOUT_AR = { 1: '4 / 3', 3: '3 / 4', 4: '4 / 3', 6: '1 / 1' };
const LAYOUT_ARN = { 1: 4 / 3, 3: 3 / 4, 4: 4 / 3, 6: 1 };

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
  customText: '',
  replaceIndex: null,
  facing: 'user',
  mirror: true,
  countdown: 3,
  flash: true,
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
      showDate: state.showDate, mirror: state.mirror, facing: state.facing,
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
  if (typeof p.mirror === 'boolean') state.mirror = p.mirror;
  if (p.facing === 'user' || p.facing === 'environment') state.facing = p.facing;
  if ([0, 3, 5, 10].includes(p.countdown)) state.countdown = p.countdown;
  if (typeof p.flash === 'boolean') state.flash = p.flash;
  if (typeof p.sound === 'boolean') state.sound = p.sound;
  if (p.dark) document.body.classList.add('dark-mode');
  return p;
}
loadPrefs();

let currentScreen = 'scr-start';
let historyWorks = true;

function activateScreen(id) {
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
  const id = (e.state && e.state.screen) ? e.state.screen : 'scr-start';
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
  return (FILTERS.find(f => f.id === state.filter) || {}).name || '';
}
function syncFilterPicker() {
  filterBtns.forEach(b => { if (b) b.textContent = filterName(); });
  document.querySelectorAll('#filter-grid .filter-option').forEach(x => {
    x.classList.toggle('sel', x.dataset.id === state.filter);
  });
  $('video').style.filter = filterCss(state.filter);
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
  if (!grid) return;
  grid.innerHTML = '';
  FILTERS.forEach(f => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filter-option' + (f.id === state.filter ? ' sel' : '');
    b.dataset.id = f.id;
    b.innerHTML = '<span class="filter-sample" style="filter:' + f.css + '"></span>' +
      '<span class="filter-option-name">' + f.name + '</span>';
    b.onclick = () => { chooseFilter(f.id); closeModal('filter-modal'); };
    grid.appendChild(b);
  });
  const btn = $('filters');
  if (btn) {
    filterBtns.push(btn);
    btn.onclick = () => { syncFilterPicker(); openModal('filter-modal'); };
  }
  if ($('btn-close-filter')) $('btn-close-filter').onclick = () => closeModal('filter-modal');
  filterModal.onclick = (e) => { if (e.target === filterModal) closeModal('filter-modal'); };
  syncFilterPicker();
}
buildFilterPicker();

const themeModal = $('theme-modal');
const themeBtns = [];
function themeName() {
  return (THEMES.find(t => t.id === state.theme) || {}).name || '';
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
    b.innerHTML = themeThumbHTML(t) + '<span class="theme-option-name">' + t.name + '</span>';
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
      camerr.textContent = 'Izin kamera ditolak. Izinkan akses kamera lalu coba lagi.';
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      camerr.textContent = 'Kamera tidak ditemukan atau kamera depan/belakang tidak tersedia.';
    } else if (name === 'NotReadableError' || name === 'AbortError') {
      camerr.textContent = 'Kamera sedang dipakai aplikasi lain. Tutup lalu coba lagi.';
    } else {
      camerr.textContent = 'Kamera tidak bisa dibuka. Pakai browser terbaru / koneksi HTTPS.';
    }
    camerr.style.display = 'block';
    return false;
  }
}

$('btn-start').onclick = async () => {
  if (await startCamera()) { applyMirror(); show('scr-cam'); }
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
if (mirrorToggle) {
  mirrorToggle.checked = state.mirror;
  mirrorToggle.onchange = () => { state.mirror = mirrorToggle.checked; applyMirror(); savePrefs(); };
  applyMirror();
}

function renderDots() {
  const d = $('dots'); d.innerHTML = '';
  for (let i = 0; i < state.layout; i++) {
    const s = document.createElement('span');
    s.className = 'dot' + (i < state.photos.length ? ' full' : '');
    d.appendChild(s);
  }
}
let dragThumb = null;
function initThumbDrag(el) {
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.thumb-btn')) return;
    dragThumb = el;
    el.classList.add('dragging');
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
}

function renderThumbs() {
  const t = $('thumbs'); t.innerHTML = '';
  state.photos.forEach((p, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'thumb'
      + (state.replaceIndex === i ? ' retake' : '')
      + (state.selectedPhotoIndex === i ? ' sel' : '');
    wrap.dataset.index = i;

    const img = document.createElement('img');
    img.src = p.canvas.toDataURL('image/jpeg', .82);
    img.alt = 'Foto ' + (i + 1);
    img.style.filter = filterCss(p.filter);
    img.draggable = false;
    wrap.appendChild(img);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'thumb-btn thumb-del';
    del.textContent = '✕';
    del.title = 'Hapus foto';
    del.onclick = (e) => {
      e.stopPropagation();
      state.photos.splice(i, 1);
      if (state.replaceIndex != null) {
        if (state.replaceIndex === i || state.replaceIndex >= state.photos.length) state.replaceIndex = null;
        else if (state.replaceIndex > i) state.replaceIndex--;
      }
      if (state.selectedPhotoIndex != null) {
        if (state.selectedPhotoIndex === i || state.selectedPhotoIndex >= state.photos.length) state.selectedPhotoIndex = null;
        else if (state.selectedPhotoIndex > i) state.selectedPhotoIndex--;
      }
      renderDots(); renderThumbs();
    };
    wrap.appendChild(del);

    const re = document.createElement('button');
    re.type = 'button';
    re.className = 'thumb-btn thumb-retake';
    re.textContent = '↻';
    re.title = 'Jepret ulang foto ini';
    re.onclick = (e) => {
      e.stopPropagation();
      state.replaceIndex = state.replaceIndex === i ? null : i;
      renderThumbs();
    };
    wrap.appendChild(re);

    initThumbDrag(wrap);
    t.appendChild(wrap);
  });

  const tb = $('theme-block');
  if (tb) tb.hidden = state.photos.length === 0;

  const pv = $('btn-to-preview');
  if (pv) pv.style.display = state.photos.length ? '' : 'none';
}

const thumbsBar = $('thumbs');
thumbsBar.addEventListener('pointermove', (e) => {
  if (!dragThumb) return;
  let target = null;
  for (const o of [...thumbsBar.children]) {
    if (o === dragThumb) continue;
    const r = o.getBoundingClientRect();
    if (e.clientX < r.left + r.width / 2) { target = o; break; }
  }
  if (target) thumbsBar.insertBefore(dragThumb, target);
  else thumbsBar.appendChild(dragThumb);
});
function endThumbDrag() {
  if (!dragThumb) return;
  const order = [...thumbsBar.children].map(c => +c.dataset.index);
  const changed = order.some((v, idx) => v !== idx);
  const tapped = +dragThumb.dataset.index;
  dragThumb.classList.remove('dragging');
  dragThumb = null;
  if (changed) {
    state.photos = order.map(i => state.photos[i]);
    state.replaceIndex = null;
    state.selectedPhotoIndex = null;
    renderThumbs();
  } else {
    // tap tanpa geser = pilih/batal pilih foto (untuk atur filter per-foto)
    state.selectedPhotoIndex = state.selectedPhotoIndex === tapped ? null : tapped;
    if (state.selectedPhotoIndex != null && state.photos[tapped]) {
      state.filter = state.photos[tapped].filter;
      syncFilterPicker();
    }
    renderThumbs();
  }
}
thumbsBar.addEventListener('pointerup', endThumbDrag);
thumbsBar.addEventListener('pointercancel', endThumbDrag);

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
  if (state.flash) {
    const f = $('flash');
    f.style.transition = 'none'; f.style.opacity = '.85';
    requestAnimationFrame(() => { f.style.transition = 'opacity .4s'; f.style.opacity = '0'; });
  }
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
  const photo = { canvas: c, filter: state.filter };         // filter disimpan per foto
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
  const make = async (f) => ({ canvas: await fileToCanvas(f), filter: state.filter });
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
if (fileInput) {
  fileInput.onchange = async () => {
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
function frameHTML() {
  const lay = state.layout === 1 ? 'single' : state.layout === 3 ? 'strip' : 'grid' + state.layout;
  const cls = state.layout === 1 ? 'photos-single' : state.layout === 3 ? 'photos-strip' : 'photos-grid';
  let slots = '';
  state.photos.forEach((p, i) => {
    slots += '<div class="slot"><img alt="Foto ' + (i + 1) + '" style="filter:' + filterCss(p.filter)
      + '" src="' + p.canvas.toDataURL('image/jpeg', .85) + '"></div>';
  });
  const customHTML = state.customText ? '<div class="frame-date">' + esc(state.customText) + '</div>' : '';
  const dateHTML = state.showDate ? '<div class="frame-date">' + dateLine() + '</div>' : '';
  const captionsHTML = (customHTML || dateHTML)
    ? '<div class="frame-captions">' + customHTML + dateHTML + '</div>' : '';
  return '<div class="frame-outer th-' + state.theme + ' ' + lay + '">' +
    '<div class="frame"><div class="' + cls + '">' + slots + '</div>' +
    captionsHTML + '</div>' +
    '<div class="sticker-layer"></div></div>';
}

function renderResult() {
  $('result-holder').innerHTML = frameHTML();
  syncThemePickers();
  renderUserStickers();
}

function previewHTML() {
  const lay = state.layout === 1 ? 'single' : state.layout === 3 ? 'strip' : 'grid' + state.layout;
  const cls = state.layout === 1 ? 'photos-single' : state.layout === 3 ? 'photos-strip' : 'photos-grid';
  let slots = '';
  state.photos.forEach((p, i) => {
    slots += '<div class="slot preview-slot">' +
      '<img alt="Foto ' + (i + 1) + '" style="filter:' + filterCss(p.filter)
        + '" src="' + p.canvas.toDataURL('image/jpeg', .85) + '">' +
      '<div class="slot-actions">' +
        '<button type="button" class="slot-btn" data-act="del" data-i="' + i + '" aria-label="Buang foto" title="Buang">🗑</button>' +
        '<button type="button" class="slot-btn" data-act="retake" data-i="' + i + '" aria-label="Jepret ulang" title="Jepret ulang">↻</button>' +
        '<button type="button" class="slot-btn" data-act="gallery" data-i="' + i + '" aria-label="Ganti dari galeri" title="Ganti dari galeri">🖼</button>' +
      '</div></div>';
  });
  const customHTML = state.customText ? '<div class="frame-date">' + esc(state.customText) + '</div>' : '';
  const dateHTML = state.showDate ? '<div class="frame-date">' + dateLine() + '</div>' : '';
  const captionsHTML = (customHTML || dateHTML)
    ? '<div class="frame-captions">' + customHTML + dateHTML + '</div>' : '';
  return '<div class="frame-outer th-' + state.theme + ' ' + lay + '">' +
    '<div class="frame"><div class="' + cls + '">' + slots + '</div>' +
    captionsHTML + '</div>' +
    '<div class="sticker-layer"></div></div>';
}

function renderPreview() {
  const holder = $('preview-holder');
  if (!holder) return;
  holder.innerHTML = previewHTML();
  renderUserStickers();
}

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

const customInput = $('custom-text');
if (customInput) {
  customInput.value = state.customText;
  customInput.oninput = () => {
    state.customText = customInput.value.trim();
    if (currentScreen === 'scr-result') renderResult();
  };
}

const darkToggle = $('toggle-dark');
if (darkToggle) {
  darkToggle.checked = document.body.classList.contains('dark-mode');
  darkToggle.onchange = () => {
    document.body.classList.toggle('dark-mode', darkToggle.checked);
    savePrefs();
  };
}

/* ============ capture settings ============ */
const countdownSel = $('set-countdown');
if (countdownSel) {
  countdownSel.value = String(state.countdown);
  countdownSel.onchange = () => { state.countdown = +countdownSel.value; savePrefs(); };
}
const flashToggle = $('toggle-flash');
if (flashToggle) {
  flashToggle.checked = state.flash;
  flashToggle.onchange = () => { state.flash = flashToggle.checked; savePrefs(); };
}
const soundToggle = $('toggle-sound');
if (soundToggle) {
  soundToggle.checked = state.sound;
  soundToggle.onchange = () => { state.sound = soundToggle.checked; savePrefs(); };
}

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
      innerContent = `<div class="text-inner">${esc(st.value)}</div>`;
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
}

/* Finger gestures: 1 jari = pindah, 2 jari = zoom + putar, tahan 700ms = hapus.
   Desktop: scroll = zoom, Shift+scroll = putar. Tombol kontrol tidak dipakai. */
function attachStickerGestures(el, st, frameOuter) {
  const pts = new Map();          // pointerId aktif -> posisi
  let pinch = null;               // data awal pinch
  let dragStart = null;           // data awal drag
  let longPress = null;           // timer hapus
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

  const startPinch = () => {
    if (longPress) { clearTimeout(longPress); longPress = null; }
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
      if (longPress && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) { clearTimeout(longPress); longPress = null; }
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
    if (longPress) { clearTimeout(longPress); longPress = null; }
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
    if (longPress) { clearTimeout(longPress); longPress = null; }
    el.classList.remove('is-dragging');
    updateStickerTransform(el, st);
    window.removeEventListener('pointerdown', onExtraDown, true);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);
  };

  el.addEventListener('pointerdown', (e) => {
    if (active) return;
    e.stopPropagation();
    active = true;
    select();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    el.classList.add('is-dragging');
    dragStart = { px: e.clientX, py: e.clientY, x: st.x, y: st.y, rect: rectOf() };
    longPress = setTimeout(() => { longPress = null; if (removeSticker()) endGesture(); }, 700);
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
  state.stickers.push({
    id, type: 'text', value,
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

/* Editor teks inline (menggantikan prompt/confirm) */
let editingTextId = null;
function openTextEditor(st) {
  editingTextId = st.id;
  const input = $('text-edit-input');
  if (input) input.value = st.value;
  openModal('text-edit-modal');
  if (input) setTimeout(() => input.focus(), 60);
}
function commitTextEdit() {
  const input = $('text-edit-input');
  const st = state.stickers.find(s => s.id === editingTextId);
  if (st && input && input.value.trim()) st.value = input.value.trim();
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
  const cv = await compose(state.photos, state.layout, state.theme, state.stickers, state.showDate, state.customText);
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

function showToast(msg) {
  const toast = $('share-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

/* Buka aplikasi sosmed yang terpasang di perangkat lewat skema URL.
   Kalau ada 2 varian (mis. WhatsApp & WhatsApp Business), sistem Android yang menanya. */
function launchApp(scheme, copyText) {
  if (copyText) navigator.clipboard.writeText(copyText).catch(() => {});
  closeModal('share-modal');
  offerAnotherSession();
  window.location.href = scheme;
}

function initShareModal() {
  const modal = $('share-modal');
  const btnOpen = $('btn-open-share');
  const btnClose = $('btn-close-share');

  if (!btnOpen || !modal) return;

  btnOpen.onclick = () => {
    openModal('share-modal');
  };

  btnClose.onclick = () => {
    closeModal('share-modal');
  };

  modal.onclick = (e) => {
    if (e.target === modal) closeModal('share-modal');
  };

  const captionText = 'Jepretan foto di Snappie Studio — your little photo moment 📸✨';

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

  // General Web Share API
  $('share-native').onclick = async () => {
    try {
      const file = await getWatermarkedFile();
      const r = await sharePhoto(file);
      if (r === 'shared') { closeModal('share-modal'); offerAnotherSession(); }
      else if (r === 'unsupported') {
        downloadFile(file);
        closeModal('share-modal');
        offerAnotherSession();
      }
    } catch (e) {
      /* User cancelled share */
    }
  };

  // Instagram Share
  $('share-ig').onclick = async () => {
    try {
      downloadFile(await getWatermarkedFile());
      launchApp('instagram://app', captionText);
    } catch (e) {}
  };

  // WhatsApp Share — lewat share sheet agar foto ikut
  $('share-wa').onclick = async () => {
    try {
      const file = await getWatermarkedFile();
      const r = await sharePhoto(file);
      if (r === 'shared') { closeModal('share-modal'); offerAnotherSession(); }
      else if (r === 'unsupported') {
        downloadFile(file);
        const waText = encodeURIComponent(captionText + '\n' + window.location.href);
        launchApp('whatsapp://send?text=' + waText);
      }
    } catch (e) {}
  };

  // Facebook Share
  $('share-fb').onclick = async () => {
    try {
      downloadFile(await getWatermarkedFile());
      launchApp('fb://');
    } catch (e) {}
  };

  // TikTok Share
  $('share-tt').onclick = async () => {
    try {
      downloadFile(await getWatermarkedFile());
      launchApp('snssdk1233://camera', captionText + ' #SnappieStudio #yourlittlephotomoment');
    } catch (e) {}
  };

  // Copy Link & Caption
  $('share-copy-link').onclick = async () => {
    const textToCopy = 'Snappie Studio — your little photo moment 📸✨\nBikin foto strip lucu kamu di: ' + window.location.href;
    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast('Tautan & caption Snappie Studio berhasil disalin! 🔗');
      closeModal('share-modal');
      offerAnotherSession();
    } catch (e) {
      showToast('Gagal menyalin tautan.');
    }
  };
}

initShareModal();

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
  btn.disabled = true; btn.textContent = '⏳ Bikin PNG...';
  try {
    const cv = await compose(state.photos, state.layout, state.theme, state.stickers, state.showDate, state.customText);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const a = document.createElement('a');
    const d = new Date(), p = n => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = 'snappie-studio-' + state.theme + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    offerAnotherSession();
  } catch (e) {
    alert('Gagal bikin PNG. Coba lagi ya.');
  }
  btn.disabled = false; btn.textContent = '⬇ Unduh PNG';
};
