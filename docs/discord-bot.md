# Bot Discord untuk pengumuman dan jadwal migrasi

Bot menerima perintah slash dan mengirim pengingat melalui webhook Discord yang sudah dikonfigurasi. Bot tidak membaca percakapan bebas, tidak menjalankan shell dari chat, dan tidak memindahkan data server. Fitur pengumuman manual dan jadwal tetap bisa digunakan bersamaan, dengan satu jadwal migrasi yang belum ditutup pada satu waktu.

## Pemasangan pertama

1. Buka [Discord Developer Portal](https://discord.com/developers/applications), buat aplikasi untuk Snappie Studio.
2. Pada General Information, salin Application ID dan Public Key.
3. Pada halaman Bot, siapkan token bot. Jangan kirim token melalui chat. Token hanya dipakai untuk mendaftarkan perintah dan tidak disimpan di server.
4. Aktifkan Developer Mode di Discord agar dapat menyalin ID server, kanal perintah, dan akun Discord yang boleh memakai bot. Pakai kanal admin yang sesuai kebutuhan Anda. Pengingat dikirim ke kanal webhook notifikasi yang sudah ada.
5. Jalankan di server:

```sh
cd /home/ubuntu/projects/project-yaya/Snappiestudio-
sudo bash deploy/configure-discord-bot.sh
```

6. Isi Application ID, Public Key, server ID, channel ID, dan user ID yang diizinkan. Untuk beberapa akun, pisahkan user ID dengan koma. Script menampilkan tautan untuk memasang aplikasi pada server Discord; buka tautan itu sebelum melanjutkan. Scope aplikasi hanya `applications.commands`, tanpa izin administrator bot dan tanpa koneksi Gateway.
7. Tempel token pada prompt tersembunyi. Script mendaftarkan `/status`, `/pengumuman`, dan `/migrasi`, lalu menyimpan konfigurasi ID/public key dengan izin privat. Token tidak menjadi argumen proses, tidak dicetak, dan tidak disimpan. Jika pendaftaran gagal, konfigurasi sebelumnya tetap dipertahankan; jalankan ulang setelah izin dan pemasangan aplikasi benar.
8. Pada General Information di Developer Portal, isi Interactions Endpoint URL:

```text
https://snappiestudio.com/api/discord/interactions
```

Simpan. Discord menguji tanda tangan dan PING endpoint. Jika ditolak, cocokkan Public Key dan Application ID aplikasi dengan konfigurasi yang baru diisi.

Perintah secara default hanya terlihat bagi administrator server Discord. Untuk memberi akses pada akun lain yang ada di allowlist, atur izin perintah aplikasi melalui pengaturan Integrations di Discord. Pemeriksaan server tetap membatasi user ID, server, dan kanal yang dikonfigurasi, meskipun seseorang memiliki izin administrator Discord. Bot menggunakan HTTP interactions; status kehadiran online bukan indikator apakah perintah berfungsi.

## Perintah manual

```text
/pengumuman pasang pesan:Website sedang dalam pemeliharaan judul:Informasi layanan
/pengumuman status
/pengumuman hapus
```

Pesan maksimal 500 karakter, judul maksimal 80. Teks diperlakukan sebagai teks biasa. Semua balasan perintah tampil sebagai pesan biasa pada kanal yang dikonfigurasi, terlihat bagi anggota yang memiliki akses kanal, dan tersimpan sampai dihapus. Balasan sementara yang sudah dikirim sebelumnya tidak berubah. Pengumuman publik tampil pada pembukaan website dan diperbarui setiap satu menit ketika tab aktif. Menutup pengumuman tidak membuat pesan yang sama muncul berulang pada tab tersebut; pesan baru tetap muncul.

## Pengingat dan pengumuman otomatis

Contoh format berikut menggunakan tanggal contoh; ganti dengan waktu yang masih akan datang:

```text
/migrasi jadwalkan waktu:2026-11-01 22:00 pesan:Pemeliharaan server dijadwalkan malam ini judul:Pemeliharaan pengingat_menit:60 otomatis:True
```

- Waktu memakai WIB, format `YYYY-MM-DD HH:mm`, minimal satu menit dan maksimal 365 hari ke depan.
- `pengingat_menit` bawaan 60; boleh 1–10080 menit. Jika waktu pengingat sudah lewat saat jadwal dibuat, pengingat dikirim pada pemeriksaan berikutnya.
- `otomatis` bawaan True. Bot mengirim pengingat sebelum waktu mulai dan menampilkan pesan di website saat jadwal tiba.
- Jika hanya ingin pengingat Discord, pilih `otomatis:False`.
- Jika waktu mulai sudah tiba sebelum pengingat sempat terkirim, bot mengirim pesan bahwa waktunya sudah tiba dan melewati pengingat yang sudah terlambat.

Bot mengembalikan ID jadwal. Setelah migrasi yang Anda kerjakan selesai:

```text
/migrasi status
/migrasi selesai id:ID_DARI_BOT
```

Untuk membatalkan:

```text
/migrasi batal id:ID_DARI_BOT
```

Selesai/batal menghentikan pengumuman otomatis jadwal tersebut. Pengumuman manual yang sudah ada sebelumnya tetap dipertahankan. Bot tidak mendeteksi apakah pemindahan data benar-benar sudah dilakukan; tanda selesai berasal dari perintah Anda.

## Ketahanan dan aturan saat terjadi perubahan

Pekerja `snappiestudio-migrations.timer` memeriksa jadwal setiap satu menit. Pengumuman pada tab website yang sudah terbuka biasanya mengikuti dalam sekitar dua menit: satu interval pekerja ditambah satu interval pembaruan tab. Jadwal tersimpan di SQLite dan bertahan setelah restart. Pengumuman otomatis tidak menulis ulang file pengumuman manual: backend memilih pengumuman jadwal aktif hanya selama pengumuman manual belum berubah.

Jika pengumuman diubah melalui CMS atau perintah manual setelah jadwal dibuat, jadwal otomatis dilewati agar tidak menimpa perubahan itu. Gunakan `/migrasi batal` atau `/migrasi selesai` untuk menutup jadwal yang masih menunggu sebelum membuat pengganti. Jadwal yang baru diproses lebih dari 24 jam setelah waktu mulai juga dilewati. Jadwal yang sudah aktif tetap memerlukan selesai/batal untuk ditutup.

Kegagalan pengiriman Discord tidak menghalangi pengumuman website. Pengiriman dicoba ulang, tanpa mengulang pesan yang sudah dikonfirmasi tersimpan. Lease mencegah dua pekerja mengirim pesan yang sama bersamaan; jika proses mati setelah Discord menyimpan pesan tetapi sebelum konfirmasi disimpan lokal, pesan bisa terkirim ulang. Kanal forum mengikuti `thread_id` yang sudah dipasang pada webhook notifikasi.

CMS → Pengaturan → Bot Discord dan jadwal migrasi menampilkan konfigurasi, waktu pemeriksaan terakhir, pengingat yang gagal, dan jadwal terbaru. Konfigurasi aplikasi belum menjamin endpoint sudah dipasang pada Developer Portal; uji `/pengumuman status` setelah langkah pemasangan lengkap.

## Memeriksa website dengan /status

Jalankan `/status` pada kanal dan akun yang sudah diizinkan. Bot menjawab di kanal dengan hasil website, `/api/visitors`, dan `/api/site-content`: OK beserta waktu respons, gangguan HTTP, atau tidak dapat diverifikasi. Pemeriksaan berlangsung dari server saat perintah dijalankan; hasil ini bukan riwayat uptime dan tidak menjamin koneksi dari semua lokasi.

Pemeriksaan memakai HEAD untuk halaman utama dan GET untuk dua API publik. Alamat tujuan tetap, redirect ditolak, dan tiap pemeriksaan dibatasi 1,5 detik secara paralel. Tidak ada login CMS, penambahan pengunjung, perubahan pengumuman, pemeriksaan kredensial, atau pembacaan informasi privat server. Jika backend bot sendiri mati, bot tidak dapat menjawab `/status`; gunakan pemantau terpisah untuk kondisi tersebut.

Command baru perlu didaftarkan pada aplikasi dan server Discord yang sama. Setelah kode backend baru diaktifkan melalui prosedur rilis Anda, jalankan kembali:

```sh
sudo bash deploy/configure-discord-bot.sh
```

Gunakan Application ID, Public Key, server, kanal, dan daftar pengguna yang sama. Masukkan token hanya pada prompt tersembunyi di VPS. Skrip membandingkan definisi command guild dan hanya memperbarui nama yang berubah atau belum ada; tidak menghapus command aplikasi lainnya. Token tidak disimpan. Tidak perlu membuat bot, endpoint, atau webhook baru. Pembaruan kode handler memerlukan pemuatan kode baru oleh proses backend; perubahan konfigurasi saja langsung dibaca pada permintaan berikutnya. Penambahan ini tidak menjalankan restart layanan secara otomatis.

## Operasi dan pemulihan

```sh
systemctl status snappiestudio-migrations.timer
sudo systemctl start snappiestudio-migrations.service
```

Konfigurasi bot berada di `/etc/snappiestudio/discord-bot.json`, root:ubuntu 0640, dan dibaca ulang pada setiap permintaan sehingga penggantian konfigurasi tidak memerlukan restart backend. Isinya hanya ID, allowlist, dan public key. Token bot tidak diperlukan saat runtime. Endpoint mati tertutup jika konfigurasi hilang atau tidak valid.

Backup mencakup jadwal, cache interaction, audit, serta konfigurasi bot bila tersedia. Saat memulihkan backup, periksa jadwal aktif sebelum menyalakan timer; tutup jadwal lama yang tidak lagi relevan. Tinjau kembali allowlist setelah pemulihan. Menghentikan timer tidak menghapus pengumuman yang sudah aktif; selesaikan/batalkan jadwal atau ubah pengumuman manual di CMS untuk menghentikannya.

Referensi: [HTTP interactions dan tanda tangan Discord](https://docs.discord.com/developers/interactions/overview), [application commands](https://docs.discord.com/developers/interactions/application-commands).

Perubahan visibilitas balasan berlaku pada command baru setelah backend memuat kode terbaru. Tidak perlu mendaftarkan ulang command untuk perubahan ini karena nama dan opsi command tetap sama. Mention tetap dinonaktifkan pada balasan.

## Fase 1: pemeriksaan read-only

Command tambahan: `/website`, `/server`, `/ssl`, `/logs`, dan `/uptime`. `/status` tetap tersedia dan menambahkan status handler bot. Semua command memakai verifikasi signature, aplikasi, guild, kanal, dan user yang sama. Respons berupa pesan channel biasa; jangan menganggap isi channel privat bagi pemanggil saja.

- `/status` memeriksa website dan dua API publik. Bot UP berarti handler menerima command terautentikasi tersebut, bukan bukti koneksi Gateway atau kesehatan semua fungsi bot.
- `/website` hanya memeriksa HTTP halaman utama dan waktu respons. Keduanya memakai tujuan tetap, menolak redirect, dan membatasi jaringan 1,5 detik, termasuk pembacaan body API.
- UP berarti respons valid; durasi mulai 1.000 ms menjadi DEGRADED. Respons HTTP selain 200 atau payload tidak valid menjadi DEGRADED. Kegagalan jaringan pertama menjadi UNKNOWN. Dua kegagalan jaringan/HTTP 5xx berturut-turut dalam lima menit dapat menjadi DOWN untuk endpoint tersebut. Keberhasilan mereset penghitung. Riwayat kecil ini hanya dalam memori proses; bukan riwayat uptime dan tidak menyimpulkan seluruh VPS mati.
- `/server` mengambil selisih waktu CPU dalam sampel 150 ms, persentase RAM terpakai termasuk cache OS, serta disk tempat data aplikasi berada. Nilai 90% atau lebih menandakan DEGRADED; metrik yang tidak tersedia dilaporkan UNKNOWN. Tidak menampilkan hostname, IP, nama proses, atau path server.
- `/ssl` membuka koneksi TLS terverifikasi hanya ke `snappiestudio.com:443`, dengan batas waktu total 1,2 detik. Hasil menampilkan tanggal kedaluwarsa UTC dan sisa hari. Masa berlaku di bawah 14 hari menjadi DEGRADED. Verifikasi atau koneksi gagal menghasilkan UNKNOWN; tidak mencetak isi sertifikat atau error mentah.
- `/logs` menghitung login CMS gagal selama 24 jam dan membaca status terakhir monitor, backup, serta scheduler. Ini ringkasan sumber yang diizinkan, bukan seluruh error aplikasi. Tidak membaca journal sistem atau mengembalikan log mentah. Waktu catatan disertakan; status lama bukan hasil probe baru.
- `/uptime` menampilkan uptime host dan lama dua layanan aktif. Satu-satunya proses eksternal adalah `systemctl show` untuk layanan backend Snappie dan Caddy yang namanya tetap, dengan timeout 700 ms dan output terbatas. Tidak tersedia aksi restart, deploy, shell, atau layanan dari input pengguna. DOWN di sini dapat berarti layanan secara eksplisit inactive/failed, bukan kesimpulan dari satu timeout HTTP.

Command baru perlu didaftarkan pada aplikasi dan guild lama saat rilis disetujui. Tidak ada registrasi, notifikasi percobaan, restart, perubahan Caddy, atau deployment produksi dalam tahap pengembangan lokal ini. Mode `--plan-phase1` membaca rencana tanpa menulis. Mode `--register-phase1` hanya menyinkronkan enam nama command FASE 1 yang berbeda atau belum ada, memakai konfigurasi aplikasi/guild lama. Jangan menjalankan setup hanya untuk menguji kode lokal.

Rencana aktivasi: review hasil lint/tes/build dan diff berkas bot, siapkan revisi kode sebelumnya, lalu muat kode backend serta daftarkan command baru hanya setelah persetujuan rilis. Perubahan ini tidak menambah tabel atau mengubah data statistik. Rollback mengembalikan berkas backend ke revisi sebelumnya; tidak menghapus tabel, jadwal, atau backup. Command baru yang terlanjur terdaftar harus dikelola secara terarah setelah persetujuan, tanpa bulk overwrite yang menghapus command lama. Aktivasi/rollback proses backend mengakhiri sesi CMS aktif.

Persiapan aktivasi terarah, pemeriksaan, dan rollback dijelaskan di [Panduan rilis FASE 1](discord-phase1-release.md). Registrasi tidak memuat ulang proses backend atau mengirim pesan ke channel.
