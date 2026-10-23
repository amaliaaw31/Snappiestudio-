# AGENTS.md

Panduan singkat untuk agen/kontributor yang bekerja di repo ini.

## Perintah penting
- `npm install` — pasang dependensi
- `npm run dev` — dev server (http://localhost:5173; layanan counter lokal perlu `npm run start:counter`)
- `npm run start:counter` — API counter dan CMS (localhost:3001)
- `npm run build` — build produksi ke `dist/` (single file `index.html`)
- `npm run preview` — coba hasil build (http://localhost:4173)
- `npm run lint` — ESLint untuk `src/` dan `test/`
- `npm test` — unit test (`node --test`, tanpa dependensi tambahan)

Selalu jalankan `npm run lint`, `npm test`, dan `npm run build` setelah mengubah kode.

## Deploy
- Pengguna menghendaki setiap perubahan situs langsung dideploy setelah pemeriksaan lulus.
- Situs produksi `https://snappiestudio.com` dilayani Caddy dari `/var/www/snappie`.
- Setelah build berhasil, salin hasilnya dengan `sudo -n cp -a dist/. /var/www/snappie/` (folder produksi dimiliki administrator dan memerlukan akses tulis di luar workspace), lalu verifikasi situs produksi sudah memuat perubahan.
- Jalankan penyalinan tersebut melalui `sudo -n bash scripts/deploy.sh`. Skrip mencadangkan situs, memasang CSP hasil build, memvalidasi konfigurasi, menyalin dist, lalu reload Caddy. Jangan deploy dengan penyalinan saja: hash CSP header harus sesuai HTML terbaru.
- Lanjutkan deploy tanpa menanyakan konfirmasi tambahan kepada pengguna; tetap patuhi izin yang diwajibkan sistem.

## Git
- Pengguna mengaktifkan auto-commit dan push setelah pemeriksaan lulus. Commit hanya berkas terkait pekerjaan yang dikerjakan; jangan sertakan perubahan lain yang belum disetujui.
- Gunakan remote SSH `git@github.com:amaliaaw31/Snappiestudio-.git` dan konfigurasi key lokal repo; jangan ubah konfigurasi SSH global.

## Penghitung pengunjung
- `server/visitor-counter.js` — API jumlah browser unik tersimpan di SQLite.
- `public/cms.html` — login admin; backend memproteksi seluruh alias dashboard dan `/api/admin/*` dengan cookie sesi HttpOnly dan CSRF.
- Login CMS mengaktifkan pengecualian visitor untuk browser admin, termasuk menghapus kunjungan sebelumnya dari total. Pengecualian berupa hash UUID dan tetap berlaku setelah reset counter.
- Produksi menjalankan `snappiestudio-counter.service`; database tinggal di `/var/lib/snappiestudio-counter`.
- Setiap browser mengirim UUID acak sekali-sekali; server hanya menyimpan SHA-256-nya. Foto tidak ikut dikirim.
- CMS juga mengelola musim stiker (`SEASON_IDS` di `server/site-config.js` harus sama dengan `SEASONS` di `src/data.js`), tautan dukungan (hanya `trakteer.id` dan `ko-fi.com`), jadwal pengumuman, statistik penggunaan (`usage_daily`), dan peringatan lonjakan/penurunan kunjungan di monitor (`server/traffic-alert.js`).
- Laporan PDF harian ke Discord: `snappiestudio-daily-report.timer` (00.10 WIB, ulang 00.40 dan 01.40) menjalankan `scripts/cms-jobs.mjs daily-report [--force]`; pembuatnya `server/daily-report.js` dan `server/pdf-document.js` (tanpa dependensi). Memakai `CMS_DISCORD_WEBHOOK`, bukan token bot. Unit baru dipasang dengan `sudo -n bash deploy/install-maintenance.sh`.
- PWA: `src/sw.template.js` dibangkitkan menjadi `dist/sw.js` oleh `vite.config.js` (versi dan daftar precache otomatis). Worker tidak boleh menyentuh `/api`, `/cms`, permintaan non-GET, atau respons `no-store`. Setelah mengubahnya jalankan `node scripts/verify-offline.mjs http://127.0.0.1:4173/` (Chrome dengan `--remote-debugging-port=9337`) selain `npm test`. FAQ di halaman utama memakai kunci `faq.*` dan JSON-LD FAQPage di `index.html`; ubah keduanya bersamaan.
- Perubahan backend memerlukan `sudo -n systemctl restart snappiestudio-counter` setelah deploy; sesi admin yang ada berakhir.
- Saat mengubah autentikasi, routing server, atau CSP, baca `SECURITY.md` dan jalankan tes keamanan. Pertahankan jalur CMS melalui backend; CSP produksi dibuat otomatis saat build.

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
- Panggilan data ke backend hanya: penghitung pengunjung (`/api/visitors`), pengumuman (`/api/site-content`), pengaturan musim stiker dan tautan dukungan dari CMS (`/api/site-config`, dibaca saja), dan hitungan penggunaan anonim (`/api/events`: nama kejadian, id tema, id filter). Jangan kirim foto, teks pengguna, atau ID browser lewat endpoint selain penghitung; browser admin (mode maintenance) tidak mengirim hitungan penggunaan.
