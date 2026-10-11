# Keamanan Snappie Studio

## CMS dan sesi

Semua alias dashboard (`/cms/dashboard`, `/cms/dashboard/`, `/cms-dashboard.html`) dilayani backend setelah validasi sesi. `/cms` merupakan halaman login publik. Semua endpoint `/api/admin/*`, selain login, memerlukan sesi server; operasi POST juga memerlukan origin yang diizinkan dan token CSRF.

Password diverifikasi dengan bcrypt. Produksi membaca hash dari `CMS_PASSWORD_HASH_FILE`, di luar web root dan repo. Jangan menaruh password atau hash produksi dalam commit. Tanpa hash yang valid, login ditolak. Username dan password lama dipertahankan saat migrasi.

Cookie `__Host-snappie_cms` memakai Secure, HttpOnly, SameSite=Strict, dan Path=/. Token sesi disimpan sebagai hash di memori server. Sesi berakhir setelah 30 menit tidak aktif, maksimal 8 jam, saat logout, atau ketika layanan restart. Login berikutnya merotasi sesi browser tersebut. Password tidak disimpan dalam localStorage/sessionStorage.

Login dibatasi 5 percobaan per IP selama 15 menit, 30 percobaan global per menit, dan dua verifikasi bcrypt bersamaan. API visitor dibatasi 120 permintaan per IP per menit. Pembatas ini mengurangi penyalahgunaan; serangan terdistribusi masih memerlukan proteksi pada jaringan/proxy penyedia hosting.

## Mode maintenance

Login CMS otomatis mendaftarkan UUID browser admin ke `excluded_browsers`, menghapus kunjungan UUID tersebut dari tabel visitor, dan menyimpan flag maintenance lokal. Browser ini selanjutnya hanya mengambil total dengan GET. Backend tetap menolak menghitung UUID yang dikecualikan meskipun flag lokal hilang. Reset counter mempertahankan pengecualian. Browser atau perangkat lain harus login CMS sendiri. Menghapus semua data situs menghasilkan UUID baru sehingga perlu login kembali.

## Deploy dan konfigurasi

Blok routing/header Snappie berada di `deployment/snappie.caddy`. Produksi mengimpornya dari `/etc/caddy/snappie-security.caddy`. Halaman CMS dan semua `/api/*` harus diproxy ke backend, termasuk alias file HTML. Jangan melayani dashboard langsung dengan file_server.

Build menambahkan CSP dengan hash skrip inline yang tepat ke index.html; setiap build menghitung ulang hash. CMS menggunakan skrip module terpisah dan CSP yang menolak skrip inline. Style inline tetap diizinkan di aplikasi foto karena editor memakai gaya dinamis. Header proxy menambahkan HSTS, anti-framing, nosniff, kebijakan referer dan pembatasan fitur browser.

Setelah perubahan, jalankan lint, unit test, build, dan npm audit. Salin dist ke produksi, validasi konfigurasi Caddy sebelum reload, lalu periksa akses anonim dashboard/API ditolak, header keamanan muncul, dan aplikasi foto tetap berjalan. Setelah perubahan backend, restart `snappiestudio-counter` agar kode baru aktif; sesi admin yang ada akan berakhir.

Contoh variabel tersedia di `.env.example`. Untuk pengembangan CMS lokal, gunakan hash password khusus pengembangan, SITE_DIRECTORY yang menunjuk dist, dan SITE_ORIGINS yang sesuai origin localhost. Jangan gunakan kredensial produksi dalam tes.

## Batas proteksi

Foto tetap diproses di browser. Database visitor menyimpan hash UUID, lokasi kasar, waktu kunjungan pertama/terakhir, dan aktivitas per browser per jam untuk statistik harian, tanpa menyimpan IP. Kunjungan ulang memperbarui aktivitas saat situs dibuka kembali. Reset dan pengecualian browser admin juga menghapus aktivitas terkait. Pembatas permintaan menyimpan hash IP dalam memori dengan masa berlaku terbatas.

Laporan, filter, pagination, grafik, dan ekspor CSV hanya tersedia melalui `/api/admin/*` setelah validasi sesi. Ekspor mengikuti filter dan mencakup semua halaman, tanpa mengirim hash/UUID browser atau IP; sel CSV di-escape dan awalan formula dinetralkan. Pembaruan otomatis dashboard berhenti saat tab disembunyikan atau setelah 5 menit tanpa interaksi, agar polling tidak mempertahankan sesi tanpa batas saat admin meninggalkan halaman.

Proteksi ini tidak menjamin kebal peretasan. MFA belum diterapkan. Gunakan password admin yang panjang dan unik, lakukan pembaruan dependensi/server secara berkala, serta simpan backup di luar host untuk pemulihan bencana. Layanan lain pada host bersama memerlukan audit terpisah.

Referensi: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [Caddy response headers](https://caddyserver.com/docs/caddyfile/directives/header).
