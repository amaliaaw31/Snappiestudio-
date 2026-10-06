# AGENTS.md

Panduan singkat untuk agen/kontributor yang bekerja di repo ini.

## Perintah penting
- `npm install` — pasang dependensi
- `npm run dev` — dev server (http://localhost:5173)
- `npm run build` — build produksi ke `dist/` (single file `index.html`)
- `npm run preview` — coba hasil build (http://localhost:4173)
- `npm run lint` — ESLint untuk `src/` dan `test/`
- `npm test` — unit test (`node --test`, tanpa dependensi tambahan)

Selalu jalankan `npm run lint`, `npm test`, dan `npm run build` setelah mengubah kode.

## Arsitektur
- **Tanpa framework**: HTML + ES module + Canvas. Tidak ada TypeScript.
- `src/data.js` — data murni (filter, tema, caption, karakter SVG, `dateLine`, `filterCss`). Ini inti yang di-unit-test.
- `src/composer.js` — menggambar ulang bingkai ke `<canvas>` untuk unduhan PNG; harus konsisten dengan preview HTML.
- `src/main.js` — semua logika UI/DOM: kamera, galeri, filter, layout, stiker, share, preferensi.
- `src/style.css` — seluruh styling, termasuk tema bingkai (`.th-<id>`) & swatch (`.sw-<id>`).

## Konvensi saat menambah TEMA BARU
Perlu ubah 3 tempat agar tampil di preview **dan** PNG:
1. `src/data.js` → tambah entri di `THEMES` (id, name) dan `CAPTIONS` (id).
2. `src/composer.js` → cabang `t === '<id>'` untuk background, border slot, caption (jika ada), warna watermark, dan `DATE_COLORS`.
3. `src/style.css` → `.sw-<id>` (swatch), `.th-<id>.frame-outer`, `.th-<id> .frame/.slot/.caption`, warna watermark/date.

## Konvensi saat menambah FILTER BARU
- Cukup tambah entri di `FILTERS` (`src/data.js`). Preview & composer otomatis memakai `filterCss(id)`.

## Catatan
- State foto: `state.photos` berisi objek `{ canvas, filter }` (bukan canvas langsung).
- Stiker punya `type`: `char` | `emoji` | `text`; interaksi pakai pointer gestures di `attachStickerGestures`.
- Tak ada backend; jangan tambahkan panggilan jaringan untuk data pengguna.
