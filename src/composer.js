/* Photo Booth — PNG download composer.
   Redraws the framed photo strip on a <canvas> so the downloaded file
   matches the on-screen HTML preview. */

import { CHARS, CHAR_SVG, filterCss, dateLine, fontTracking, DATE_COLORS } from './data.js';
import { getLang } from './i18n.js';

/* Dicache sebagai Promise: pemanggil paralel ikut menunggu decode yang sama
   (bukan dapat objek kosong). Kalau gagal, cache dibuang agar bisa dicoba lagi. */
let charImgsPromise = null;

export function loadCharImgs() {
  if (!charImgsPromise) {
    charImgsPromise = Promise.all(CHARS.map(async k => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' + CHAR_SVG[k] + '</svg>';
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await img.decode();
      return [k, img];
    })).then(entries => Object.fromEntries(entries))
      .catch(err => { charImgsPromise = null; throw err; });
  }
  return charImgsPromise;
}

function rr(x, X, Y, W, H) {
  // sudut lancip: semua bingkai kotak (radius diabaikan)
  x.beginPath();
  x.rect(X, Y, W, H);
  x.closePath();
}

function coverDraw(x, img, X, Y, W, H, zoom = 1, ox = 0, oy = 0) {
  const ir = img.width / img.height, r = W / H;
  let sw, sh, sx, sy;
  if (ir > r) { sh = img.height; sw = sh * r; sx = (img.width - sw) / 2; sy = 0; }
  else { sw = img.width; sh = sw / r; sx = 0; sy = (img.height - sh) / 2; }
  const z = Math.max(1, zoom || 1);
  const cw = sw / z, ch = sh / z;
  const cx = sx + sw / 2 - (ox || 0) * sw / z;
  const cy = sy + sh / 2 - (oy || 0) * sh / z;
  let dx = cx - cw / 2, dy = cy - ch / 2;
  dx = Math.max(sx, Math.min(sx + sw - cw, dx));
  dy = Math.max(sy, Math.min(sy + sh - ch, dy));
  x.drawImage(img, dx, dy, cw, ch, X, Y, W, H);
}

