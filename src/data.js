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
export const CHARS = [
  'strawberry', 'peach', 'avocado', 'donut', 'cupcake', 'icecream', 'matcha',
  'daisy', 'butterfly', 'planet', 'moon', 'rainbow', 'loveletter', 'headphones',
  'cassette', 'crown', 'balloon', 'mushroom', 'paw', 'seashell',
  'snappiecam', 'lovepolaroid', 'ribbon', 'cherryduo', 'boba', 'dreamcloud',
  'discoball', 'tulip', 'bear', 'bunny', 'cat', 'frog', 'chick', 'star',
  'orangecat', 'esteh', 'bakso', 'peacehand', 'brokenheart', 'sleepypillow',
  'bubsalting', 'bubmager', 'bubgabut', 'bubbestie', 'bubwkwk', 'bubhealing', 'bubnocap', 'bubbucin',
  'laptopcapek', 'kopimelek', 'jamngantuk', 'skripsibuku', 'kalenderpanik', 'sandalsenang', 'bubbegadang', 'bubskripsi', 'bubdeadline', 'bubweekend', 'bubotw', 'bubsantuy', 'bubcapek', 'bubrebahan',
];

export const CHAR_NAMES = {
  strawberry: 'Berry Sweet', peach: 'Peach Please', avocado: 'Avo Buddy',
  donut: 'Sugar Ring', cupcake: 'Party Cupcake', icecream: 'Scoop of Joy',
  matcha: 'Matcha Mood', daisy: 'Happy Daisy', butterfly: 'Lilac Flutter',
  planet: 'Candy Saturn', moon: 'Sleepy Moon', rainbow: 'Pastel Rainbow',
  loveletter: 'Love Mail', headphones: 'Cozy Beats', cassette: 'Sweet Mixtape',
  crown: 'Little Royal', balloon: 'Heart Balloon', mushroom: 'Mochi Mushroom',
  paw: 'Peachy Paw', seashell: 'Pearl Wish',
  snappiecam: 'Snappie Cam', lovepolaroid: 'Love Polaroid', ribbon: 'Candy Bow',
  cherryduo: 'Cherry Besties', boba: 'Boba Buddy', dreamcloud: 'Dream Cloud',
  discoball: 'Disco Pop', tulip: 'Little Tulip',
  bear: 'Bear', bunny: 'Bunny', cat: 'Cat', frog: 'Frog', chick: 'Chick', star: 'Star',
  orangecat: 'Mager Kitty', esteh: 'Es Teh Salting', bakso: 'Bakso Melotot', peacehand: 'Peace Hand', brokenheart: 'Santai Heart', sleepypillow: 'Sleepy Pillow', bubsalting: 'Bubble salting!', bubmager: 'Bubble mager', bubgabut: 'Bubble gabut', bubbestie: 'Bubble bestie', bubwkwk: 'Bubble wkwk', bubhealing: 'Bubble healing', bubnocap: 'Bubble no cap', bubbucin: 'Bubble bucin',
  laptopcapek: 'Capek Laptop', kopimelek: 'Melek Coffee', jamngantuk: 'Ngantuk Alarm', skripsibuku: 'Stres Skripsi', kalenderpanik: 'Panik Deadline', sandalsenang: 'Weekend Sandal', bubbegadang: 'Bubble begadang', bubskripsi: 'Bubble skripsi', bubdeadline: 'Bubble deadline', bubweekend: 'Bubble weekend', bubotw: 'Bubble otw', bubsantuy: 'Bubble santuy', bubcapek: 'Bubble capek', bubrebahan: 'Bubble rebahan',
};

// Transparent SVG artwork, shared by HTML and PNG without a white backing.
function stickerArt(art) {
  return '<g stroke="#68465f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + art + '</g>';
}

