# Hardening website dan CMS

Perubahan meliputi sesi CMS, pembatasan penulisan counter, kebijakan browser, akses berkas sensitif, service, dan jalur deploy. Akun admin tetap memakai konfigurasi privat yang sudah ada. Tidak ada password atau hash yang dimasukkan ke repo.

## Masalah dan perbaikan

1. Request dengan CSRF salah memperbarui waktu aktivitas sebelum otorisasi selesai. Tes menunjukkan sesi masih aktif setelah 31 menit tanpa aktivitas sah. Waktu sesi sekarang diperbarui setelah origin dan CSRF lulus; tes yang sama menuntut HTTP 401 sesudah batas idle.
2. Pembatas counter sebelumnya hanya berlaku per IP. Tes 601 POST dengan beberapa IP tetap menerima semua penulisan. Sekarang maksimal 600 POST per menit berlaku untuk seluruh situs, selain batas 120 permintaan per IP. HTTP 429 menyertakan Retry-After. GET total dan login tetap tersedia ketika kuota penulisan global habis.
3. CSP penuh website utama hanya terdapat dalam meta HTML. Build kini juga menghasilkan snippet CSP HTTP dengan hash skrip yang sama. Header melarang event handler inline, membatasi koneksi ke origin sendiri, dan mempertahankan sumber foto lokal, blob, serta worker yang dibutuhkan editor. Pendekatan header dan hash mengikuti [panduan CSP OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html).
4. Matcher sensitif belum mencakup SQLite WAL/SHM, key/hash, konfigurasi, dan direktori sumber internal. Sebelumnya path WAL yang tidak ada jatuh ke fallback aplikasi HTTP 200; ini bukan bukti database pernah terbuka. Path tersebut sekarang ditolak HTTP 404 sebelum file_server.
5. Installer lama masih membentuk rute Basic Auth dan dashboard statis. Installer sekarang mempertahankan akun dari file privat dan memakai rute backend dengan sesi. Updater lama berhenti tanpa menulis konfigurasi. Tidak ada hash yang diterima lewat argumen command line.

## Service, CI, dan deploy

Service counter berjalan dengan UMask 0077, capability kosong, PrivateDevices, proteksi pengaturan/modul kernel dan control groups, pembatasan SUID/SGID, serta address family UNIX/IPv4/IPv6. SQLite, WAL, dan SHM memakai izin 0600. Ini membatasi dampak proses dalam lingkup service; aplikasi lain pada host tidak diubah.

CI memiliki token contents:read, tidak menyimpan kredensial checkout, dan memeriksa kerentanan produksi high/critical. Pemeriksaan audit lokal melaporkan 0 kerentanan.

`scripts/deploy.sh` memasang CSP sesuai build, memvalidasi Caddy, mencadangkan situs/snippet, menyalin dist, lalu reload. Kegagalan langkah deploy memulihkan berkas sebelumnya. Prosedur dan kewajiban deploy melalui skrip tercatat di AGENTS.md agar CSP header tidak tertinggal dari HTML. Sintaks import/header mengikuti [dokumentasi Caddy](https://caddyserver.com/docs/caddyfile/directives/import).

## CMS sesuai website utama

Wordmark memakai The Magic Cookie, tagline memakai Orange Lovely, dan favicon mengikuti website utama. Build menghasilkan `cms-brand.css` yang mengacu pada aset font yang sama. Tombol tema menampilkan Material Symbols Rounded matahari atau bulan sesuai mode; subset dua glyph disajikan lokal beserta lisensinya. Tombol tetap memiliki nama aksesibel, status aria-pressed, serta fokus keyboard. Label login menjadi Username dan Password; nilai awal username tetap kosong.

## Bukti verifikasi

- Dua tes regresi baru gagal sebelum patch dan lulus setelah patch.
- `npm run lint`, 75 tes, `npm run build`, `npm audit`, dan `git diff --check` lulus.
- `bash -n` untuk kedua skrip deploy dan `systemd-analyze verify` untuk unit service lulus.
- Caddy memvalidasi konfigurasi sebelum reload. Header produksi memuat hash yang sesuai seluruh skrip inline dalam HTML.
- Browser produksi menolak skrip sisipan, event handler inline, dan koneksi lintas origin melalui CSP.
- Berkas SQLite/WAL/SHM, key/hash, konfigurasi CSP, dan sumber internal ditolak HTTP 404. API admin tanpa sesi ditolak HTTP 401.
- Login akun yang sama, dashboard, dan laporan berhasil. Origin asing dan logout tanpa CSRF ditolak HTTP 403. Logout sah mencabut sesi; cookie tetap Secure, HttpOnly, dan SameSite=Strict.
- Uji website utama mencakup izin kamera, galeri, bingkai, tema, ekspor PNG, layout 3/4/6 foto, share, serta navigasi keyboard. Tidak ada exception browser yang tidak tertangani.
- CMS diuji pada lebar 320 sampai 1440 piksel, dalam mode terang dan gelap. Font merek dan simbol dimuat dari origin sendiri; kontras teks merek serta batas simbol lulus pemeriksaan.
- Verifikasi autentikasi tidak menjalankan reset atau pengecualian visitor. Total produksi tetap 25 sebelum dan sesudah hardening.

Cadangan SQLite dan unit awal: `/var/backups/snappiestudio/security-20261022T153602Z`. Cadangan deploy akhir: `/var/backups/snappiestudio/deploy-AxxUDnX4`. Sinkronisasi deploy diulang setelah ditemukan dashboard lama sempat menimpa berkas produksi; dashboard akhir dibandingkan dengan sumber dan identik.

Log browser utama: `/tmp/snappie-security-main-browser-final.log`. Pemeriksaan CSP dan tampilan produksi: `/tmp/snappie-verify-security-browser.mjs`. Uji lokal CMS memakai database dan akun khusus tes. Foto, IP, password, hash, cookie, serta token CSRF tidak dicetak dalam hasil pemeriksaan.
