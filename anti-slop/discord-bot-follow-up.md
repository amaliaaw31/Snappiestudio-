# Bot Discord: pengumuman manual dan jadwal

Mode after mengikuti pilihan sesi. Lingkup diminta pengguna: perintah pengumuman di Discord, pengingat migrasi, serta pengumuman otomatis berdasarkan jadwal. Arah UI tetap ENERGY 1 / RHYTHM 2 / MOTION 1. Satu details pada Pengaturan CMS menyediakan status konfigurasi dan jadwal nyata; tidak ada aset, warna, atau gerak dekoratif baru.

- Hard Gate PASS: perintah memerlukan tanda tangan Ed25519, timestamp segar, serta aplikasi/server/kanal/user yang sesuai. Respons privat dan mention dinonaktifkan. Formulir pengumuman tetap memakai teks biasa. Status membedakan aplikasi belum dikonfigurasi, pengiriman gagal, dan jadwal nyata; tidak mengklaim bot sudah terhubung pada akun Discord pemilik.
- Purpose Gate PASS: perintah slash menggunakan pola native Discord. Jadwal memakai WIB dan satu jadwal terbuka untuk menghindari konflik. Pengumuman otomatis mengikuti jadwal, sedangkan perubahan manual mengambil alih. Polling satu menit pada tab aktif membuat pengunjung melihat pembaruan tanpa reload; menutup pesan tidak membuat pesan yang sama tampil berulang.
- Liveliness PASS: identitas Snappie dan susunan compact tetap digunakan. Status/jadwal ditempatkan pada Pengaturan, dengan teks operasional dan contoh perintah yang sesuai tugas.
- Craftsmanship PASS: lint, 111 tes, build, audit dependensi, validasi bash dan unit systemd lulus. Browser menguji perintah bertanda tangan sampai scheduler dan pengumuman pada halaman terbuka. Pesan muncul/hilang tanpa reload, tidak menjalankan string HTML, tidak muncul lagi setelah ditutup, serta tetap muat pada 320/390/768/1440 piksel di kedua tema. Regresi CMS compact tetap lolos pada 320–1920 piksel.

Tes mencakup signature salah, timestamp kedaluwarsa, payload lebih besar dari 2 KiB, akun/kanal/server/aplikasi yang tidak diizinkan, replay, pengingat sekali, retry, lease antarpekerja, restart, override CMS, selesai/batal, mode pengingat saja, dan jadwal terlambat lebih dari 24 jam. Pendaftaran perintah diuji dengan pengganti API; tidak ada token atau pesan Discord nyata pada pengujian.

Aktivasi pada Discord masih memerlukan aplikasi, public key, ID akun/server/kanal, serta pendaftaran perintah oleh pemilik. Bot tidak memindahkan data server dan tidak menyimpulkan migrasi selesai tanpa perintah pemilik. Panduan: docs/discord-bot.md.
