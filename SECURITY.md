# Keamanan Snappie Studio

## CMS dan sesi

Semua alias dashboard (`/cms/dashboard`, `/cms/dashboard/`, `/cms-dashboard.html`) dilayani backend setelah validasi sesi. `/cms` merupakan halaman login publik. Semua endpoint `/api/admin/*`, selain login, memerlukan sesi server; operasi POST juga memerlukan origin yang diizinkan dan token CSRF.

Password diverifikasi dengan bcrypt. Saat pertama dijalankan, produksi membaca hash dari `CMS_PASSWORD_HASH_FILE`, lalu menyimpan akun pada `cms-account.json` di direktori database. Perubahan password berikutnya memakai akun persisten ini, bukan hash bootstrap. Keduanya berada di luar web root dan repo. Jangan menaruh password atau hash produksi dalam commit. Tanpa hash yang valid, login ditolak. Username dan password lama dipertahankan saat migrasi.

Cookie `__Host-snappie_cms` memakai Secure, HttpOnly, SameSite=Strict, dan Path=/. Token sesi disimpan sebagai hash di memori server. Sesi berakhir setelah 30 menit tidak aktif, maksimal 8 jam, saat logout, atau ketika layanan restart. Login berikutnya merotasi sesi browser tersebut. Password tidak disimpan dalam localStorage/sessionStorage.

Login dibatasi 5 percobaan per IP selama 15 menit, 30 percobaan global per menit, dan dua verifikasi bcrypt bersamaan. API visitor dibatasi 120 permintaan per IP per menit. Pembatas ini mengurangi penyalahgunaan; serangan terdistribusi masih memerlukan proteksi pada jaringan/proxy penyedia hosting.

Penulisan counter juga dibatasi secara global menjadi 600 POST per menit, termasuk jika sumber berganti IP. Batas ini tidak memblokir GET total atau login CMS. Request yang gagal pemeriksaan CSRF tidak memperpanjang waktu tidak aktif sesi.

## Mode maintenance

Login CMS otomatis mendaftarkan UUID browser admin ke `excluded_browsers`, menghapus kunjungan UUID tersebut dari tabel visitor, dan menyimpan flag maintenance lokal. Browser ini selanjutnya hanya mengambil total dengan GET. Backend tetap menolak menghitung UUID yang dikecualikan meskipun flag lokal hilang. Reset counter mempertahankan pengecualian. Browser atau perangkat lain harus login CMS sendiri. Menghapus semua data situs menghasilkan UUID baru sehingga perlu login kembali.

## Deploy dan konfigurasi

Blok routing/header Snappie berada di `deployment/snappie.caddy`. Produksi mengimpornya dari `/etc/caddy/snappie-security.caddy`. Halaman CMS dan semua `/api/*` harus diproxy ke backend, termasuk alias file HTML. Jangan melayani dashboard langsung dengan file_server.

Build menambahkan CSP dengan hash skrip inline yang tepat ke index.html; setiap build menghitung ulang hash. CMS menggunakan skrip module terpisah dan CSP yang menolak skrip inline. Style inline tetap diizinkan di aplikasi foto karena editor memakai gaya dinamis. Header proxy menambahkan HSTS, anti-framing, nosniff, kebijakan referer dan pembatasan fitur browser.

Build juga menghasilkan `dist/snappie-app-csp.caddy` untuk CSP HTTP website utama. Header menolak event handler inline dan skrip tanpa sumber/hash yang diizinkan, sementara koneksi data tetap dibatasi ke origin sendiri. Font CMS hanya diizinkan dari origin sendiri; gambar juga mengizinkan data URL untuk QR autentikator lokal; font merek dan favicon digunakan bersama website utama dan dua simbol tema disajikan lokal. Jalur berkas internal, key/hash, konfigurasi, SQLite, serta berkas WAL/SHM ditolak oleh Caddy.

