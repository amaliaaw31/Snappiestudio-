# Menu CMS dan diagram donat

CMS dibagi menjadi Ringkasan, Tren dan waktu, Wilayah, Kunjungan, dan Pengaturan. Setiap menu menampilkan satu tugas. Pemilih pengaturan membuka satu bagian sekaligus, termasuk reset data. Filter tanggal dan wilayah dapat dibuka ketika diperlukan; ringkasan filter tetap terlihat.

Diagram donat menjawab porsi browser baru dan kembali pada periode laporan, mengikuti filter API yang sama. Angka dan persentase tersedia sebagai teks serta label SVG. Periode kosong menampilkan cincin netral dan petunjuk memilih periode lain. Tidak ada dependensi baru.

## Alasan visual

- Warna merah muda, warna netral, wordmark, dan font merek dipertahankan agar CMS tetap milik Snappie Studio.
- Font sistem untuk data menjaga angka dan formulir mudah dibaca; font merek hanya pada identitas.
- Menu mengikuti tugas admin; statistik umum hanya pada Ringkasan agar menu lain tidak mengulang blok yang sama.
- Perbandingan periode dan komposisi browser berdampingan di desktop, lalu mengalir vertikal di ponsel.
- Jarak antarkolom 32 px memisahkan dua pertanyaan statistik tanpa kartu bertumpuk atau bayangan baru.
- Dua warna donat membedakan kategori; label dan angka memastikan warna bukan satu-satunya pembeda.
- ENERGY 1 / RHYTHM 2 / MOTION 1: formulir tenang, komposisi mengikuti data, tanpa animasi otomatis.

## Verifikasi

`npm run lint`, `npm test` (138 lulus), `npm run build`, dan `node scripts/verify-cms-layout.mjs` lulus. Uji browser memakai database sementara, bukan data produksi. Browser Chrome dengan debugging lokal tersedia pada `http://127.0.0.1:9337`; alamat dapat diubah melalui `CMS_BROWSER_URL`.

Uji browser mencakup lima menu pada lebar 320, 390, 768, dan 1440 px, kedua tema, sembilan bagian pengaturan, keyboard, pembatalan reset, data donat 50/50 dan kosong, kegagalan laporan, kontras, redraw grafik, serta tampilan cetak. Bukti visual lokal: `/tmp/snappie-cms-layout.png`.

## Antislop Delivery Gate

- R-01 PASS: warna merek dipertahankan; tidak ada gradien atau glow baru.
- R-02 PASS: teks UI baru tidak memakai em dash.
- R-03 PASS: kelima panel tidak overflow pada empat ukuran, kedua tema.
- R-04 PASS: tidak menambah ikon dekoratif; kotak legenda menandai kategori donat.
- R-05 PASS: ringkasan dua analisis, tren berupa grafik, wilayah berupa peringkat, kunjungan berupa tabel, pengaturan berupa formulir terpilih.
- R-06 PASS: font merek pada identitas, font sistem pada data dan kontrol.
- R-07 PASS: tidak menambah pola latar.
- R-08 PASS: tidak menambah panah dekoratif.
- R-09 PASS: tidak menambah badge atau eyebrow.
- R-10 PASS: tidak menambah glassmorphism.
- R-11 PASS: radius kontrol 6 px, panel 8 px, dan shell 16 px tetap dibedakan.
- R-12 PASS: tidak menambah bayangan.
- R-13 PASS: tidak menambah glow.
- R-14 PASS: analisis memakai bagian datar, bukan kumpulan kartu seragam.
- R-15 PASS: kontrol bernama tugas, termasuk Terapkan, Muat ulang, dan Reset hitungan.
- R-16 PASS: teks baru tidak memakai klaim pemasaran.
- R-17 PASS: donat berasal dari newBrowsers dan returningBrowsers pada API laporan.
- R-18 PASS: tidak menambah testimonial atau aktivitas fiktif.
- R-19 PASS: tidak menambah animasi; grafik digambar ulang saat tema, ukuran, atau mode cetak berubah.
- R-20 PASS: identitas Snappie, penghitungan browser, WIB, provinsi, dan tugas admin menentukan isi layar.
- R-21 PASS: tema terang dan gelap diuji pada semua menu.
- R-22 PASS: tidak menambah ilustrasi.
- R-23 PASS: pengguna meminta perapian seluruh menu dan diagram donat; tidak membuat aset merek baru.
- R-24 PASS: kelima tombol menu membuka panel dengan aria-controls yang sesuai.
- R-25 PASS: uji browser memastikan kontras antarsektor minimal 3:1 dan teks penjelas minimal 4,5:1 pada kedua tema.
- R-26 PASS: menu, pemilih pengaturan, filter, reset-dialog, dan kontrol tema memiliki perilaku yang diuji; handler formulir yang ada dipertahankan.
- R-27 PASS: label pemuatan tersedia; periode kosong memberikan tindakan; kegagalan API menampilkan petunjuk Muat ulang dan mempertahankan laporan sebelumnya.
- R-28 PASS: tidak menambah FAQ.
- R-29 PASS: palet tetap netral dan merah muda; tidak menambah keluarga warna.
- R-30 PASS: struktur mengikuti tugas CMS Snappie, tanpa meniru produk lain.
- R-31 PASS: alasan warna, layout, tipografi, jarak, dan visualisasi tercatat di atas.
- R-32 PASS: Enter membuka menu dengan fokus terlihat; Escape menutup konfirmasi reset tanpa menghapus data.
- R-33 PASS: fitur ditulis langsung pada HTML, CSS, dan modul CMS melalui patch sumber.
- R-34 PASS: kelima panel dan kontras donat diuji pada kedua tema; grafik menggambar ulang saat tema berubah.
- R-35 PASS: lint, 138 unit test, build, dan uji navigasi browser lulus; screenshot diperiksa.
- R-36 PASS: tidak menambah klaim keamanan, kepatuhan, atau performa.
- R-37 PASS: arah visual dan ENERGY 1 / RHYTHM 2 / MOTION 1 dinyatakan sebelum perubahan.
- R-38 PASS: data contoh hanya pada database uji sementara; UI produksi memakai laporan server.
- Liveliness PASS: total browser menjadi fokus Ringkasan; ruang memisahkan analisis; merah muda menandai pilihan aktif dan kategori baru; wordmark tetap menjadi motif identitas.
- C-1 PASS: setiap perubahan besar memiliki alasan visual tertulis.
- C-2 PASS: kontrol baru diuji; fungsi akun, keamanan, CSV, dan pengaturan tetap memakai handler yang ada.
- C-3 PASS: setiap panel melayani tugas admin yang berbeda.
- C-4 PASS: empat ukuran, dua tema, keyboard, data kosong, error, dan cetak diuji.
- C-5 PASS: angka produksi tetap berasal dari API, tanpa klaim atau metrik buatan.
