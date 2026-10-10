# CMS dua halaman dengan lokasi pengunjung

Tanggal: 2026-10-10

## Yang berubah
- **Login (`/cms`)**: `public/cms.html` sekarang hanya form login. Kredensial diperiksa ke `/api/admin/stats`; jika berhasil, kredensial disimpan di sessionStorage dan halaman pindah ke dashboard.
- **Jumlah pengunjung (`/cms/dashboard`)**: `public/cms-dashboard.html` menampilkan total browser unik, jumlah negara dan kota, serta tabel lokasi dengan jumlah dan porsi. Tombol Keluar dan Reset tersedia. Sesi yang tidak valid mengarahkan kembali ke login.
- **Gaya bersama**: `public/cms.css`.
- **Server (`server/visitor-counter.js`)**: saat kunjungan pertama, IP klien dari `X-Forwarded-For` dicocokkan dengan basis data offline DB-IP Lite (`GEOIP_DB_PATH`). Yang disimpan hanya kode negara, nama negara, dan kota. IP tidak disimpan. Endpoint baru `GET /api/admin/locations` (dilindungi Basic Auth oleh Caddy). Kolom baru ditambahkan otomatis saat startup.
- **Dependensi**: `maxmind@5.0.7` (pembaca MMDB).
- **Deploy**: rute `/cms/dashboard` ditambahkan ke Caddyfile produksi; unit service memuat `GEOIP_DB_PATH`. Template `deploy/update-caddy-counter.py` dan dokumen deploy ikut diperbarui.

## Cara verifikasi
- `npm run lint`: lulus.
- `npm test`: 48 test lulus, termasuk test baru untuk lokasi dari `X-Forwarded-For` dan agregasi lokasi.
- `npm run build`: berhasil; `dist/` memuat `cms.html`, `cms-dashboard.html`, dan `cms.css`.
- Produksi: `/cms` dan `/cms/dashboard` mengembalikan 200 dengan halaman yang benar; `/api/admin/locations` tanpa kredensial mengembalikan 401; kolom `country_code`, `country`, `city` ada di SQLite produksi; service `snappiestudio-counter` aktif.

## Batasan dan tindak lanjut
- Pengunjung yang sudah tercatat sebelum fitur ini tidak punya lokasi dan tampil sebagai "Tidak diketahui". Lokasi hanya dicatat untuk kunjungan baru.
- Lokasi berasal dari IP dan bersifat perkiraan (misalnya pengguna VPN atau seluler bisa tampil di kota yang keliru).
- Basis data DB-IP Lite harus diperbarui secara berkala (lihat `docs/visitor-counter-deploy.md`). Lisensi CC BY 4.0 mensyaratkan atribusi; sudah ditampilkan di dashboard.
- Verifikasi login dengan kredensial admin di produksi belum dilakukan oleh agen, untuk menghindari kunjungan uji yang mengubah hitungan asli.
