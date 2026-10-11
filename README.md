# Snappie Studio 📸 — Web Photo Booth (Vite)

Aplikasi web photo booth: ambil foto dari **kamera** atau **galeri**, pilih
**filter** (18) & **bingkai** (22 tema), atur **frame & warna custom**, tambah
**stiker/emoji/teks**, lalu **unduh PNG** atau **bagikan ke sosmed**.
Foto diproses di browser. Backend terpisah menangani counter anonim dan CMS admin. Mendukung **16 bahasa**.

## Fitur
- Kamera: ganti depan/belakang, toggle mirror, hitung mundur (0/3/5/10 dtk), flash & suara on/off
- Tata letak 1 / 3 / 4 / 6 foto; urutkan dengan drag; hapus / jepret ulang satu foto
- Impor dari galeri (bisa menimpa slot tertentu)
- Filter: 18 pilihan (modal grid + preview), **per-foto** — pilih thumbnail lalu ganti filternya
- 22 tema bingkai (pastel, cream, confetti, floral, neon, Y2K, film, midnight, chrome, scrapbook, digicam, coquette, aero, doodle, minimal, ulang tahun, wedding, lebaran, natal, valentine, baby shower, custom)
- **Frame custom**: warna background/gradien, outline, border slot, pattern, **palet rekomendasi**, input kode warna (HEX/RGB/CMYK) + **eyedropper**
- **Font kustom** (24) untuk caption, tanggal & stiker; spasi antar-huruf & tinggi baris otomatis per font
- Stiker karakter & emoji dengan **gestur jari** (1 jari pindah, 2 jari zoom+putar, tahan untuk hapus)
- Text box bisa dipindah (multi), tanggal opsional, watermark
- Bahasa: ID, EN, MS, AR, ES, FR, DE, PT, RU, JA, KO, ZH, HI, VI, TH, TR
- Mode gelap, toggle "Mode Mobile Responsive", preferensi tersimpan di localStorage
- Bagikan: Web Share API + Instagram/WhatsApp/Facebook/TikTok
- PWA (installable), SEO lengkap (meta/OG, sitemap, robots)

## Struktur
```
vite-app/
├── index.html            # entry HTML (meta/OG + favicon logo)
├── vite.config.js        # entry JS inline + CSP dengan hash otomatis
├── eslint.config.js      # flat config ESLint
├── package.json
├── public/               # aset statis: logo.png, og-icon.png,
│                         #   manifest.webmanifest, robots.txt, sitemap.xml
├── src/
│   ├── main.js           # logika aplikasi (kamera, galeri, filter, frame, stiker, share)
│   ├── style.css         # styling + tema bingkai + mode mobile
│   ├── data.js           # filter, tema, karakter, caption, util
│   ├── i18n.js           # terjemahan (16 bahasa)
│   ├── composer.js       # komposer canvas untuk unduh PNG
│   ├── assets/           # gambar (bg-start.svg, filter-sample.svg, bac.jpg)
│   └── fonts/            # font kustom (.ttf/.otf)
├── test/                 # unit test (node:test)
└── .github/workflows/    # CI (lint, test, build)
```

## Perintah
```bash
npm install
npm run dev        # dev server → http://localhost:5173
npm run build      # build ke dist/ (satu file index.html)
npm run preview    # coba hasil build → http://localhost:4173
npm run lint       # ESLint (src + test)
npm test           # unit test (node --test)
```

## Catatan
- Kamera butuh secure context: HTTPS, `localhost`, atau `file://` di Chrome.
- `dist/` **di-`.gitignore`** — dihasilkan lewat `npm run build`. Entry JS di-inline ke `index.html`; CSS, foto, font, dan chunk HEIC tetap berupa file terpisah. Aset `public/` disalin ke `dist/`.
- Login CMS otomatis mengaktifkan mode maintenance agar browser admin tidak dihitung sebagai visitor. Lihat `SECURITY.md` untuk autentikasi dan deploy backend.
- Logo/favicon: `public/logo.png`.
- Karakter stiker adalah gambar orisinal (SVG), bukan karakter berhak cipta.
