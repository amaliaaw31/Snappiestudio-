# Waktu kunjungan di CMS

- Dashboard menampilkan hingga 100 browser terbaru beserta tanggal, jam dan menit kunjungan pertama dalam WIB (UTC+7), negara, serta kota. Waktu yang sudah tersimpan ikut tampil.
- Endpoint `GET /api/admin/visits` memerlukan sesi admin, tidak di-cache, dan tidak mengirim UUID/hash browser atau IP.
- Jumlah browser unik, reset, dan pengecualian browser admin tetap mengikuti data counter yang sama. Kunjungan ulang tidak mengubah waktu kunjungan pertama.
- Lint, 63 unit test (termasuk keamanan), build, dan audit dependensi lulus. Uji browser mencakup pergantian tanggal WIB, perangkat dengan zona waktu berbeda, tampilan ponsel, dan pengosongan tabel setelah reset.
- Hasil build disalin ke `/var/www/snappie`. Layanan counter menggunakan drop-in `/etc/systemd/system/snappiestudio-counter.service.d/workspace.conf` untuk menyesuaikan `WorkingDirectory` dan `ExecStart` dengan lokasi repo sekarang, `/home/ubuntu/projects/Snappiestudio-`.
