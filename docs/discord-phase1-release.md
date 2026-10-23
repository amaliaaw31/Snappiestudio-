# Rencana aktivasi FASE 1 bot Discord

Dokumen ini merupakan persiapan rilis, bukan bukti fitur sudah aktif. Jangan menjalankan registrasi atau restart sebelum pemilik menyetujui aktivasi produksi. Pengujian pengembangan memakai mock; tidak memakai token, registrasi, atau pesan Discord nyata.

## Cakupan perubahan

Kode diagnostik berada pada commit `75b30e5`. Lima command baru adalah `/website`, `/server`, `/ssl`, `/logs`, dan `/uptime`; `/status` menambahkan kondisi handler bot. Seluruh command tetap memakai aplikasi, endpoint, guild, kanal, allowlist, signature, serta pesan channel yang sama. Tidak ada perubahan skema database, timer, Caddy, DNS, firewall, atau dependensi.

Persiapan registrasi menambahkan GET daftar command guild sebelum penulisan. Perbandingan mencakup field definisi yang dikelola repo, termasuk opsi bertingkat, batas nilai, dan permission default. ID, versi, serta metadata Discord tidak menyebabkan registrasi ulang. Command tak berubah dilewati. Setiap perubahan memakai POST per nama; tidak ada bulk overwrite atau DELETE.

Mode FASE 1 hanya memilih `status`, `website`, `server`, `ssl`, `logs`, dan `uptime`. `/pengumuman`, `/migrasi`, serta command lain tidak ditulis oleh mode ini. Konfigurasi bot dibaca dari lokasi privat yang sama; tidak disimpan ulang atau diganti. Token masuk lewat stdin dari prompt tersembunyi dan tidak disimpan.

## Pemeriksaan sebelum aktivasi

1. Pastikan revisi yang akan dirilis sudah ditinjau. Periksa `git status`; jangan menimpa perubahan lokal pekerjaan lain.
2. Jalankan lint, unit test, build, pemeriksaan sintaks shell/Node, dan audit dependensi pada revisi tersebut. Gunakan checkout/release terpisah bila workspace mengandung pekerjaan lain.
3. Siapkan salinan kode rilis sebelumnya di luar web root. Revisi backend sebelum FASE 1 dapat ditelusuri dari parent `75b30e5`; jangan memakai reset Git yang menghapus pekerjaan lokal.
4. Periksa layanan dan endpoint publik secara read-only. Catat hasil sebagai baseline, bukan jaminan seluruh fungsi sehat.
5. Setelah izin untuk memakai API Discord diberikan, baca rencana berikut di terminal VPS:

```sh
cd /home/ubuntu/projects/project-yaya/Snappiestudio-
sudo bash deploy/configure-discord-bot.sh --plan-phase1
```

Tempel token bot yang sama pada prompt tersembunyi. Jangan tempel token ke chat, argumen perintah, atau berkas repo. Plan melakukan GET terautentikasi ke API Discord tanpa mengubah command atau konfigurasi server.

Hasil JSON berisi `created`, `updated`, `unchanged`, dan `dryRun`. Pada mode plan, `created`/`updated` adalah perubahan yang direncanakan, bukan perubahan yang sudah diterapkan. Jika `/status` sudah sesuai, biasanya hanya lima nama baru yang masuk `created`. Hasil aktual bergantung pada daftar Discord saat pemeriksaan. Jika GET gagal atau respons tidak valid, penulisan tidak dimulai. Jangan menganggap HTTP 403 cukup untuk menentukan penyebab spesifik.

## Langkah aktivasi setelah persetujuan

1. Pastikan plan sesuai cakupan dan kode backend telah tersedia pada revisi yang ditinjau.
2. Muat kode backend melalui prosedur rilis yang disetujui. Backend ini tidak memakai hot reload; restart yang disetujui mengakhiri sesi CMS aktif. Perubahan ini tidak memerlukan deploy website atau reload Caddy.
3. Periksa backend aktif, endpoint publik merespons, dan endpoint Discord tetap menolak request tanpa signature.
4. Daftarkan command yang berbeda:

```sh
sudo bash deploy/configure-discord-bot.sh --register-phase1
```

Mode tersebut membaca ulang daftar Discord, lalu membuat/memperbarui hanya nama FASE 1 yang berbeda. Ini memerlukan token pada prompt tersembunyi. Mode ini tidak melakukan restart, memodifikasi konfigurasi bot, atau mengirim notifikasi.

5. Jalankan kembali `--plan-phase1`. `created` dan `updated` harus kosong, dengan enam nama pada `unchanged`. Ini memverifikasi definisi yang terbaca dari Discord setelah sinkronisasi.
6. Pemilik menguji enam command read-only dari akun dan kanal yang diizinkan. Periksa pula `/pengumuman status` dan `/migrasi status` tanpa membuat, menghapus, atau menjalankan jadwal. Balasan tampil bagi anggota channel.

Registrasi tidak atomik: kegagalan setelah sebagian POST mungkin meninggalkan beberapa command sudah diperbarui. Skrip berhenti pada kegagalan dan tidak menghapus command sebagai kompensasi. Periksa plan lagi; pengulangan melewati definisi yang sudah sesuai. Daftar plan dapat berubah bila administrator lain mengubah command bersamaan; hindari registrasi paralel pada aplikasi yang sama.

## Risiko dan batas hasil

- Sesi CMS berakhir ketika backend direstart; memerlukan login ulang.
- Semua balasan merupakan pesan channel biasa. Ringkasan tidak boleh mencakup IP, hostname, path internal, environment, token, atau log mentah.
- Metrik memakai sistem tempat backend berjalan. Jika suatu sumber tidak tersedia, hasilnya UNKNOWN.
- Monitoring otomatis, notifikasi backup, pengiriman deployment, serta kendali layanan belum ditambah pada FASE 1.
- DOWN jaringan memerlukan kegagalan berulang sesuai batas FASE 1; bukan diagnosis pasti bahwa VPS mati.

## Rollback

Jika backend gagal setelah aktivasi, pulihkan kode backend rilis sebelumnya sebagai satu revisi yang konsisten, tanpa menimpa pekerjaan lokal lain. Jalankan restart rollback hanya dalam persetujuan rilis/rollback yang diberikan, lalu ulangi pemeriksaan kesehatan. Tidak ada migrasi skema yang harus dibalik; jangan menghapus atau memulihkan database, backup, akun, maupun jadwal hanya untuk rollback kode ini.

Pertahankan aplikasi dan endpoint Discord lama. Jika command baru sudah terdaftar sementara handler dikembalikan ke versi lama, command baru dapat menjawab bahwa perintah tidak dikenal. Jangan menghapus command lama atau melakukan bulk overwrite untuk mengatasinya. Penanganan command tambahan dilakukan terarah setelah peninjauan dan persetujuan; skrip persiapan ini tidak menyediakan penghapusan otomatis.