Deploy situs memakai `sudo -n bash scripts/deploy.sh`, yang mencadangkan berkas situs dan snippet Caddy, memasang CSP sesuai build, memvalidasi konfigurasi sebelum reload, dan memulihkan berkas sebelumnya jika gagal. Jangan menyalin dist saja setelah CSP HTTP diaktifkan. Installer lama tidak lagi menerima hash melalui argumen command line atau membuat dashboard statis/Basic Auth. Prosedur pemasangan terdapat di `docs/visitor-counter-deploy.md`.

Setelah perubahan, jalankan lint, unit test, build, dan npm audit. Salin dist ke produksi, validasi konfigurasi Caddy sebelum reload, lalu periksa akses anonim dashboard/API ditolak, header keamanan muncul, dan aplikasi foto tetap berjalan. Setelah perubahan backend, restart `snappiestudio-counter` agar kode baru aktif; sesi admin yang ada akan berakhir.

Layanan counter memakai UMask 0077, tanpa capability kernel, serta pembatasan akses perangkat dan pengaturan kernel. Berkas database, WAL, dan SHM yang ada harus memakai izin 0600. CI menolak kerentanan high/critical pada dependensi produksi melalui `npm audit --omit=dev --audit-level=high`.

Contoh variabel tersedia di `.env.example`. Untuk pengembangan CMS lokal, gunakan hash password khusus pengembangan, SITE_DIRECTORY yang menunjuk dist, dan SITE_ORIGINS yang sesuai origin localhost. Jangan gunakan kredensial produksi dalam tes.

## Batas proteksi

Foto tetap diproses di browser. Database visitor menyimpan hash UUID, lokasi kasar (negara, provinsi/wilayah, kota), waktu kunjungan pertama/terakhir, dan aktivitas per browser per jam untuk statistik harian, tanpa menyimpan IP. Lokasi dibaca dari basis data GeoIP lokal saat kunjungan pertama; IP tidak dikirim ke penyedia GeoIP. Provinsi yang tidak tersedia, termasuk pada catatan lama, tetap kosong dan tidak ditebak dari nama kota. Kunjungan ulang memperbarui aktivitas saat situs dibuka kembali. Reset dan pengecualian browser admin juga menghapus aktivitas terkait. Pembatas permintaan menyimpan hash IP dalam memori dengan masa berlaku terbatas.

Laporan, filter, pagination, grafik, dan ekspor CSV hanya tersedia melalui `/api/admin/*` setelah validasi sesi. Ekspor mengikuti filter dan mencakup semua halaman, tanpa mengirim hash/UUID browser atau IP; sel CSV di-escape dan awalan formula dinetralkan. Pembaruan otomatis dashboard berhenti saat tab disembunyikan atau setelah 5 menit tanpa interaksi, agar polling tidak mempertahankan sesi tanpa batas saat admin meninggalkan halaman.

Proteksi ini tidak menjamin kebal peretasan. 2FA tersedia tetapi baru aktif setelah admin mengonfirmasi kode aplikasi autentikator di pengaturan akun. Gunakan password admin yang panjang dan unik, lakukan pembaruan dependensi/server secara berkala, serta simpan backup di luar host untuk pemulihan bencana. Layanan lain pada host bersama memerlukan audit terpisah.

