# Statistik pengunjung CMS

- Ringkasan browser unik hari ini, kemarin, minggu kalender (mulai Senin), dan bulan kalender, semuanya memakai WIB. Ringkasan global tidak berubah saat filter digunakan.
- Grafik browser unik per hari; rentang panjang diringkas per bulan/tahun. Tanpa filter tanggal, grafik memakai 30 hari terakhir. Grafik jam ramai menghitung browser sekali per jam per hari, lalu menjumlahkan sepanjang periode grafik. Tabel angka tersedia untuk aksesibilitas.
- Daftar menampilkan waktu pertama dan terakhir, diurutkan menurut kunjungan terakhir, dengan pagination 25/50/100 baris.
- Filter tanggal inklusif dan pencarian negara/kota berlaku pada daftar, ringkasan lokasi, grafik, serta seluruh halaman ekspor CSV. CSV memakai UTF-8 BOM, escaping kutip, serta penetralan awalan formula.
- Dashboard memperbarui data setiap 30 detik, dapat dimatikan, serta menjeda polling saat tab tersembunyi atau tidak ada interaksi selama 5 menit. Filter aktif dan halaman dipertahankan.

## Penyimpanan dan kompatibilitas

`server/analytics.js` menambahkan `last_seen`, tabel aktivitas per hash browser per jam, indeks, dan metadata waktu mulai pencatatan kunjungan ulang. Kunjungan ulang memperbarui waktu terakhir saat situs dibuka kembali, tanpa menaikkan total browser unik. Tidak ada IP atau foto yang disimpan.

Migrasi mengisi waktu terakhir dan satu aktivitas historis dari kunjungan pertama yang sudah tersimpan. Riwayat kunjungan ulang sebelum fitur aktif tidak dapat direkonstruksi; batas ini ditampilkan di dashboard. Reset dan pengecualian admin menghapus aktivitas terkait melalui foreign key, sementara daftar pengecualian tetap bertahan.

Endpoint laporan `/api/admin/report` dan unduhan `/api/admin/export.csv`, beserta endpoint daftar/lokasi, tetap memerlukan sesi CMS dan mengirim `Cache-Control: no-store`. Hash browser tidak dikirim ke dashboard/CSV.

## Verifikasi

Lint, unit test statistik dan keamanan, build, serta audit dependensi dijalankan sebelum deploy. Uji browser dengan backend/database terpisah mencakup login/logout, grafik, pagination lebih dari 100 data, pencarian, hasil kosong, CSV semua halaman sesuai filter, WIB pada perangkat dengan zona waktu lain, auto-refresh, ponsel, mode gelap, dan reset.
