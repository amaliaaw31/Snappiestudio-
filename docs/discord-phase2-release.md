# FASE 2: backup dan notifikasi

Kode dikembangkan pada branch `codex/discord-phase2` di checkout terpisah agar timer produksi tidak memuat skrip yang belum disetujui. Pengujian memakai snapshot sementara dan jaringan tiruan. Belum ada registrasi command, restart backend, perubahan unit/Caddy, pesan produksi, backup produksi, restore, atau penghapusan snapshot produksi.

## Command

- `/backup status`: hasil dan waktu backup terakhir, verifikasi saat backup, jumlah/ukuran snapshot terbaru, hasil verifikasi manual, serta status pengiriman monitor. Lokasi hanya disebut penyimpanan lokal VPS; path dan data akun tidak ditampilkan. Waktu menggunakan UTC yang ditandai jelas.
- `/backup history`: maksimal sepuluh ID snapshot beserta ukurannya. Riwayat tidak mengklaim integritas hanya karena file tersedia.
- `/backup verify snapshot:ID`: snapshot terbaru bila ID tidak diisi. Sumber dibaca oleh Node worker terpisah tanpa shell, dengan batas 256 MiB dan 1,5 detik. Checksum, manifest, integritas SQLite, jumlah baris, akun, serta key diperiksa. UNKNOWN berarti belum dapat diverifikasi; tidak boleh dianggap valid. Tidak membuat backup baru, restore, atau mengubah sumber. Satu worker per backend diizinkan; hasil ditulis ke file status privat terpisah.
- `/alert test konfirmasi:True`: mengirim satu pesan uji ke webhook Discord yang telah dikonfigurasi. Tanpa True, tidak ada pengiriman. Cooldown 15 menit tersimpan dan berlaku juga pada kegagalan/hasil belum dikonfirmasi. Pesan tidak menyertakan konfigurasi, URL webhook, atau identitas pengunjung.

Semua command memakai signature, aplikasi, guild, kanal, dan pengguna yang sudah diizinkan. Balasan tetap berupa pesan channel biasa. Pengujian source dan worker hanya dilakukan pada fixture selama pengembangan. Batas worker menjaga respons command tetap singkat; snapshot besar atau pemeriksaan lambat memerlukan peninjauan operasional terpisah, bukan pengabaian verifikasi.

## Backup dan alert otomatis

Versi ini menghentikan penghapusan otomatis snapshot di luar 14 terbaru. Direktori staging sementara tetap dibersihkan; snapshot selesai tidak dipangkas. Ruang disk dapat terus bertambah sehingga pemilik perlu menentukan pembersihan secara eksplisit.

Monitor memakai timer lima menit yang sudah ada. Tidak menambah daemon atau melakukan restart otomatis. Backup harian pukul 02.30 WIB dianggap terlambat bila keberhasilan terakhir belum mencakup jadwal yang seharusnya berjalan, dengan toleransi dua jam. Batas umur 48 jam tetap menjadi batas tambahan. Perubahan waktu timer perlu diselaraskan dengan aturan monitor ini pada rilis yang sama.

Issue mencakup backup terakhir gagal, backup terlambat, verifikasi saat backup tidak terkonfirmasi, hasil verifikasi manual gagal, serta disk backup kurang dari 10% atau tidak dapat diperiksa. Kegagalan manual tetap tercatat per snapshot sampai snapshot yang sama lulus lagi; UNKNOWN tidak menghapus kegagalan lama. Ini bukan verifikasi ulang otomatis seluruh arsip.

Notifikasi memakai deduplikasi keadaan dan cooldown 15 menit untuk perubahan incident serta retry gagal. Recovery pertama setelah incident yang sudah dikonfirmasi terkirim dapat dikirim segera. Bila Discord tidak terjangkau, status kegagalan disimpan lokal dan pemeriksaan lain tetap berjalan. Bot tidak dapat menjamin pemberitahuan kegagalan Discord melalui Discord itu sendiri. `/backup status` menampilkan hasil pengiriman terakhir; pemantau luar host tetap diperlukan untuk host yang mati total.

## Sebelum aktivasi

1. Tinjau diff branch ini dan hasil tes. Jangan menyalin seluruh checkout ke produksi karena workspace utama memiliki pekerjaan lain.
2. Siapkan revisi kode backend/monitor/backup sebelumnya sebagai rollback. Tidak perlu restore database atau menjalankan backup produksi sebagai bagian pengujian.
3. Minta persetujuan untuk memasang kode baru, memuat ulang backend, dan mengaktifkan perubahan monitor/backup. Menyalin kode ke direktori kerja service membuat timer berikutnya memakainya; itu termasuk aktivasi produksi. Sesi CMS akan berakhir setelah restart backend.
4. Setelah izin rilis, gunakan `sudo bash deploy/configure-discord-bot.sh --plan-phase2` pada checkout rilis yang sudah ditinjau. Token hanya pada prompt tersembunyi di VPS. Rencana seharusnya memilih dua nama: backup dan alert.
5. Setelah backend aktif, gunakan `--register-phase2`, lalu ulangi `--plan-phase2`. Target verifikasi adalah created/updated kosong dan kedua nama berada pada unchanged. Mode FASE 2 tidak menulis command FASE 1, pengumuman, atau migrasi.
6. Uji status/history dari Discord. Verifikasi snapshot produksi dan pengiriman `/alert test` memerlukan persetujuan tindakan tersebut; jangan menjalankannya hanya untuk membuktikan unit test lulus. Tidak ada restore atau pemindahan data yang disediakan command ini.

## Risiko dan rollback

Rollback mengembalikan revisi kode yang konsisten tanpa menghapus snapshot, statistik, akun, maupun jadwal. Perhatikan bahwa versi sebelum FASE 2 masih memiliki pemangkasan 14 snapshot; jangan mengembalikan perilaku itu tanpa keputusan eksplisit pemilik. Penghentian kode penghapusan harus dipertahankan jika rollback fitur bot/monitor dilakukan terpisah. File hasil verifikasi dan cooldown bersifat tambahan; tidak perlu dihapus saat rollback.

Command baru yang sudah terdaftar tidak dihapus otomatis. Kendalikan rollback command secara terarah, tanpa bulk overwrite. Tidak ada perubahan DNS, firewall, permission luas, atau konfigurasi Caddy yang diperlukan.