Referensi: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [Caddy response headers](https://caddyserver.com/docs/caddyfile/directives/header).

## Pengaturan akun dan 2FA

Pengaturan akun memerlukan password saat ini; ketika 2FA aktif, perubahan juga memerlukan kode autentikator atau kode pemulihan. Password baru minimal 12 karakter dan maksimal 72 byte UTF-8. Perubahan password dan keluar dari semua perangkat mencabut seluruh sesi, termasuk sesi pemohon. Username tetap mengikuti akun yang sudah dibuat.

Pendaftaran 2FA memakai TOTP enam digit, periode 30 detik, dan toleransi satu periode. QR dibuat lokal tanpa layanan eksternal. Pendaftaran berlaku 10 menit dan belum aktif sebelum kode dikonfirmasi. Seed disimpan terenkripsi AES-256-GCM dengan `cms-key.bin` terpisah; kedua berkas privat memakai izin 0600. Kode TOTP tidak dapat dipakai ulang. Sepuluh kode pemulihan ditampilkan sekali, hanya hash yang disimpan, dan setiap kode berlaku sekali. Penggantian kode pemulihan membatalkan seluruh set lama. Perubahan 2FA mencabut sesi lain serta merotasi cookie dan CSRF sesi pemohon. Percobaan autentikasi ulang dibatasi seperti login.

Jangan menghapus `cms-account.json` atau `cms-key.bin` untuk mereset akun. Kehilangan salah satu berkas harus dipulihkan dari backup yang sama. Aplikasi menolak kembali ke password bootstrap jika akun hilang tetapi key masih ada. Jangan menjalankan versi backend lama yang hanya membaca hash bootstrap setelah password atau 2FA diubah: itu dapat mengembalikan password lama atau melewati 2FA.

## Pemeliharaan otomatis

Jalankan `sudo bash deploy/install-maintenance.sh` setelah backend baru aktif dan akun persisten terbentuk. Pekerja systemd berjalan sebagai ubuntu dengan pembatasan sistem berkas, bukan root. Backup harian pukul 02.30 WIB memakai API backup SQLite agar transaksi WAL ikut tersalin. Snapshot mencakup database, akun, key, dan konfigurasi bootstrap privat; simpan direktori backup dengan izin 0700. Empat belas snapshot terakhir disimpan di `/var/lib/snappiestudio-backups`. Setiap snapshot diuji melalui salinan sementara, checksum, integritas SQLite, dekripsi seed bila aktif, dan jumlah baris. Status di CMS mencerminkan hasil aktual, termasuk kegagalan percobaan terakhir.

Verifikasi pemulihan tanpa menimpa produksi:

```sh
node scripts/maintenance.mjs verify-backup /var/lib/snappiestudio-backups/backup-TIMESTAMP-SUFFIX
```

Untuk pemulihan produksi, hentikan layanan counter, cadangkan direktori saat ini, verifikasi snapshot, lalu pulihkan `visitors.sqlite`, `cms-account.json`, dan `cms-key.bin` dari snapshot yang sama. Setelah layanan berhenti, pindahkan sidecar SQLite lama (`visitors.sqlite-wal` dan `visitors.sqlite-shm`) bersama salinan keadaan lama sebelum memasang database hasil pemulihan. Pastikan pemilik ubuntu:ubuntu dan izin 0600, lalu mulai layanan dan verifikasi login serta laporan. Pulihkan konfigurasi bootstrap hanya bila diperlukan, dengan izin privat semula. Pemulihan mengembalikan keadaan akun dan kode pemulihan pada waktu snapshot; segera rotasi password dan kode pemulihan setelah pemulihan. Simpan salinan terenkripsi di luar host secara terpisah; pengiriman ke host lain belum dikonfigurasi.

GeoIP diperbarui setiap tanggal 2 pukul 04.00 WIB dari DB-IP City Lite bulan berjalan. Unduhan dibatasi ukuran dan waktu, didekompresi, serta divalidasi sebelum penggantian atomik. SIGHUP memuat database baru tanpa memutus sesi. Kegagalan memulihkan berkas sebelumnya; lokasi historis tetap sebagaimana tercatat saat kunjungan. Timer persisten menjalankan pekerjaan yang terlewat saat host kembali hidup. Periksa `systemctl list-timers 'snappiestudio-*'` dan jurnal unit ketika status CMS menunjukkan kegagalan.

Perbandingan laporan memakai jumlah browser unik per periode, bukan penjumlahan harian. Periode sebelumnya memiliki panjang sama dan langsung mendahului periode terpilih. Tanpa filter tanggal, laporan membandingkan tujuh hari terakhir termasuk hari ini. Filter lokasi berlaku pada kedua periode; persentase tidak dihitung ketika periode sebelumnya nol.

## Fitur operasional CMS

Riwayat admin disimpan dalam tabel `cms_audit`, maksimal 10.000 kejadian dan 90 hari. Audit mencatat jenis kejadian dan waktu, bukan password, OTP, IP, token sesi, atau isi pengumuman. Reset kunjungan tidak menghapus audit. Daftar sesi menampilkan pengenal pencabutan yang tidak dapat digunakan sebagai cookie, waktu, dan nama browser ringkas dari User-Agent. Nama browser dapat dipalsukan; sesi dicabut hanya setelah autentikasi ulang. Sesi tetap berada di memori dan berakhir saat layanan restart.

Reset kini memerlukan JSON `{"confirmation":"RESET KUNJUNGAN"}` selain sesi, origin, dan CSRF. UI memakai dialog dengan input konfirmasi, tombol batal, dan Escape native. Klien lama yang tidak mengirim konfirmasi ditolak dengan 400/415; jangan menurunkan versi backend untuk menghindari konfirmasi.

Filter `province` mencocokkan nama provinsi secara tepat dan mengikuti laporan, grafik, perbandingan, CSV, serta jumlah baru/kembali. “Baru” berarti pertama tercatat pada periode terpilih; “kembali” berarti sudah tercatat sebelum awal periode. Data historis sebelum tracking aktif bisa belum lengkap. Kalender mengikuti bulan tanggal akhir, atau bulan berjalan, dan memakai filter lokasi. Perbandingan wilayah tidak boleh dijumlahkan jika wilayah saling mencakup. Preferensi laporan hanya menyimpan tanggal, pencarian lokasi, provinsi, dan jumlah baris di browser. Tidak ada kredensial dalam preferensi.

Ekspor PDF memakai dialog cetak browser: pilih **Simpan sebagai PDF**. Laporan mencakup ringkasan dan grafik dari filter yang sedang diterapkan. Tema cetak sementara terang agar grafik terbaca; preferensi tema pengguna tidak diubah. Arsip mingguan dan bulanan dibuat pukul 03.00 WIB melalui `snappiestudio-reports.timer`, untuk minggu dan bulan terakhir yang sudah selesai. Pembuatan idempoten dan menyimpan maksimal 104 arsip. CMS menampilkan 24 arsip terbaru dan menyediakan unduhan JSON. Arsip merupakan snapshot historis; reset kunjungan tidak menghapusnya.

Pengaturan konten saat ini mencakup judul dan pesan pengumuman situs. Judul maksimal 80 karakter, pesan maksimal 500 karakter; HTML tidak dijalankan. Endpoint publik `/api/site-content` hanya mengembalikan teks pengumuman dan status aktif. Foto dan identitas browser tidak dikirim ke endpoint ini. Skrip pengumuman memakai origin sendiri; kegagalan API tidak menghalangi aplikasi foto. Pengumuman terlihat pada pembukaan halaman berikutnya dan dapat ditutup. Berkas privat `site-content.json` disertakan dalam backup bila tersedia.

Monitor dijalankan setiap lima menit oleh `snappiestudio-monitor.timer`, terpisah dari backend. Monitor memeriksa respons situs utama, layanan counter, integritas database, ruang disk di bawah 10%, umur backup lokal di atas 48 jam, serta GeoIP di atas 45 hari. Pemantauan dari host yang sama tidak dapat memberi tahu jika seluruh host mati; pemantauan luar host memerlukan layanan terpisah. Notifikasi mengirim transisi gangguan/pemulihan, tidak mengulang keadaan sama yang sudah terkirim, dan mencoba lagi bila pengiriman gagal.

## Aktivasi backup luar server dan notifikasi

Fitur eksternal belum aktif tanpa tujuan dan kredensial yang disediakan pemilik. Konfigurasi privat tinggal di `/etc/snappiestudio/maintenance.env`, pemilik root:ubuntu dan mode 0640. Jangan masukkan token atau private key ke repo maupun chat. Contoh variabel terdapat dalam `.env.example`; unit membaca berkas tersebut saat pekerjaan dimulai.

Implementasi awal backup luar server memakai SFTP melalui OpenSSH, dengan akun khusus, private key terpisah, dan host key yang sudah diverifikasi di `known_hosts` milik ubuntu. `StrictHostKeyChecking=yes` dan `BatchMode=yes` menolak host tak dikenal dan login interaktif. Tujuan berbentuk `backup@host:/direktori`; path tidak boleh berisi spasi atau karakter shell. Jangan gunakan key deploy Git untuk backup. Server tujuan harus sudah menyediakan direktori dengan izin privat. Kebijakan retensi salinan jarak jauh dikelola terpisah pada tujuan; pengunggah tidak menghapus berkas remote.

Setiap snapshot lokal diverifikasi, dibungkus tar, lalu dienkripsi AES-256-GCM sebelum diunggah. `CMS_BACKUP_KEY_FILE` menunjuk berkas kunci acak biner 32 byte, mode 0640 root:ubuntu atau 0600 ubuntu. Kunci tidak dimasukkan ke arsip yang dienkripsinya. Simpan salinan kunci di tempat aman di luar host secara terpisah; tanpa kunci, backup terenkripsi tidak dapat dipulihkan. `CMS_OFFSITE_SSH_KEY` menunjuk private key SFTP. Kegagalan unggahan tidak menghapus backup lokal dan dicatat dalam `offsite-status.json`.

Notifikasi awal menggunakan `CMS_ALERT_WEBHOOK` HTTPS yang menerima POST JSON `text`, `issues`, dan `at`. URL dan token tetap di server. Redirect tidak diikuti. Sesuaikan endpoint dengan kanal milik pemilik sebelum mengaktifkan. Jika penyedia membutuhkan payload khusus, tambahkan integrasi sesuai dokumentasi penyedia, lalu uji pengiriman dengan persetujuan pemilik kanal.

Dekripsi backup yang diambil dari server tujuan, memakai kunci terpisah:

```sh
CMS_BACKUP_KEY_FILE=/path/backup-encryption.key node scripts/cms-jobs.mjs decrypt backup.tar.enc restored.tar
```

Perintah menolak output yang sudah ada dan hanya menerbitkan plaintext setelah tag autentikasi benar. Ekstrak tar ke direktori kosong privat, jalankan `verify-backup` pada hasil ekstraksi, lalu ikuti prosedur pemulihan produksi di atas. Pemulihan penuh juga mencakup pengumuman bila tersedia. Arsip baru tetap kompatibel dengan verifier yang sudah menyertakan `site-content.json`; jangan gunakan verifier lama setelah file tersebut masuk snapshot. Migrasi tabel audit/laporan bersifat tambahan dan mempertahankan tabel visitor serta akun.


### Notifikasi Discord

Discord memakai `CMS_DISCORD_WEBHOOK`, dengan prioritas di atas webhook umum. URL harus HTTPS pada `discord.com`, mengikuti endpoint incoming webhook; query `thread_id` didukung untuk kanal forum. Pesan memakai `content` dan `allowed_mentions.parse=[]`. Pengirim memaksa `wait=true` dan hanya mencatat berhasil jika Discord mengembalikan ID pesan. Respons gagal, termasuk 429 atau balasan tanpa konfirmasi, tetap dicoba ulang pada pemeriksaan berikutnya. URL tidak masuk status CMS maupun pesan notifikasi. URL Discord yang sudah dipasang pada `CMS_ALERT_WEBHOOK` juga otomatis memakai format Discord.

Buat incoming webhook pada kanal Discord milik Anda, lalu jalankan di server:

```sh
sudo bash deploy/configure-discord.sh
```

Tempel URL pada prompt tersembunyi. Installer memvalidasi bentuk URL tanpa mengirim pesan, mempertahankan konfigurasi lain, dan memasang `maintenance.env` secara atomik dengan pemilik root:ubuntu serta izin 0640. URL tidak menjadi argumen command line, tidak tampil pada terminal, dan tidak ditulis dalam repo. Jangan kirim URL webhook melalui chat karena URL tersebut berisi token. Timer monitor memakai konfigurasi baru pada eksekusi berikutnya; restart backend tidak diperlukan. Jika belum ada gangguan, monitor tidak mengirim pesan pembuka atau mengklaim pengiriman sudah berhasil.

Referensi implementasi: [Discord Execute Webhook](https://docs.discord.com/developers/resources/webhook#execute-webhook).

## Bot Discord dan jadwal pengumuman

`/api/discord/interactions` merupakan endpoint terpisah dari login CMS. Setiap POST memerlukan tanda tangan Ed25519 atas timestamp dan body mentah, timestamp dengan selisih maksimal lima menit, serta payload maksimal 16 KiB. Caddy hanya menaikkan batas body pada rute ini; API lain tetap 2 KiB. PING bertanda tangan valid dijawab sesuai protokol Discord. Signature tidak valid mendapat 401. Perintah hanya diterima dari application ID, guild ID, channel ID, dan user ID dalam konfigurasi privat; akun bot dan DM ditolak. Balasan perintah memakai flag ephemeral dan menonaktifkan mention.

Cache interaction SQLite mencegah perintah yang dikirim ulang menjalankan mutasi dua kali. Perintah tidak menerima shell, SQL, path server, atau URL pengiriman. Jadwal dan pengumuman divalidasi dengan batas yang sama dengan CMS. Satu jadwal yang belum ditutup diizinkan untuk mencegah dua migrasi menimpa pengumuman. Tabel baru bersifat tambahan dan tidak menghapus data visitor/akun. Endpoint status `/api/admin/discord` tetap memerlukan sesi CMS.

Pekerja jadwal memakai akun ubuntu dan sandbox systemd seperti monitor. Pengumuman otomatis merupakan overlay dari jadwal SQLite, dengan fingerprint file pengumuman manual saat jadwal dibuat. Perubahan manual langsung mengambil alih dan tidak pernah ditimpa pekerja. Selesai/batal hanya menutup overlay jadwal tersebut. Pengingat menggunakan webhook Discord yang sudah ada dan selalu memerlukan konfirmasi ID pesan. Status pengiriman dan lease tersimpan agar percobaan ulang serta overlap pekerja dapat ditangani.

Konfigurasi bot hanya menyimpan ID, public key, dan allowlist; token bot hanya dimasukkan lewat prompt tersembunyi untuk pendaftaran perintah bernama. Pendaftaran tidak menghapus perintah aplikasi lainnya. Konfigurasi lama dipertahankan jika pendaftaran baru gagal. Berkas `discord-bot.json` ikut backup bila tersedia; verifier lama yang belum mengenal berkas ini tidak boleh dipakai untuk snapshot baru. Saat rollback, hentikan timer jadwal sebelum menjalankan backend lama; jangan menghapus tabel untuk rollback. Pengumuman manual tetap dapat dibaca backend lama, sedangkan overlay jadwal memerlukan versi backend ini.

Panduan pemasangan, perintah, ketepatan waktu, serta pemulihan ada di [docs/discord-bot.md](docs/discord-bot.md). Pemindahan data dan deteksi keberhasilan migrasi tidak dilakukan bot ini.

`/status` memakai verifikasi signature dan allowlist yang sama sebelum mengakses jaringan. Tujuannya tetap pada origin produksi untuk HEAD `/` serta GET `/api/visitors` dan `/api/site-content`; command tidak menerima URL pengguna. Redirect ditolak, pemeriksaan paralel dibatasi 1,5 detik, dan body API dibatasi 8 KiB serta divalidasi. Balasan privat hanya berisi label endpoint, status HTTP, dan durasi; isi respons serta detail exception tidak diteruskan. Pemeriksaan jaringan tidak menahan transaksi SQLite. Pembaruan ini tidak menjalankan restart layanan atau mengubah jaringan server.
