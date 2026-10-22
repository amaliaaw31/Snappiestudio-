# Deploy counter dan CMS

CMS memakai sesi server dengan cookie HttpOnly, bukan HTTP Basic Auth. Seluruh `/api/*` dan alias halaman CMS harus diteruskan ke backend. Jangan menyajikan `cms-dashboard.html` melalui file_server. Konfigurasi yang berlaku terdapat di `deployment/snappie.caddy` dan `SECURITY.md`.

## Konfigurasi privat

Simpan username dan path file bcrypt dalam `/etc/snappiestudio/counter.env` sesuai `.env.example`. File bcrypt standar berada di `/etc/snappiestudio/cms-password.hash`. Direktori memakai izin 0750; kedua file memakai 0640, dimiliki root dengan grup ubuntu agar service dapat membacanya. Jangan memasukkan password atau hash ke argumen shell, repo, atau web root. Installer mempertahankan konfigurasi akun yang sudah ada.

Unit `deploy/snappiestudio-counter.service` memakai checkout `/home/ubuntu/projects/project-yaya/Snappiestudio-`. Database berada di `/var/lib/snappiestudio-counter/visitors.sqlite`. Hash UUID, negara, provinsi/wilayah, kota, dan aktivitas kunjungan tersimpan tanpa IP atau foto. Lokasi berasal dari DB-IP City Lite lokal pada path `GEOIP_DB_PATH`; perbarui basis data bulanan dan pertahankan atribusi DB-IP.

## Build dan deploy situs

1. Jalankan `npm run lint`, `npm test`, `npm run build`, dan `npm audit`.
2. Pastikan site block Snappie dalam `/etc/caddy/Caddyfile` mengimpor `/etc/caddy/snappie-security.caddy`. Pertahankan site block domain lain.
3. Jalankan `sudo -n bash scripts/deploy.sh`. Skrip mencadangkan situs dan snippet Caddy, memasang snippet keamanan serta CSP yang dihasilkan build, memvalidasi konfigurasi, menyalin `dist/.` ke `/var/www/snappie/`, dan reload Caddy. Kegagalan memulihkan berkas sebelumnya.
4. Periksa kesamaan HTML produksi, header CSP, penolakan akses dashboard anonim, serta alur kamera/galeri dan CMS. Jangan menguji reset pada data produksi.

Jangan menyalin dist saja: CSP header memuat hash skrip inline yang harus sesuai build HTML. Build menghasilkan `dist/snappie-app-csp.caddy`, yang dipasang ke `/etc/caddy/snappie-app-csp.caddy`. Akses HTTP ke berkas konfigurasi ini diblokir.

## Pasang atau perbarui layanan

Setelah konfigurasi privat, import Caddy, dan build tersedia, jalankan `sudo bash deploy/install-visitor-counter.sh` tanpa argumen. Installer tidak menerima kredensial dari command line dan tidak membuat rute Basic Auth. Installer men-deploy situs melalui skrip di atas, memasang unit service, lalu restart layanan. Restart mengakhiri sesi CMS; pengguna login kembali dengan akun yang sama.

SQLite bertahan saat deploy. Cadangkan dengan SQLite backup API, bukan menyalin file database aktif tanpa WAL. Direktori cadangan produksi berada di `/var/backups/snappiestudio` dan hanya dapat diakses root. UMask 0077 melindungi berkas baru milik layanan. Simpan salinan cadangan terpisah dari host untuk pemulihan bencana.

Skrip lama `deploy/update-caddy-counter.py` sengaja berhenti tanpa menulis konfigurasi, agar tidak mengaktifkan kembali dashboard statis atau HTTP Basic Auth.
