# Snappie Studio 📸 — Web Photo Booth (Vite)

Aplikasi web photo booth: ambil foto dari **kamera** atau **galeri**, pilih
**filter** (18) & **bingkai** (26 tema), tambah **stiker/emoji/teks**, lalu
**unduh PNG** atau **bagikan ke sosmed**. Tanpa backend — semua diproses di browser.

## Fitur
- Kamera: ganti depan/belakang, toggle mirror, hitung mundur (0/3/5/10 dtk), flash & suara on/off
- Tata letak 1 / 3 / 4 / 6 foto; urutkan dengan drag; hapus / jepret ulang satu foto
- Impor dari galeri (bisa menimpa slot tertentu)
- Filter: 18 pilihan (modal grid + preview), **per-foto** — pilih thumbnail lalu ganti filternya
- 26 tema bingkai (pastel, film, neon, Y2K, chrome, manga, ulang tahun, wisuda, wedding, lebaran, dll) — dipilih lewat modal grid 4×4 dengan preview
- Stiker karakter & emoji dengan **gestur jari** (1 jari pindah, 2 jari zoom+putar, tahan untuk hapus)
- Text box bisa dipindah (multi), tanggal opsional, watermark
- Toggle "Mode Mobile Responsive"
- Preferensi tersimpan di localStorage
- Bagikan: Web Share API + Instagram/WhatsApp/Facebook/TikTok

## Struktur
```
vite-app/
├── index.html          # entry HTML (meta/OG + favicon inline SVG)
├── vite.config.js      # base './' + vite-plugin-singlefile (output 1 file)
├── eslint.config.js    # flat config ESLint
├── package.json
├── src/
│   ├── main.js         # logika aplikasi (kamera, galeri, filter, stiker, share)
│   ├── style.css       # styling + tema bingkai + mode mobile
│   ├── data.js         # filter, tema, karakter, caption, util
│   └── composer.js     # komposer canvas untuk unduh PNG
└── test/               # unit test (node:test)
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
- `dist/` **di-`.gitignore`** — dihasilkan lewat `npm run build`; hasilnya satu file `index.html` yang bisa dibuka langsung.
- Karakter stiker adalah gambar orisinal (SVG), bukan karakter berhak cipta.
