# FASE 2: backup dan alert

Mode after mengikuti pilihan sesi. Tidak ada perubahan visual website/CMS; arah ENERGY 1 / RHYTHM 2 / MOTION 1 tetap digunakan. Teks command membedakan hasil tercatat, integritas yang teruji, dan hasil UNKNOWN. Semua angka berasal dari metadata atau fixture berlabel selama pengujian.

- Hard Gate PASS: signature dan allowlist tetap mendahului command. Hasil Discord tidak mencetak secret, path, data pengunjung individual, atau error mentah. Riwayat dibatasi sepuluh snapshot dengan ID tervalidasi. Pesan uji memerlukan konfirmasi eksplisit dan cooldown tersimpan.
- Purpose Gate PASS: worker Node terpisah membatasi verifikasi pada 1,5 detik dan 256 MiB agar tidak menahan event loop backend. UNKNOWN tidak diartikan sebagai backup valid. Monitor memakai timer yang ada; tidak menambah daemon atau menjalankan restart otomatis. Seluruh perubahan diuji dari checkout terpisah agar service produksi tidak memuat source pengembangan.
- Liveliness PASS: tidak menambah aset, dekorasi, animasi, atau template UI. Command mengikuti pola native Discord yang sudah ada dan menggunakan pesan operasional singkat.
- Craftsmanship PASS: 149 unit test, lint, build, pemeriksaan sintaks shell/Node, audit dependensi, dan diff whitespace lulus. Tes mencakup sumber snapshot tetap identik setelah verifikasi, korupsi/checksum/berkas hilang, retensi tanpa penghapusan, penolakan path/symlink, replay, otorisasi, konfirmasi, cooldown, kegagalan pengiriman, recovery, keterlambatan jadwal WIB, serta kapasitas disk backup. Semua pengiriman memakai mock dan seluruh backup yang dibuat untuk tes berada di direktori sementara.

Batas yang dilaporkan: sumber terlalu besar/lambat tetap UNKNOWN, pemantau pada host yang sama tidak mendeteksi host mati total, dan kegagalan Discord hanya dapat dicatat lokal saat kanal tidak terjangkau. Aktivasi serta registrasi produksi belum dilakukan. Rollback tidak boleh mengaktifkan kembali pemangkasan snapshot lama tanpa persetujuan pemilik.