export const CHAR_SVG = {
  strawberry: stickerArt('<path d="M9 18c-5 9 9 25 15 25s20-16 15-25c-4-8-26-8-30 0z" fill="#ff9eb8"/><path d="M24 15L14 9l3 9-7 1 12 4 2-5 3 5 11-4-7-1 3-9z" fill="#b4dba0"/><path d="M17 26l-1 2m15-2 1 2m-9 6 1 2m-10-3 1 1m19-1-1 1" fill="none" stroke="#fff7d9"/><path d="M20 7l4 7 2-9" fill="none"/>'),
  peach: stickerArt('<path d="M24 15C5 4 0 27 13 39c6 6 10 3 11 2 5 5 15 1 18-9 5-17-7-24-18-17z" fill="#ffc5b2"/><path d="M24 17q-6 13 0 24" fill="none" stroke="#e28e94"/><path d="M24 14Q22 2 38 7q-1 11-14 7z" fill="#b4dba0"/><path d="M12 23q-2 4 0 7" fill="none" stroke="#fff"/>'),
  avocado: stickerArt('<path d="M24 4c-8 0-8 10-14 18-9 14-2 22 14 22s23-8 14-22C32 14 32 4 24 4z" fill="#a5ca98"/><path d="M24 9c-5 0-5 10-11 18-6 10 0 13 11 13s17-3 11-13C29 19 29 9 24 9z" fill="#e8efb9"/><circle cx="24" cy="29" r="7" fill="#cc9e7c"/><path d="M18 18h.1m12 0h.1" stroke-width="3"/><path d="M22 20q2 2 4 0" fill="none"/>'),
  donut: stickerArt('<circle cx="24" cy="24" r="19" fill="#efc399"/><path d="M7 20C5 5 30-2 40 13c7 8 0 10-3 8-4-2-4 5-8 3-3-2-5 4-8 1-4-5-6 4-9-1z" fill="#ffb1cd"/><circle cx="24" cy="23" r="6" fill="#fff5df"/><path d="M14 14l3 1m14-4-1 3m6 2-2 2m-24 3 3-1" fill="none" stroke="#fff"/><path d="M17 33h.1m14 0h.1" stroke-width="3"/><path d="M22 35q2 2 4 0" fill="none"/>'),
  cupcake: stickerArt('<path d="M11 26h26l-4 17H15z" fill="#cbb7ef"/><path d="M19 30l1 9m9-9-1 9" fill="none"/><path d="M10 26c-6-7 2-12 7-12-3-7 8-9 10-5 3 5 13 3 12 11 5 1 5 8-1 8z" fill="#ffcee0"/><circle cx="25" cy="6" r="3" fill="#ff8fab"/><path d="M17 19h3m9-3 2 2m-6 4h3" fill="none" stroke="#fff"/>'),
  icecream: stickerArt('<path d="M13 25h22L25 44h-2z" fill="#f1d2a1"/><path d="M17 29l11 7m-7-7 9 4m-11 3 9-7" fill="none" stroke="#c89e78"/><path d="M9 25c-2-7 3-11 7-11-1-12 17-13 17 0 7 0 10 9 6 12-3 4-5-3-8 0-4 5-5-3-9 0-5 4-5-3-9 1z" fill="#ffbdd7"/><path d="M20 10q4-3 7 0" fill="none" stroke="#fff"/>'),
  matcha: stickerArt('<path d="M34 18h5c10 0 7 15-5 15" fill="#e8efce"/><path d="M9 16h25v15c0 13-25 13-25 0z" fill="#c4dcae"/><ellipse cx="21.5" cy="16" rx="12.5" ry="4" fill="#8fb785"/><path d="M16 7q-4 3 0 5m10-8q-4 3 0 5" fill="none" stroke="#baa9cc"/><path d="M16 27h.1m11 0h.1" stroke-width="3"/><path d="M20 30q2 2 4 0" fill="none"/>'),
  daisy: stickerArt('<g fill="#fff7df"><ellipse cx="24" cy="12" rx="6" ry="9"/><ellipse cx="24" cy="36" rx="6" ry="9"/><ellipse cx="12" cy="24" rx="9" ry="6"/><ellipse cx="36" cy="24" rx="9" ry="6"/><ellipse cx="15" cy="15" rx="7" ry="6"/><ellipse cx="33" cy="15" rx="7" ry="6"/><ellipse cx="15" cy="33" rx="7" ry="6"/><ellipse cx="33" cy="33" rx="7" ry="6"/></g><circle cx="24" cy="24" r="10" fill="#ffda8b"/><path d="M20 22h.1m8 0h.1" stroke-width="2.5"/><path d="M21 27q3 3 6 0" fill="none"/>'),
  butterfly: stickerArt('<path d="M23 24C10-4-4 10 9 26c-10 15 11 20 14 1m2-3C38-4 52 10 39 26c10 15-11 20-14 1" fill="#d7b9ef"/><path d="M20 22C9 6 8 17 16 23m12-1c11-16 12-5 4 1" fill="#ffcbde"/><path d="M23 14l-5-6m7 6 5-6" fill="none"/><rect x="21" y="16" width="6" height="20" rx="3" fill="#fff0bf"/>'),
  planet: stickerArt('<circle cx="24" cy="24" r="15" fill="#d3bcec"/><path d="M12 16q12 6 22-1m-24 9q15 7 28-1m-22 11q8 3 16 0" fill="none" stroke="#f5d6ed"/><path d="M10 20C-8 37 14 43 38 27c15-11 7-16-2-12m2 3c7 0 5 3-3 8C14 39 3 36 12 28" fill="#ffdaaa"/><path d="M39 5v6m-3-3h6" fill="none"/>'),
  moon: stickerArt('<path d="M31 5C2-3-7 38 23 43c9 1 16-4 19-10C21 37 12 15 31 5z" fill="#ffe0a0"/><path d="M12 26q3 3 6 0m-3 6q3 2 5-1" fill="none"/><ellipse cx="10" cy="31" rx="3" ry="1.5" fill="#ffb8bf" stroke="none"/><path d="M37 10v10m-5-5h10m-12 7v5m-2.5-2.5h5" fill="none" stroke="#b09bcc"/>'),
  rainbow: stickerArt('<path d="M7 35V24a17 17 0 0134 0v11" fill="none" stroke="#ffb5d1" stroke-width="6"/><path d="M13 35V24a11 11 0 0122 0v11" fill="none" stroke="#ffe1a1" stroke-width="6"/><path d="M19 35V24a5 5 0 0110 0v11" fill="none" stroke="#b7d9cf" stroke-width="6"/><path d="M5 39c-5-5 0-11 5-9 4-7 12-2 10 5 4 5-3 8-7 6zm25 0c-4-6 1-11 6-9 5-7 12-1 9 5 2 6-7 9-10 6z" fill="#f8f1ff"/>'),
  loveletter: stickerArt('<rect x="5" y="13" width="38" height="27" rx="4" fill="#fff0d6"/><path d="M6 38l14-13m22 13L28 25" fill="none"/><path d="M6 15l18 15 18-15" fill="#ffd2e3"/><path d="M24 24c-17-10-6-19 0-10 6-9 17 0 0 10z" fill="#ff91b7"/>'),
  headphones: stickerArt('<path d="M8 28v-6C8 0 40 0 40 22v6" fill="none" stroke="#cbb7ef" stroke-width="7"/><rect x="5" y="24" width="10" height="17" rx="5" fill="#ffb5d1"/><rect x="33" y="24" width="10" height="17" rx="5" fill="#ffb5d1"/><path d="M25 20v13m0-13 6-2v11" fill="none"/><ellipse cx="22" cy="33" rx="3" ry="2" fill="#ffe1a1"/><ellipse cx="28" cy="29" rx="3" ry="2" fill="#ffe1a1"/>'),
  cassette: stickerArt('<rect x="4" y="10" width="40" height="30" rx="5" fill="#cbb7ef"/><rect x="8" y="14" width="32" height="16" rx="3" fill="#fff0d6"/><path d="M15 40l3-8h12l3 8" fill="#ffb5d1"/><rect x="13" y="19" width="22" height="6" rx="3" fill="#b7d9cf"/><circle cx="16" cy="22" r="4" fill="#fff"/><circle cx="32" cy="22" r="4" fill="#fff"/><path d="M16 21v2m16-2v2m-10 14h4" fill="none"/>'),
  crown: stickerArt('<path d="M10 35L5 13l11 8 8-14 8 14 11-8-5 22z" fill="#ffe1a1"/><rect x="10" y="34" width="28" height="7" rx="3" fill="#ffbdd7"/><path d="M24 20l4 6-4 5-4-5z" fill="#cbb7ef"/><circle cx="5" cy="11" r="2" fill="#ffbdd7"/><circle cx="43" cy="11" r="2" fill="#ffbdd7"/><circle cx="24" cy="6" r="2" fill="#ffbdd7"/>'),
  balloon: stickerArt('<path d="M24 30q-7 5 0 9t-2 6" fill="none"/><path d="M24 31C-10 12 13-4 24 10 35-4 58 12 24 31z" fill="#ffb5d1"/><path d="M13 11q-5 2-3 7" fill="none" stroke="#fff"/><path d="M24 30l-3 5h6z" fill="#e4b7ed"/>'),
  mushroom: stickerArt('<path d="M18 24l-3 15c-1 7 19 7 18 0l-3-15" fill="#fff0d6"/><path d="M6 25C1 14 16 4 24 4s23 10 18 21c-8 6-28 6-36 0z" fill="#ffb5d1"/><ellipse cx="15" cy="15" rx="4" ry="3" fill="#fff"/><circle cx="29" cy="12" r="3" fill="#fff"/><ellipse cx="36" cy="21" rx="3" ry="2" fill="#fff"/><path d="M20 34h.1m8 0h.1" stroke-width="2.5"/><path d="M22 37q2 2 4 0" fill="none"/>'),
  paw: stickerArt('<path d="M12 31c1-4 6-11 12-11s11 7 12 11c7 14-7 13-12 10-5 3-19 4-12-10z" fill="#ffc5b2"/><ellipse cx="8" cy="20" rx="4" ry="6" transform="rotate(-25 8 20)" fill="#ffb5d1"/><ellipse cx="18" cy="11" rx="4" ry="6" fill="#ffb5d1"/><ellipse cx="30" cy="11" rx="4" ry="6" fill="#ffb5d1"/><ellipse cx="40" cy="20" rx="4" ry="6" transform="rotate(25 40 20)" fill="#ffb5d1"/><path d="M24 35c-12-7-4-13 0-7 4-6 12 0 0 7z" fill="#fff0d6"/>'),
  seashell: stickerArt('<path d="M11 37C-8 22 7 5 15 12c0-13 18-13 18 0 8-7 23 10 4 25z" fill="#ffd0e1"/><path d="M24 8v29M14 14l6 23m15-23-7 23M7 22l10 15m24-15L31 37" fill="none" stroke="#c498bc"/><path d="M11 37q13 9 26 0" fill="#d7b9ef"/><circle cx="24" cy="34" r="6" fill="#fff9e8"/><path d="M21 32l2-1" fill="none" stroke="#d8c1de"/>'),
  snappiecam: stickerArt('<path d="M15 15l3-5h12l3 5" fill="#c9b8f4"/><rect x="5" y="15" width="38" height="26" rx="7" fill="#ffafd1"/><path d="M7 23h34" fill="none"/><circle cx="24" cy="28" r="9" fill="#fff3cd"/><circle cx="24" cy="28" r="5" fill="#bce4df"/><path d="M22 26l2-1" fill="none"/><rect x="32" y="18" width="6" height="4" rx="1" fill="#fff"/><path d="M8 8v5m-2-2h4" fill="none"/>'),
  lovepolaroid: stickerArt('<g transform="rotate(-9 24 24)"><rect x="9" y="5" width="30" height="38" rx="3" fill="#fff9ed"/><rect x="13" y="9" width="22" height="23" rx="2" fill="#c9b8f4"/><path d="M24 27c-17-10-6-19 0-10 6-9 17 0 0 10z" fill="#ff91b7"/><path d="M19 37h10" fill="none"/></g>'),
  ribbon: stickerArt('<path d="M21 25L12 43l-1-8-8 1 12-16m12 5 9 18 1-8 8 1-12-16" fill="#e4b7ed"/><path d="M21 18C5 0 0 15 9 27c4 4 10 0 13-3m4-6C43 0 48 15 39 27c-4 4-10 0-13-3" fill="#ffb5d1"/><path d="M10 15l10 6m18-6-10 6" fill="none"/><rect x="19" y="16" width="10" height="12" rx="4" fill="#fff0bc"/>'),
  cherryduo: stickerArt('<path d="M13 29Q11 13 27 7q-3 13 8 22" fill="none"/><path d="M26 8Q39 3 40 12q-8 3-14-4z" fill="#b4dba0"/><circle cx="13" cy="33" r="9" fill="#ff8eab"/><circle cx="35" cy="33" r="9" fill="#ffafc8"/><path d="M8 29l2-1m20 1 2-1" stroke="#fff" fill="none"/><path d="M11 34h.1m5 0h.1m17 0h.1m5 0h.1" stroke-width="2.5"/><path d="M12 37q1 2 3 0m19 0q1 2 3 0" fill="none"/>'),
  boba: stickerArt('<path d="M27 6l-2 19" fill="none" stroke-width="4"/><path d="M11 16h26l-3 25H14z" fill="#f5d9b4"/><path d="M13 25h22l-2 14H15z" fill="#e6c2e3" stroke="none"/><rect x="9" y="13" width="30" height="5" rx="2.5" fill="#fff4d6"/><path d="M19 24h.1m10 0h.1" stroke-width="3"/><path d="M22 27q2 3 4 0" fill="none"/><g fill="#68465f" stroke="none"><circle cx="18" cy="34" r="2"/><circle cx="25" cy="37" r="2"/><circle cx="30" cy="33" r="2"/><circle cx="20" cy="39" r="1.5"/></g>'),
  dreamcloud: stickerArt('<path d="M12 36C0 36 0 21 11 21 10 8 27 5 31 17c14-5 21 19 5 19z" fill="#d7ebff"/><path d="M15 25q2-3 4 0m10 0q2-3 4 0m-11 3q2 4 4 0" fill="none"/><ellipse cx="13" cy="29" rx="3" ry="1.5" fill="#ffb4cb" stroke="none"/><ellipse cx="35" cy="29" rx="3" ry="1.5" fill="#ffb4cb" stroke="none"/><path d="M9 8v5m-2-2h4m28-5v6m-3-3h6" fill="none"/>'),
  discoball: stickerArt('<path d="M24 3v7" fill="none"/><circle cx="24" cy="27" r="16" fill="#dcc7f5"/><ellipse cx="24" cy="27" rx="8" ry="16" fill="#ffbed8"/><path d="M24 11v32M9 22h30M9 32h30" fill="none"/><path d="M14 15q10 6 20 0m-20 24q10-6 20 0" fill="none"/><path d="M6 6v8m-4-4h8m32 24v8m-4-4h8" fill="none" stroke="#d39a52"/>'),
  tulip: stickerArt('<path d="M24 23v21" fill="none" stroke="#729b70" stroke-width="3"/><path d="M24 39C11 40 8 31 8 27q15-1 16 12zm0-5c12 1 16-7 16-12q-14 0-16 12z" fill="#b4dba0"/><path d="M13 6l8 6 3-9 4 9 7-6v11c0 15-22 15-22 0z" fill="#ffb5d1"/><path d="M19 18q2 7 7 6" fill="none"/>'),
  bear: '<circle cx="11" cy="13" r="7.5" fill="#8a5a34"/><circle cx="37" cy="13" r="7.5" fill="#8a5a34"/><circle cx="11" cy="13" r="3.4" fill="#d9a06b"/><circle cx="37" cy="13" r="3.4" fill="#d9a06b"/><circle cx="24" cy="27" r="16" fill="#b07a4f"/><ellipse cx="24" cy="33" rx="8.5" ry="6.5" fill="#e8c9a0"/><circle cx="17" cy="24" r="2.6" fill="#23233a"/><circle cx="31" cy="24" r="2.6" fill="#23233a"/><ellipse cx="24" cy="30.5" rx="3" ry="2.4" fill="#23233a"/><path d="M24 33 v3 M24 36 q-3 3 -6 2 M24 36 q3 3 6 2" stroke="#23233a" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  bunny: '<ellipse cx="16" cy="11" rx="5.5" ry="11" fill="#f4f4f8" stroke="#23233a" stroke-width="2"/><ellipse cx="32" cy="11" rx="5.5" ry="11" fill="#f4f4f8" stroke="#23233a" stroke-width="2"/><ellipse cx="16" cy="12" rx="2.4" ry="6.5" fill="#ffb3c7"/><ellipse cx="32" cy="12" rx="2.4" ry="6.5" fill="#ffb3c7"/><circle cx="24" cy="31" r="14.5" fill="#f4f4f8" stroke="#23233a" stroke-width="2"/><circle cx="18" cy="29" r="2.6" fill="#23233a"/><circle cx="30" cy="29" r="2.6" fill="#23233a"/><polygon points="24,33 21,36.5 27,36.5" fill="#ff8fab"/><rect x="22" y="37" width="4.4" height="4" fill="#fff" stroke="#23233a" stroke-width="1.4"/>',
  cat: '<polygon points="10,16 13,3 23,11" fill="#ff9f45" stroke="#23233a" stroke-width="2" stroke-linejoin="round"/><polygon points="38,16 35,3 25,11" fill="#ff9f45" stroke="#23233a" stroke-width="2" stroke-linejoin="round"/><circle cx="24" cy="28" r="15.5" fill="#ff9f45" stroke="#23233a" stroke-width="2"/><path d="M18 16 l-2 -4 M24 14.5 v-4.5 M30 16 l2 -4" stroke="#e07b28" stroke-width="2" stroke-linecap="round"/><circle cx="17.5" cy="26" r="2.6" fill="#23233a"/><circle cx="30.5" cy="26" r="2.6" fill="#23233a"/><polygon points="24,30 21.5,33.5 26.5,33.5" fill="#ff6b8f"/><path d="M14 32 l-6 -1 M14 35 l-6 1 M34 32 l6 -1 M34 35 l6 1" stroke="#23233a" stroke-width="1.4" stroke-linecap="round"/>',
  frog: '<circle cx="15" cy="12" r="7" fill="#6fbf5f" stroke="#23233a" stroke-width="2"/><circle cx="33" cy="12" r="7" fill="#6fbf5f" stroke="#23233a" stroke-width="2"/><circle cx="15" cy="12" r="4" fill="#fff"/><circle cx="33" cy="12" r="4" fill="#fff"/><circle cx="15" cy="13" r="2" fill="#23233a"/><circle cx="33" cy="13" r="2" fill="#23233a"/><ellipse cx="24" cy="30" rx="15.5" ry="13.5" fill="#6fbf5f" stroke="#23233a" stroke-width="2"/><circle cx="13" cy="31" r="3" fill="#ff9fb0" opacity=".8"/><circle cx="35" cy="31" r="3" fill="#ff9fb0" opacity=".8"/><path d="M17 32 Q24 38 31 32" stroke="#23233a" stroke-width="2" fill="none" stroke-linecap="round"/>',
  chick: '<path d="M20 8 q1 -5 5 -5 M24 8 q2 -5 6 -4" stroke="#e0a92e" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="24" cy="27" r="15" fill="#ffd94d" stroke="#23233a" stroke-width="2"/><circle cx="18" cy="25" r="2.6" fill="#23233a"/><circle cx="30" cy="25" r="2.6" fill="#23233a"/><polygon points="24,28 18.5,33 29.5,33" fill="#ff8f3f" stroke="#23233a" stroke-width="1.6" stroke-linejoin="round"/><circle cx="14" cy="30" r="2.6" fill="#ff9fb0" opacity=".8"/><circle cx="34" cy="30" r="2.6" fill="#ff9fb0" opacity=".8"/>',
  star: '<polygon points="24,4 29,17 43,17 32,26 36,40 24,32 12,40 16,26 5,17 19,17" fill="#ffd166" stroke="#23233a" stroke-width="2.4" stroke-linejoin="round"/><circle cx="18.5" cy="22" r="2.4" fill="#23233a"/><circle cx="29.5" cy="22" r="2.4" fill="#23233a"/><path d="M19 29 Q24 33 29 29" stroke="#23233a" stroke-width="2" fill="none" stroke-linecap="round"/>',
  orangecat: stickerArt('<path d="M6 36c-2-12 6-18 18-18s20 6 18 18c-1 5-8 6-18 6S7 41 6 36z" fill="#ffb36b"/><path d="M8 24L6 9l11 6m23 9 2-15-11 6" fill="#ffb36b"/><path d="M13 27q3 2 6 0m10 0q3 2 6 0" fill="none"/><path d="M22 32q2 2 4 0" fill="none"/><path d="M20 17v3m4-4v4m4-3v3" fill="none" stroke="#e0883a"/><ellipse cx="11" cy="32" rx="3" ry="1.5" fill="#ff9aa8" stroke="none"/><ellipse cx="37" cy="32" rx="3" ry="1.5" fill="#ff9aa8" stroke="none"/><path d="M36 8h5l-5 5h5" fill="none"/>'),
  esteh: stickerArt('<path d="M30 3l-4 14" fill="none" stroke-width="3"/><path d="M10 12h28l-3 30H13z" fill="#e9b27a"/><path d="M11 20h26l-1.5 20h-23z" fill="#c9803f" stroke="none"/><rect x="13" y="22" width="8" height="7" rx="2" fill="#fff6e6" opacity=".8"/><rect x="26" y="28" width="8" height="7" rx="2" fill="#fff6e6" opacity=".8"/><rect x="8" y="9" width="32" height="5" rx="2.5" fill="#fff4d6"/><path d="M18 31h.1m11 0h.1" stroke-width="3"/><path d="M22 34q2 2 4 0" fill="none"/><ellipse cx="15" cy="34" rx="2.5" ry="1.5" fill="#ff8fa8" stroke="none"/><ellipse cx="33" cy="34" rx="2.5" ry="1.5" fill="#ff8fa8" stroke="none"/>'),
  bakso: stickerArt('<circle cx="24" cy="26" r="18" fill="#e7cfae"/><circle cx="16" cy="22" r="6.5" fill="#fff"/><circle cx="32" cy="22" r="6.5" fill="#fff"/><circle cx="17" cy="23" r="2.6" fill="#68465f"/><circle cx="31" cy="23" r="2.6" fill="#68465f"/><ellipse cx="24" cy="35" rx="3.5" ry="4" fill="#b9605f"/><path d="M9 13l4 3m26-3-4 3M24 4v4" fill="none" stroke="#b78a5a"/>'),
  peacehand: stickerArt('<path d="M16 26V8a3.5 3.5 0 017 0v12" fill="#ffd9bd"/><path d="M23 22V5a3.5 3.5 0 017 0v17" fill="#ffd9bd"/><path d="M30 24v-2a3 3 0 016 0v8c0 9-6 14-14 14h-6c-8 0-12-5-12-12v-4c0-3 3-4 5-2l3 3V14a3 3 0 016 0z" fill="#ffd9bd"/><path d="M19 36h.1m10 0h.1" stroke-width="3"/><path d="M22 40q2 2 4 0" fill="none"/><ellipse cx="15" cy="39" rx="2.5" ry="1.5" fill="#ff9aa8" stroke="none"/><ellipse cx="33" cy="39" rx="2.5" ry="1.5" fill="#ff9aa8" stroke="none"/>'),
  brokenheart: stickerArt('<path d="M24 42C4 28 2 14 12 9c6-3 11 1 12 6 1-5 6-9 12-6 10 5 8 19-12 33z" fill="#ff9bb8"/><path d="M24 15l-4 7 6 4-5 7" fill="none" stroke-width="2.2"/><path d="M13 21h.1m6 6h.1" stroke-width="3"/><path d="M28 28q3 3 6 0" fill="none"/><path d="M6 4l3 3m33-3-3 3" fill="none" stroke="#d39a52"/>'),
  sleepypillow: stickerArt('<path d="M6 14q18-6 36 0 3 14 0 22-18 6-36 0-3-8 0-22z" fill="#d7caf3"/><path d="M14 25q3 2 6 0m8 0q3 2 6 0" fill="none"/><path d="M22 31q2 2 4 0" fill="none"/><ellipse cx="12" cy="30" rx="3" ry="1.5" fill="#ffb4cb" stroke="none"/><ellipse cx="36" cy="30" rx="3" ry="1.5" fill="#ffb4cb" stroke="none"/><path d="M33 5h6l-6 6h6" fill="none"/>'),
  bubsalting: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#ffc9dd"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="36" lengthAdjust="spacingAndGlyphs">salting!</text>'),
  bubmager: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#d9ccf5"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="35" lengthAdjust="spacingAndGlyphs">mager</text>'),
  bubgabut: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#cfe9dd"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="35" lengthAdjust="spacingAndGlyphs">gabut</text>'),
  bubbestie: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#ffe3a8"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="36" lengthAdjust="spacingAndGlyphs">bestie</text>'),
  bubwkwk: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#c9e4ff"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="28" lengthAdjust="spacingAndGlyphs">wkwk</text>'),
  bubhealing: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#d8f0c4"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="36" lengthAdjust="spacingAndGlyphs">healing</text>'),
  bubnocap: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#ffd3bf"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="36" lengthAdjust="spacingAndGlyphs">no cap</text>'),
  bubbucin: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#ffb8d0"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="35" lengthAdjust="spacingAndGlyphs">bucin</text>'),
  laptopcapek: stickerArt('<rect x="10" y="7" width="28" height="21" rx="3" fill="#c9d7f5"/><rect x="13" y="10" width="22" height="15" rx="2" fill="#fff"/><path d="M5 31h38l-3 6H8z" fill="#b8c6e6"/><path d="M18 22h.1m12 0h.1" stroke-width="3"/><path d="M21 26q3-2 6 0" fill="none"/><path d="M16 16h8m-8 3h5" fill="none" stroke="#b8c6e6"/><path d="M38 6q3 2 0 5" fill="none"/>'),
  kopimelek: stickerArt('<path d="M10 14h26l-3 27c0 3-2 4-5 4H18c-3 0-5-1-5-4z" fill="#f5e6d3"/><path d="M11 22h24l-2 14H13z" fill="#8c5a3c" stroke="none"/><path d="M36 19h3c4 0 4 9 0 9h-3" fill="none"/><rect x="8" y="10" width="30" height="5" rx="2.5" fill="#fff4d6"/><path d="M16 4q-3 3 0 5m9-5q-3 3 0 5" fill="none" stroke="#baa9cc"/><circle cx="18" cy="27" r="3" fill="#fff" stroke="none"/><circle cx="28" cy="27" r="3" fill="#fff" stroke="none"/><path d="M18 23h.1m10 0h.1" stroke-width="3"/><path d="M22 31q2 2 4 0" fill="none"/>'),
  jamngantuk: stickerArt('<circle cx="24" cy="27" r="15" fill="#ffd9a8"/><path d="M12 14l-6-6m30 6 6-6" fill="none" stroke="#d39a52" stroke-width="2.5"/><circle cx="15" cy="8" r="5" fill="#ffe9c7"/><circle cx="33" cy="8" r="5" fill="#ffe9c7"/><path d="M16 27q2 2 4 0m8 0q2 2 4 0" fill="none"/><path d="M22 34q2 2 4 0" fill="none"/><path d="M14 38l-3 4m23-4 3 4" fill="none" stroke="#d39a52"/><ellipse cx="12" cy="34" rx="2.5" ry="1.5" fill="#ffb4cb" stroke="none"/><ellipse cx="36" cy="34" rx="2.5" ry="1.5" fill="#ffb4cb" stroke="none"/><path d="M38 3v5m-2-2h4" fill="none"/>'),
  skripsibuku: stickerArt('<path d="M7 8h17c3 0 4 2 4 4v27c0 0-2-2-5-2H7z" fill="#b8d4f0"/><path d="M41 8H24c-3 0-4 2-4 4v27c0 0 2-2 5-2h16z" fill="#d7e8fb"/><path d="M12 16h7m-7 4h5" fill="none" stroke="#fff"/><path d="M28 16h7m-7 4h5" fill="none" stroke="#fff"/><path d="M16 27q1-2 3 0m8 0q1-2 3 0" fill="none"/><path d="M19 33q2-2 4 0" fill="none"/><path d="M36 5q-2 4 0 6q2-2 0-6z" fill="#9ad3ff"/>'),
  kalenderpanik: stickerArt('<rect x="7" y="9" width="34" height="32" rx="5" fill="#fff"/><path d="M7 14a5 5 0 015-5h24a5 5 0 015 5v3H7z" fill="#ff8c8c"/><path d="M16 5v7m16-7v7" fill="none" stroke-width="3"/><path d="M14 24h.1m20 0h.1" stroke-width="3"/><circle cx="14" cy="26" r="2.5" fill="#fff" stroke="none"/><path d="M19 33q2-3 5 0t5 0" fill="none"/><path d="M38 19q-2 4 0 6q2-2 0-6z" fill="#9ad3ff"/>'),
  sandalsenang: stickerArt('<path d="M8 22c0-7 5-10 16-10s16 3 16 10v6c0 9-4 15-16 15S8 37 8 28z" fill="#ffc9a5"/><path d="M14 14c3 5 4 8 0 14m20-14c-3 5-4 8 0 14" fill="none" stroke="#e0a46e"/><path d="M16 22q2-2 4 0m8 0q2-2 4 0" fill="none"/><path d="M20 29q4 4 8 0" fill="none"/><ellipse cx="13" cy="30" rx="2.5" ry="1.5" fill="#ff9aa8" stroke="none"/><ellipse cx="35" cy="30" rx="2.5" ry="1.5" fill="#ff9aa8" stroke="none"/><path d="M36 6l3 3-3 3m-6-6 3 3-3 3" fill="none"/>'),
  bubbegadang: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#d9ccf5"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="36" lengthAdjust="spacingAndGlyphs">begadang</text>'),
  bubskripsi: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#ffe3a8"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="36" lengthAdjust="spacingAndGlyphs">skripsi</text>'),
  bubdeadline: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#ffc9dd"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="36" lengthAdjust="spacingAndGlyphs">deadline</text>'),
  bubweekend: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#cfe9dd"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="36" lengthAdjust="spacingAndGlyphs">weekend</text>'),
  bubotw: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#c9e4ff"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="21" lengthAdjust="spacingAndGlyphs">otw</text>'),
  bubsantuy: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#d8f0c4"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="36" lengthAdjust="spacingAndGlyphs">santuy</text>'),
  bubcapek: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#ffd3bf"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="35" lengthAdjust="spacingAndGlyphs">capek</text>'),
  bubrebahan: stickerArt('<path d="M10 12h28a8 8 0 018 8v6a8 8 0 01-8 8H27l-5 7-1-7H10a8 8 0 01-8-8v-6a8 8 0 018-8z" fill="#ffb8d0"/><text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" font-family="Trebuchet MS, Arial, sans-serif" fill="#68465f" stroke="none" textLength="36" lengthAdjust="spacingAndGlyphs">rebahan</text>'),
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

/* Format string tanggal ISO 'YYYY-MM-DD' sesuai format bahasa. */
export function formatDate(iso, lang = 'id') {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  const fmt = DATE_FORMATS[lang] || DATE_FORMATS.id;
  return fmt.replace('YYYY', m[1]).replace('MM', m[2]).replace('DD', m[3]);
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