/** Compose the final framed strip. Returns a <canvas>. */
export async function compose(photos, layout, theme, stickers = [], showDate = false, customText = '', showFrame = true, captionFont = 'Matcha Iced', customFrame = null, captionFit = null, dateFont = 'Matcha Iced', captionColor = '', dateColor = '', frameOutline = true, customDate = '') {
  const charImgs = await loadCharImgs();
  if (document.fonts && document.fonts.load) {
    const families = [
      'Matcha Iced', 'The Magic Cookie', 'Orange Lovely', 'Quicksand', 'Fredoka',
      'Always Classy', 'Melon Tea', 'Smart Water', 'Stay With Me', 'Streat Coffee',
      'Super Waffles', 'Anak Bijak', 'Scripty', 'Carefour', 'JW Script',
      'MiloScript', 'Love Script', 'Script Soft', 'Happiness Machine',
      'Happiness Machine Script', 'Monobit', 'Nuka Mono', 'Solid Mono',
      'Always Monoline', 'Always Smiling', 'Smiling',
    ];
    await Promise.all(families.flatMap(f => [
      document.fonts.load('34px "' + f + '"'),
      document.fonts.load('700 34px "' + f + '"'),
    ])).catch(() => {});
  }
  /* Geometri disamakan dengan preview HTML (.frame-outer / .frame / .slot).
     Semua ukuran preview (px) dikalikan `scale` agar slot foto tetap 640x480,
     sehingga proporsi bingkai pada PNG identik dengan yang tampil di layar. */
  const cols = (layout === 6 || layout === 4) ? 2 : 1;
  const rows = layout === 1 ? 1 : (layout === 4 ? 2 : 3);
  const baseW = (layout === 4 || layout === 6) ? 440 : 300;   // .frame-outer width
  /* Semua tema: potong rapat ke kartu (tanpa padding frame-outer). */
  const outer = 0;                                             // .frame-outer padding
  const outerT = outer;
  const frameX = showFrame ? 18 : 0;                           // .frame padding x
  const frameTop = showFrame ? 22 : 0;                         // .frame padding-top
  const frameBottom = showFrame ? 24 : 0;                      // .frame padding-bottom
  const gapPrev = cols === 2 ? 10 : 12;                        // .photos-grid / .photos-strip gap
  const innerW = baseW - 2 * (outerT + frameX);
  const slotPrevW = (innerW - (cols - 1) * gapPrev) / cols;
  const scale = 640 / slotPrevW;                               // preview px -> canvas px

  const slotW = 640, slotH = 480;
  const padX = (outerT + frameX) * scale;
  const padTop = (outerT + frameTop) * scale;
  const gap = gapPrev * scale;
  let padB = (outerT + frameBottom) * scale;
  if (showFrame && layout === 1) padB = (outerT + 0.19 * (baseW - 2 * outerT)) * scale;   // polaroid: margin bawah lebar

  const hasCaption = showFrame && (customText || showDate);
  const capFit = (captionFit && captionFit.cap) ? captionFit.cap : null;
  const dateFit = (captionFit && captionFit.date) ? captionFit.date : null;
  const capCssSize = capFit ? capFit.size : 12;
  const capLineH = capFit ? capFit.lineHeight : 1.2;
  const dateCssSize = dateFit ? dateFit.size : 12;
  const dateLineH = dateFit ? dateFit.lineHeight : 1.2;
  const capFont = Math.max(1, Math.round(capCssSize * scale));         // .frame-date font-size (px CSS -> canvas)
  const dateFontPx = Math.max(1, Math.round(dateCssSize * scale));
  /* Area caption SELALU disediakan (samakan dengan .frame-captions:
     min-height 48px + padding-top 12px, box-sizing border-box) sehingga
     ukuran bingkai tetap walau tanpa tanggal/caption — sama seperti preview. */
  const capPadTop = showFrame ? 12 * scale : 0;
  const capAreaCss = 12 + (customText ? capCssSize * capLineH : 0) + (showDate ? dateCssSize * dateLineH : 0);
  const capH = showFrame ? Math.max(48, capAreaCss) * scale : 0;

  const photosH = rows * slotH + (rows - 1) * gap;
  /* Ukuran konten (foto + caption). */
  const Wc = Math.round(padX * 2 + cols * slotW + (cols - 1) * gap);
  const Hc = Math.round(padTop + photosH + capH + padB);
  /* Layout 3/4/6: hasil keseluruhan dibuat 9:16 (portrait HP) tanpa crop —
     foto tetap, bingkai/latar mengisi sisanya; konten ditengahkan. */
  const W = Wc, H = Hc, offX = 0, offY = 0;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const t = theme;

  /* background + border per theme */
  if (showFrame) {
  /* "Garis bingkai" (outline) mati: gambar latar/motif saja, jangan garis. */
  const fo = frameOutline !== false;
  const _stroke = x.stroke, _strokeRect = x.strokeRect;
  if (!fo) { x.stroke = () => {}; x.strokeRect = () => {}; }
  if (t === 'pastel') {
    /* Fokus ke area putih: gradien pinggir dihilangkan, kartu putih polos. */
    x.fillStyle = '#ffffff'; rr(x, 0, 0, W, H, 44); x.fill();
  } else if (t === 'cream') {
    x.fillStyle = '#f8f2e6'; rr(x, 0, 0, W, H, 14); x.fill();
    x.lineWidth = 3; x.strokeStyle = '#b89b6d'; rr(x, 8, 8, W - 16, H - 16, 10); x.stroke();
    x.lineWidth = 2; x.strokeStyle = '#d9c6a4'; rr(x, 22, 22, W - 44, H - 44, 8); x.stroke();
  } else if (t === 'confetti') {
    const pc = document.createElement('canvas'); pc.width = pc.height = 120;
    const p = pc.getContext('2d');
    const colsArr = ['#ffb3c7', '#ffe08a', '#a8e6cf', '#a8c8ff', '#d5a8ff'];
    p.fillStyle = '#ffffff'; p.fillRect(0, 0, 120, 120);
    colsArr.forEach((c, i) => {
      p.fillStyle = c; p.save(); p.translate(60, 60); p.rotate(Math.PI / 4);
      p.fillRect(-90, -60 + i * 24, 180, 24); p.restore();
    });
    x.fillStyle = x.createPattern(pc, 'repeat'); rr(x, 0, 0, W, H, 40); x.fill();
    x.fillStyle = '#ffffff'; rr(x, 26, 26, W - 52, H - 52, 28); x.fill();
    x.fillStyle = 'rgba(255,227,236,.9)';
    for (let yy = 60; yy < H - 40; yy += 44)
      for (let xx = 60; xx < W - 40; xx += 44) {
        x.beginPath(); x.arc(xx, yy, 4, 0, 7); x.fill();
      }
  } else if (t === 'floral') {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#f2f7ec'); g.addColorStop(.5, '#e4efe0'); g.addColorStop(1, '#d9e8d4');
    x.fillStyle = g; rr(x, 0, 0, W, H, 48); x.fill();
    x.lineWidth = 12; x.strokeStyle = '#ffffff'; rr(x, 18, 18, W - 36, H - 36, 36); x.stroke();
    x.lineWidth = 3; x.strokeStyle = '#a9c6ae'; rr(x, 40, 40, W - 80, H - 80, 28); x.stroke();
  } else if (t === 'neon') {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0d0f1a'); g.addColorStop(.5, '#1a0933'); g.addColorStop(1, '#051525');
    x.fillStyle = g; rr(x, 0, 0, W, H, 44); x.fill();
    x.lineWidth = 10; x.strokeStyle = '#00f0ff'; rr(x, 14, 14, W - 28, H - 28, 36); x.stroke();
    x.lineWidth = 4; x.strokeStyle = '#ff007f'; rr(x, 28, 28, W - 56, H - 56, 28); x.stroke();
  } else if (t === 'y2k') {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#b8c6db'); g.addColorStop(.5, '#ffd1ff'); g.addColorStop(1, '#ffe7a8');
    x.fillStyle = g; rr(x, 0, 0, W, H, 44); x.fill();
    x.lineWidth = 12; x.strokeStyle = '#ffffff'; rr(x, 18, 18, W - 36, H - 36, 34); x.stroke();
    x.lineWidth = 4; x.strokeStyle = '#ff9a9e'; rr(x, 40, 40, W - 80, H - 80, 26); x.stroke();
  } else if (t === 'film') {
    x.fillStyle = '#1a1a1a'; rr(x, 0, 0, W, H, 24); x.fill();
    x.lineWidth = 8; x.strokeStyle = '#111111'; rr(x, 12, 12, W - 24, H - 24, 18); x.stroke();
    /* sprocket holes */
    x.fillStyle = '#0a0a0a';
    for (let sy = 50; sy < H - 40; sy += 70) {
      x.fillRect(22, sy, 28, 40);
      x.fillRect(W - 50, sy, 28, 40);
    }
  } else if (t === 'midnight') {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1d3a'); g.addColorStop(.5, '#162b4d'); g.addColorStop(1, '#23426e');
    x.fillStyle = g; rr(x, 0, 0, W, H, 44); x.fill();
    x.lineWidth = 12; x.strokeStyle = '#ffffff'; rr(x, 18, 18, W - 36, H - 36, 34); x.stroke();
    x.lineWidth = 4; x.strokeStyle = '#e0b94c'; rr(x, 40, 40, W - 80, H - 80, 26); x.stroke();
  }  else if (t === 'chrome') {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#eef2f7'); g.addColorStop(.35, '#ffffff'); g.addColorStop(.55, '#c3ccdb');
    g.addColorStop(.75, '#f3f6fa'); g.addColorStop(1, '#aab6c8');
    x.fillStyle = g; rr(x, 0, 0, W, H, 40); x.fill();
    x.lineWidth = 12; x.strokeStyle = '#ffffff'; rr(x, 18, 18, W - 36, H - 36, 32); x.stroke();
    x.lineWidth = 4; x.strokeStyle = '#8fa0bb'; rr(x, 40, 40, W - 80, H - 80, 24); x.stroke();
  } else if (t === 'scrap') {
    x.fillStyle = '#e6d4b3'; rr(x, 0, 0, W, H, 10); x.fill();
    x.strokeStyle = 'rgba(150,120,80,.16)'; x.lineWidth = 1;
    for (let yy = 26; yy < H - 20; yy += 26) { x.beginPath(); x.moveTo(18, yy); x.lineTo(W - 18, yy); x.stroke(); }
    x.lineWidth = 3; x.strokeStyle = '#c9b184'; rr(x, 12, 12, W - 24, H - 24, 8); x.stroke();
    const tape = (tx, ty, rot, col) => {
      x.save(); x.translate(tx, ty); x.rotate(rot);
      x.fillStyle = col; x.fillRect(-65, -22, 130, 44); x.restore();
    };
    tape(W * .28, 18, -0.12, 'rgba(255,238,160,.75)');
    tape(W * .72, 18, 0.12, 'rgba(180,230,220,.75)');
    tape(W * .24, H - 18, 0.1, 'rgba(255,200,210,.75)');
    tape(W * .76, H - 18, -0.1, 'rgba(200,215,255,.75)');
  } else if (t === 'digi') {
    x.fillStyle = '#1c1c1c'; rr(x, 0, 0, W, H, 18); x.fill();
    x.lineWidth = 10; x.strokeStyle = '#333333'; rr(x, 14, 14, W - 28, H - 28, 14); x.stroke();
    x.fillStyle = '#ff8c1a'; x.beginPath(); x.arc(34, 34, 7, 0, 7); x.fill();
  } else if (t === 'coquette') {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#fff0f4'); g.addColorStop(.5, '#ffe0ea'); g.addColorStop(1, '#f7c8d8');
    x.fillStyle = g; rr(x, 0, 0, W, H, 44); x.fill();
    x.lineWidth = 12; x.strokeStyle = '#ffffff'; rr(x, 18, 18, W - 36, H - 36, 34); x.stroke();
    x.lineWidth = 3; x.strokeStyle = '#f3b8cc'; rr(x, 40, 40, W - 80, H - 80, 26); x.stroke();
    x.font = '54px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('🎀', 46, 46); x.fillText('🎀', W - 46, 46);
  } else if (t === 'aero') {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#bfe6ff'); g.addColorStop(.45, '#7ec8f5'); g.addColorStop(1, '#3f9fe0');
    x.fillStyle = g; rr(x, 0, 0, W, H, 44); x.fill();
    const hg = x.createLinearGradient(0, 0, 0, H * .5);
    hg.addColorStop(0, 'rgba(255,255,255,.85)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = hg; rr(x, 18, 18, W - 36, H * .5, 34); x.fill();
    x.lineWidth = 10; x.strokeStyle = '#ffffff'; rr(x, 18, 18, W - 36, H - 36, 34); x.stroke();
    x.fillStyle = 'rgba(255,255,255,.55)';
    [[W * .12, H * .12, 16], [W * .9, H * .2, 10], [W * .84, H * .6, 8], [W * .16, H * .5, 12], [W * .5, H * .07, 7]]
      .forEach(b => { x.beginPath(); x.arc(b[0], b[1], b[2], 0, 7); x.fill(); });
  } else if (t === 'doodle') {
    x.fillStyle = '#ffffff'; rr(x, 0, 0, W, H, 20); x.fill();
    x.lineWidth = 10; x.strokeStyle = '#23233a'; rr(x, 14, 14, W - 28, H - 28, 16); x.stroke();
    x.font = '40px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    [['✿', W * .12, H * .1], ['★', W * .88, H * .08], ['♡', W * .1, H * .45],
     ['☺', W * .9, H * .5], ['✿', W * .2, H * .9], ['★', W * .8, H * .92]]
      .forEach(d => x.fillText(d[0], d[1], d[2]));
  }   else if (t === 'minimal') {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    x.lineWidth = 8; x.strokeStyle = '#111111'; x.strokeRect(14, 14, W - 28, H - 28);
  } else if (t === 'birthday') {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#ffe066'); g.addColorStop(.5, '#ffb3c7'); g.addColorStop(1, '#a8d8ff');
    x.fillStyle = g; rr(x, 0, 0, W, H, 44); x.fill();
    x.lineWidth = 12; x.strokeStyle = '#ffffff'; rr(x, 18, 18, W - 36, H - 36, 34); x.stroke();
    x.lineWidth = 4; x.strokeStyle = '#ff8fab'; rr(x, 40, 40, W - 80, H - 80, 26); x.stroke();
    x.font = '44px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('🎈', 46, 46); x.fillText('🎈', W - 46, 46);
  }  else if (t === 'wedding') {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#fdfbf7'); g.addColorStop(1, '#f3ede2');
    x.fillStyle = g; rr(x, 0, 0, W, H, 44); x.fill();
    x.lineWidth = 12; x.strokeStyle = '#ffffff'; rr(x, 18, 18, W - 36, H - 36, 34); x.stroke();
    x.lineWidth = 3; x.strokeStyle = '#d9c39a'; rr(x, 40, 40, W - 80, H - 80, 26); x.stroke();
    x.font = '40px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('💍', 44, 44); x.fillText('💍', W - 44, 44);
  } else if (t === 'lebaran') {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0f6b4f'); g.addColorStop(1, '#14855f');
    x.fillStyle = g; rr(x, 0, 0, W, H, 44); x.fill();
    x.lineWidth = 10; x.strokeStyle = '#e6c766'; rr(x, 16, 16, W - 32, H - 32, 36); x.stroke();
    x.font = '42px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('🌙', 46, 46); x.fillText('✨', W - 46, 46);
  } else if (t === 'natal') {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#b7172b'); g.addColorStop(1, '#8f1123');
    x.fillStyle = g; rr(x, 0, 0, W, H, 40); x.fill();
    x.lineWidth = 12; x.strokeStyle = '#ffffff'; rr(x, 18, 18, W - 36, H - 36, 32); x.stroke();
    x.lineWidth = 4; x.strokeStyle = '#0f6b3a'; rr(x, 40, 40, W - 80, H - 80, 24); x.stroke();
    x.font = '44px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('🎄', 46, 46); x.fillText('❄️', W - 46, 46);
  }  else if (t === 'valentine') {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#ffe3ec'); g.addColorStop(1, '#ffc2d6');
    x.fillStyle = g; rr(x, 0, 0, W, H, 44); x.fill();
    x.lineWidth = 12; x.strokeStyle = '#ffffff'; rr(x, 18, 18, W - 36, H - 36, 34); x.stroke();
    x.lineWidth = 3; x.strokeStyle = '#ff8fab'; rr(x, 40, 40, W - 80, H - 80, 26); x.stroke();
    x.font = '42px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('💗', 46, 46); x.fillText('💗', W - 46, 46);
  } else if (t === 'baby') {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#dff1ff'); g.addColorStop(1, '#eaf6ff');
    x.fillStyle = g; rr(x, 0, 0, W, H, 44); x.fill();
    x.lineWidth = 12; x.strokeStyle = '#ffffff'; rr(x, 18, 18, W - 36, H - 36, 34); x.stroke();
    x.lineWidth = 3; x.strokeStyle = '#a9d6f5'; rr(x, 40, 40, W - 80, H - 80, 26); x.stroke();
    x.font = '40px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('☁️', 46, 46); x.fillText('🍼', W - 46, 46);
  } else if (t === 'custom') {
    const cf = customFrame || {};
    const bg = cf.bg || '#ffffff';
    const bg2 = cf.bg2 || bg;
    const outline = cf.outline || '#d63384';
    const pattern = cf.pattern || 'none';
    if (cf.gradient === false) {
      x.fillStyle = bg; x.fillRect(0, 0, W, H);
    } else {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, bg); g.addColorStop(1, bg2);
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    if (pattern !== 'none') {
      /* Batasi motif ke area dalam bingkai (di dalam padding .frame-outer). */
      x.save();
      x.beginPath();
      x.rect(outer * scale, outer * scale, W - 2 * outer * scale, H - 2 * outer * scale);
      x.clip();
      if (pattern === 'dots') {
        x.fillStyle = 'rgba(0,0,0,.10)';
        const step = 22 * scale, r = 2 * scale;
        for (let yy = step; yy < H; yy += step) {
          for (let xx = step; xx < W; xx += step) { x.beginPath(); x.arc(xx, yy, r, 0, Math.PI * 2); x.fill(); }
        }
      } else if (pattern === 'stripes') {
        x.strokeStyle = 'rgba(0,0,0,.07)'; x.lineWidth = 10 * scale;
        for (let d = -H; d < W; d += 20 * scale) { x.beginPath(); x.moveTo(d, 0); x.lineTo(d + H, H); x.stroke(); }
      }
      x.restore();
    }
    if (cf.outlineOn !== false && fo) {
      x.lineWidth = 4 * scale; x.strokeStyle = outline;
      x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, W - x.lineWidth, H - x.lineWidth);
    }
  }
  if (!fo) { x.stroke = _stroke; x.strokeRect = _strokeRect; }
  }

  /* photo slots */
  photos.forEach((photo, i) => {
    const canvas = photo.canvas || photo;                             // dukung canvas mentah
    const fcss = filterCss(photo.filter);
    const cx = i % cols, cy = Math.floor(i / cols);
    const X = offX + padX + cx * (slotW + gap), Y = offY + padTop + cy * (slotH + gap);
    x.save(); rr(x, X, Y, slotW, slotH, 18); x.clip();
    x.filter = fcss;                                                  // filter per foto
    coverDraw(x, canvas, X, Y, slotW, slotH, photo.zoom, photo.ox, photo.oy);
    x.restore();
    if (showFrame && !(customFrame && customFrame.slotBorder === false)) {
    let slotStroke = '#ffffff';
    if (t === 'neon') slotStroke = '#00f0ff';
    else if (t === 'film' || t === 'minimal') slotStroke = '#111111';
    else if (t === 'lebaran') slotStroke = '#e6c766';
    else if (t === 'custom' && customFrame) slotStroke = customFrame.slot || '#ffffff';
    x.lineWidth = (t === 'cream' || t === 'film' || t === 'minimal') ? 7 : 10;
    x.strokeStyle = slotStroke;
    rr(x, X, Y, slotW, slotH, 18); x.stroke();
    if (t === 'pastel') {
      x.lineWidth = 3; x.strokeStyle = '#f3c6dd';
      rr(x, X + 8, Y + 8, slotW - 16, slotH - 16, 12); x.stroke();
    }
    if (t === 'cream') {
      x.lineWidth = 2; x.strokeStyle = '#c9b18a';
      rr(x, X - 4, Y - 4, slotW + 8, slotH + 8, 20); x.stroke();
    }
    if (t === 'floral') {
      x.lineWidth = 3; x.strokeStyle = '#b7d0bc';
      rr(x, X - 4, Y - 4, slotW + 8, slotH + 8, 22); x.stroke();
    }
    if (t === 'neon') {
      x.lineWidth = 3; x.strokeStyle = '#ff007f';
      rr(x, X - 6, Y - 6, slotW + 12, slotH + 12, 24); x.stroke();
    }
    if (t === 'y2k') {
      x.lineWidth = 4; x.strokeStyle = '#ff9a9e';
      rr(x, X - 4, Y - 4, slotW + 8, slotH + 8, 22); x.stroke();
    }
    if (t === 'midnight') {
      x.lineWidth = 3; x.strokeStyle = '#e0b94c';
      rr(x, X - 4, Y - 4, slotW + 8, slotH + 8, 22); x.stroke();
    }
    
    if (t === 'chrome') {
      x.lineWidth = 3; x.strokeStyle = '#b8c2d4';
      rr(x, X - 5, Y - 5, slotW + 10, slotH + 10, 24); x.stroke();
    }
    if (t === 'coquette') {
      x.lineWidth = 3; x.strokeStyle = '#f7c8d8';
      rr(x, X - 5, Y - 5, slotW + 10, slotH + 10, 24); x.stroke();
    }
    
    
    if (t === 'birthday') {
      x.lineWidth = 3; x.strokeStyle = '#ffb3c7';
      rr(x, X - 5, Y - 5, slotW + 10, slotH + 10, 24); x.stroke();
    }
    if (t === 'wedding') {
      x.lineWidth = 3; x.strokeStyle = '#d9c39a';
      rr(x, X - 5, Y - 5, slotW + 10, slotH + 10, 24); x.stroke();
    }
    if (t === 'valentine') {
      x.lineWidth = 3; x.strokeStyle = '#ff8fab';
      rr(x, X - 5, Y - 5, slotW + 10, slotH + 10, 24); x.stroke();
    }
    if (t === 'baby') {
      x.lineWidth = 3; x.strokeStyle = '#bfe3ff';
      rr(x, X - 5, Y - 5, slotW + 10, slotH + 10, 24); x.stroke();
    }
    if (t === 'natal') {
      x.lineWidth = 3; x.strokeStyle = '#0f6b3a';
      rr(x, X - 5, Y - 5, slotW + 10, slotH + 10, 24); x.stroke();
    }
    if (t === 'confetti') {
      x.save();
      x.shadowColor = 'rgba(150,150,200,.35)'; x.shadowBlur = 14;
      x.lineWidth = 9; x.strokeStyle = '#ffffff';
      rr(x, X, Y, slotW, slotH, 18); x.stroke();
      x.restore();
    }
    }
  });

  if (hasCaption) {
  const capColor = captionColor || DATE_COLORS[t] || '#8f8fb0';
  const dateColorFinal = dateColor || DATE_COLORS[t] || '#8f8fb0';
  let top = offY + padTop + photosH + capPadTop;
  /* caption (nama/ucapan) — font terpisah dari tanggal */
  if (customText) {
    const h = capCssSize * capLineH * scale;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '700 ' + capFont + 'px "' + captionFont + '", "Trebuchet MS", sans-serif';
    x.letterSpacing = (((capFit && capFit.spacing) || 0) * scale) + 'px';
    x.fillStyle = capColor;
    x.fillText(customText, W / 2, top + h / 2);
    top += h;
  }

  /* tanggal — font sendiri */
  if (showDate) {
    const h = dateCssSize * dateLineH * scale;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '700 ' + dateFontPx + 'px "' + dateFont + '", "Trebuchet MS", sans-serif';
    x.letterSpacing = (((dateFit && dateFit.spacing) || 0) * scale) + 'px';
    x.fillStyle = dateColorFinal;
    x.fillText(customDate || dateLine(getLang()), W / 2, top + h / 2);
    top += h;
  }
  x.letterSpacing = '0px';
  }

  /* user added custom stickers */
  if (stickers && stickers.length > 0) {
    stickers.forEach(st => {
      const cx = st.x * W;
      const cy = st.y * H;
      const sc = st.scale || 1.0;
      const rot = st.rotation || 0;
      x.save();
      x.translate(cx, cy);
      if (rot) x.rotate((rot * Math.PI) / 180);

      if (st.type === 'char') {
        const r = W * 0.058 * sc;
        const img = charImgs[st.value];
        if (img) {
          x.shadowColor = 'rgba(35,35,58,.35)'; x.shadowBlur = 10; x.shadowOffsetY = 3;
          x.fillStyle = '#ffffff';
          x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fill();
          x.shadowColor = 'transparent';
          x.drawImage(img, -r * 0.82, -r * 0.82, r * 1.64, r * 1.64);
        }
      } else if (st.type === 'text') {
        const fontSize = Math.round(W * 0.045 * sc);
        const stickerFont = st.font || 'Matcha Iced';
        x.font = '700 ' + fontSize + 'px "' + stickerFont + '", "Trebuchet MS", sans-serif';
        x.letterSpacing = (fontTracking(stickerFont) * fontSize) + 'px';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.lineJoin = 'round';
        if (st.outline !== false) {
          x.lineWidth = Math.max(3, fontSize * 0.14);
          x.strokeStyle = 'rgba(255,255,255,.9)';
          x.strokeText(st.value, 0, 0);
        }
        x.fillStyle = st.color || '#23233a';
        x.fillText(st.value, 0, 0);
      } else if (st.type === 'emoji') {
        const fontSize = Math.round(W * 0.08 * sc);
        x.font = fontSize + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.shadowColor = 'rgba(0,0,0,0.2)';
        x.shadowBlur = 8;
        x.shadowOffsetY = 2;
        x.fillText(st.value, 0, 0);
      }
      x.restore();
    });
  }

  return cv;
}
