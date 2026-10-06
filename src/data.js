/* Photo Booth — data: filters, themes, character stickers, captions */

export const FILTERS = [
  { id: 'normal',  name: 'Normal',  css: 'none' },
  { id: 'bw',      name: 'B&W',     css: 'grayscale(1)' },
  { id: 'sepia',   name: 'Sepia',   css: 'sepia(1)' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(.55) contrast(1.05) brightness(.96) saturate(.9)' },
  { id: 'warm',    name: 'Hangat',  css: 'sepia(.35) saturate(1.5) hue-rotate(-15deg)' },
  { id: 'cool',    name: 'Dingin',  css: 'saturate(1.25) hue-rotate(18deg) brightness(1.03)' },
  { id: 'pop',     name: 'Pop',     css: 'saturate(1.9) contrast(1.25)' },
  { id: 'soft',    name: 'Lembut',  css: 'contrast(.88) brightness(1.08) saturate(.85)' },
  { id: 'matte',   name: 'Matte',   css: 'contrast(.9) brightness(1.05) saturate(.8) sepia(.12)' },
  { id: 'retro',   name: 'Retro',   css: 'sepia(.35) saturate(1.35) hue-rotate(-12deg) contrast(1.08)' },
  { id: 'noir',    name: 'Noir',    css: 'grayscale(1) contrast(1.45) brightness(.92)' },
  { id: 'cine',    name: 'Sinematik', css: 'contrast(1.18) saturate(1.15) sepia(.08)' },
  { id: 'golden',  name: 'Golden Hour', css: 'sepia(.35) saturate(1.5) brightness(1.06) hue-rotate(-14deg)' },
  { id: 'ice',     name: 'Dingin Es', css: 'saturate(.85) hue-rotate(18deg) brightness(1.06) contrast(1.05)' },
  { id: 'drama',   name: 'Dramatis', css: 'contrast(1.3) saturate(1.2) brightness(.95)' },
  { id: 'lomo',    name: 'Lomo',    css: 'contrast(1.25) saturate(1.6) brightness(.95)' },
  { id: 'dreamy',  name: 'Dreamy',  css: 'brightness(1.08) saturate(1.15) contrast(.95) blur(.4px)' },
  { id: 'neg',     name: 'Negatif', css: 'invert(1)' },
];

export const THEMES = [
  { id: 'custom',   name: 'Custom Frame' },
  { id: 'pastel',   name: 'Princess Pastel' },
  { id: 'cream',    name: 'Aesthetic Cream' },
  { id: 'confetti', name: 'Cute Confetti' },
  { id: 'floral',   name: 'Garden Floral' },
  { id: 'neon',     name: 'Neon Cyber' },
  { id: 'y2k',      name: 'Y2K Glitz' },
  { id: 'film',     name: '35mm Film' },
  { id: 'midnight', name: 'Midnight Stars' },
  { id: 'chrome',   name: 'Chrome Y3K' },
  { id: 'scrap',    name: 'Scrapbook Zine' },
  { id: 'digi',     name: 'Digicam Flash' },
  { id: 'coquette', name: 'Coquette Bows' },
  { id: 'aero',     name: 'Frutiger Aero' },
  { id: 'doodle',   name: 'Doodle Core' },
  { id: 'minimal',  name: 'Seoul Minimal' },
  { id: 'birthday', name: 'Ulang Tahun' },
  { id: 'wedding',  name: 'Pernikahan' },
  { id: 'lebaran',  name: 'Lebaran' },
  { id: 'natal',    name: 'Natal' },
  { id: 'valentine',name: 'Valentine' },
  { id: 'baby',     name: 'Baby Shower' },
];

/* Original character stickers (classic-cartoon style, drawn as SVG).
   Real Disney characters are NOT used (copyright). */
export const CHARS = ['bear', 'bunny', 'cat', 'frog', 'chick', 'star'];

export const CHAR_SVG = {
  bear: '<circle cx="11" cy="13" r="7.5" fill="#8a5a34"/><circle cx="37" cy="13" r="7.5" fill="#8a5a34"/><circle cx="11" cy="13" r="3.4" fill="#d9a06b"/><circle cx="37" cy="13" r="3.4" fill="#d9a06b"/><circle cx="24" cy="27" r="16" fill="#b07a4f"/><ellipse cx="24" cy="33" rx="8.5" ry="6.5" fill="#e8c9a0"/><circle cx="17" cy="24" r="2.6" fill="#23233a"/><circle cx="31" cy="24" r="2.6" fill="#23233a"/><ellipse cx="24" cy="30.5" rx="3" ry="2.4" fill="#23233a"/><path d="M24 33 v3 M24 36 q-3 3 -6 2 M24 36 q3 3 6 2" stroke="#23233a" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  bunny: '<ellipse cx="16" cy="11" rx="5.5" ry="11" fill="#f4f4f8" stroke="#23233a" stroke-width="2"/><ellipse cx="32" cy="11" rx="5.5" ry="11" fill="#f4f4f8" stroke="#23233a" stroke-width="2"/><ellipse cx="16" cy="12" rx="2.4" ry="6.5" fill="#ffb3c7"/><ellipse cx="32" cy="12" rx="2.4" ry="6.5" fill="#ffb3c7"/><circle cx="24" cy="31" r="14.5" fill="#f4f4f8" stroke="#23233a" stroke-width="2"/><circle cx="18" cy="29" r="2.6" fill="#23233a"/><circle cx="30" cy="29" r="2.6" fill="#23233a"/><polygon points="24,33 21,36.5 27,36.5" fill="#ff8fab"/><rect x="22" y="37" width="4.4" height="4" fill="#fff" stroke="#23233a" stroke-width="1.4"/>',
  cat: '<polygon points="10,16 13,3 23,11" fill="#ff9f45" stroke="#23233a" stroke-width="2" stroke-linejoin="round"/><polygon points="38,16 35,3 25,11" fill="#ff9f45" stroke="#23233a" stroke-width="2" stroke-linejoin="round"/><circle cx="24" cy="28" r="15.5" fill="#ff9f45" stroke="#23233a" stroke-width="2"/><path d="M18 16 l-2 -4 M24 14.5 v-4.5 M30 16 l2 -4" stroke="#e07b28" stroke-width="2" stroke-linecap="round"/><circle cx="17.5" cy="26" r="2.6" fill="#23233a"/><circle cx="30.5" cy="26" r="2.6" fill="#23233a"/><polygon points="24,30 21.5,33.5 26.5,33.5" fill="#ff6b8f"/><path d="M14 32 l-6 -1 M14 35 l-6 1 M34 32 l6 -1 M34 35 l6 1" stroke="#23233a" stroke-width="1.4" stroke-linecap="round"/>',
  frog: '<circle cx="15" cy="12" r="7" fill="#6fbf5f" stroke="#23233a" stroke-width="2"/><circle cx="33" cy="12" r="7" fill="#6fbf5f" stroke="#23233a" stroke-width="2"/><circle cx="15" cy="12" r="4" fill="#fff"/><circle cx="33" cy="12" r="4" fill="#fff"/><circle cx="15" cy="13" r="2" fill="#23233a"/><circle cx="33" cy="13" r="2" fill="#23233a"/><ellipse cx="24" cy="30" rx="15.5" ry="13.5" fill="#6fbf5f" stroke="#23233a" stroke-width="2"/><circle cx="13" cy="31" r="3" fill="#ff9fb0" opacity=".8"/><circle cx="35" cy="31" r="3" fill="#ff9fb0" opacity=".8"/><path d="M17 32 Q24 38 31 32" stroke="#23233a" stroke-width="2" fill="none" stroke-linecap="round"/>',
  chick: '<path d="M20 8 q1 -5 5 -5 M24 8 q2 -5 6 -4" stroke="#e0a92e" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="24" cy="27" r="15" fill="#ffd94d" stroke="#23233a" stroke-width="2"/><circle cx="18" cy="25" r="2.6" fill="#23233a"/><circle cx="30" cy="25" r="2.6" fill="#23233a"/><polygon points="24,28 18.5,33 29.5,33" fill="#ff8f3f" stroke="#23233a" stroke-width="1.6" stroke-linejoin="round"/><circle cx="14" cy="30" r="2.6" fill="#ff9fb0" opacity=".8"/><circle cx="34" cy="30" r="2.6" fill="#ff9fb0" opacity=".8"/>',
  star: '<polygon points="24,4 29,17 43,17 32,26 36,40 24,32 12,40 16,26 5,17 19,17" fill="#ffd166" stroke="#23233a" stroke-width="2.4" stroke-linejoin="round"/><circle cx="18.5" cy="22" r="2.4" fill="#23233a"/><circle cx="29.5" cy="22" r="2.4" fill="#23233a"/><path d="M19 29 Q24 33 29 29" stroke="#23233a" stroke-width="2" fill="none" stroke-linecap="round"/>',
};

export function filterCss(id) {
  const f = FILTERS.find(x => x.id === id);
  return f ? f.css : 'none';
}

/* Warna default caption/tanggal per tema (dipakai preview & composer). */
export const DATE_COLORS = {
  custom: '#8a5b7e',
  pastel: '#c46998', cream: '#b39b74', confetti: '#8f8fb0', floral: '#6d9973',
  neon: '#ff007f', y2k: '#7b68ee', film: '#f5a623', midnight: '#e0b94c',
  chrome: '#4d5f80', scrap: '#8a6a3c', digi: '#ff8c1a', coquette: '#c2557e',
  aero: '#0a6bb0', doodle: '#23233a', minimal: '#111111',
  birthday: '#e0487b', wedding: '#9a7b4f', lebaran: '#f0d98a',
  natal: '#0f6b3a', valentine: '#d6336c', baby: '#5a8fc0',
};

/* Jarak antar-huruf per font (dalam em) supaya spasi teks konsisten
   antara preview HTML dan PNG hasil unduhan. Font tak dikenal = 0. */
export const FONT_TRACKING = {
  'Matcha Iced': 0,
  'The Magic Cookie': 0.01,
  'Orange Lovely': 0,
  'Quicksand': 0.005,
  'Fredoka': 0,
  'Always Classy': 0,
  'Melon Tea': 0.01,
  'Smart Water': 0.02,
  'Stay With Me': 0.01,
  'Streat Coffee': 0,
  'Super Waffles': 0.01,
  'Anak Bijak': 0.005,
  'Scripty': 0,
  'Carefour': 0,
  'JW Script': 0,
  'MiloScript': 0,
  'Love Script': 0,
  'Script Soft': 0,
  'Happiness Machine': 0,
  'Happiness Machine Script': 0,
  'Monobit': 0,
  'Nuka Mono': 0,
  'Solid Mono': 0,
  'Always Monoline': 0,
  'Always Smiling': 0,
  'Smiling': 0,
};
export function fontTracking(font) {
  const v = FONT_TRACKING[font];
  return typeof v === 'number' ? v : 0;
}

/* Tinggi baris per font (kelipatan font-size) agar jarak antar baris caption
   & tanggal pas — font berswa/script butuh ruang lebih. Default 1.2. */
export const FONT_LINE_HEIGHT = {
  'Matcha Iced': 1.2,
  'The Magic Cookie': 1.45,
  'Orange Lovely': 1.4,
  'Quicksand': 1.2,
  'Fredoka': 1.2,
  'Always Classy': 1.7,
  'Melon Tea': 1.25,
  'Smart Water': 1.3,
  'Stay With Me': 1.4,
  'Streat Coffee': 1.3,
  'Super Waffles': 1.35,
  'Anak Bijak': 1.3,
  'Scripty': 1.4,
  'Carefour': 1.2,
  'JW Script': 1.45,
  'MiloScript': 1.4,
  'Love Script': 1.4,
  'Script Soft': 1.35,
  'Happiness Machine': 1.35,
  'Happiness Machine Script': 1.4,
  'Monobit': 1.2,
  'Nuka Mono': 1.25,
  'Solid Mono': 1.2,
  'Always Monoline': 1.45,
  'Always Smiling': 1.4,
  'Smiling': 1.45,
};
export function fontLineHeight(font) {
  const v = FONT_LINE_HEIGHT[font];
  return typeof v === 'number' ? v : 1.2;
}

const DATE_FORMATS = {
  id: 'DD·MM·YYYY', en: 'MM/DD/YYYY', ms: 'DD/MM/YYYY', ar: 'DD/MM/YYYY',
  es: 'DD/MM/YYYY', fr: 'DD/MM/YYYY', de: 'DD.MM.YYYY', pt: 'DD/MM/YYYY',
  ru: 'DD.MM.YYYY', ja: 'YYYY年MM月DD日', ko: 'YYYY.MM.DD', zh: 'YYYY年MM月DD日',
  hi: 'DD/MM/YYYY', vi: 'DD/MM/YYYY', th: 'DD/MM/YYYY', tr: 'DD.MM.YYYY',
};

export function dateLine(lang = 'id') {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const fmt = DATE_FORMATS[lang] || DATE_FORMATS.id;
  return fmt
    .replace('YYYY', String(d.getFullYear()))
    .replace('MM', p(d.getMonth() + 1))
    .replace('DD', p(d.getDate()));
}

export const EMOJI_STICKERS = [
  '💖', '✨', '🎀', '👑', '🕶️', '🌸', '⚡', '🍒',
  '🍕', '🌟', '🎈', '🎉', '🍿', '💋', '🐾', '🌈',
  '🤍', '🔥', '🐱', '🐰', '🐻', '🐥', '⭐', '🥑',
  '💬', '💌', '🍓', '🧁', '🍦', '🧸', '🌺', '🍀'
];

export const CAPTIONS = {
  custom:   { main: '✧ my style ✧', sub: '' },
  pastel:   { main: '✦ my magical day ✦', sub: '' },
  cream:    { main: 'Aesthetic', main2: 'Moments', sub: '' },
  confetti: { main: 'have fun!!', sub: '' },
  floral:   { main: '🌷 bloom with me 🌷', sub: '' },
  neon:     { main: '⚡ NEON NIGHTS ⚡', sub: '' },
  y2k:      { main: '★ Y2K 2000s VIP ★', sub: '' },
  film:     { main: '🎞 KODAK 35MM ISO 400', sub: '' },
  midnight: { main: '✨ Under The Stars ✨', sub: '' },
  chrome:   { main: '⟡ CHROME Y3K ⟡', sub: '' },
  scrap:    { main: 'scrap~book ♡', sub: '' },
  digi:     { main: 'DIGI CAM', sub: '' },
  coquette: { main: 'pretty in pink', sub: '' },
  aero:     { main: '☁ fresh air ☁', sub: '' },
  doodle:   { main: 'doodle days', sub: '' },
  minimal:  { main: 'Seoul Minimal', sub: '' },
  birthday: { main: 'Happy Birthday!', sub: '' },
  wedding:  { main: 'Just Married', sub: '' },
  lebaran:  { main: 'Selamat Idul Fitri', sub: '' },
  natal:    { main: 'Merry Christmas!', sub: '' },
  valentine:{ main: 'Be Mine ♡', sub: '' },
  baby:     { main: 'Hello Baby!', sub: '' },
};

