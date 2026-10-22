# Follow-up audit UI: temuan 4–12

Pengguna menyetujui seluruh sisa temuan dan mengaktifkan auto-commit/push setelah pemeriksaan lulus.

## Arah dan alasan desain

Identitas yang dipertahankan: pink Snappie, font judul ekspresif, dan motif dari gambar pemilik. Teks antarmuka memakai Quicksand yang sudah tersedia agar instruksi lebih terbaca. ENERGY 2, RHYTHM 2, MOTION 2: karakter tetap terasa, komposisi mengikuti pekerjaan, dan animasi hanya merespons interaksi atau status pemrosesan. Tidak ada aset foto baru, dependensi baru, statistik palsu, atau testimonial.

## Perubahan yang selesai

| Temuan | Perubahan | Alasan |
|---|---|---|
| 4, R-07/R-06 | Motif latar lebih tipis; area pembuka mempunyai permukaan tenang. Font ekspresif tetap pada judul, Quicksand untuk instruksi dan kontrol. | Motif menjaga identitas tanpa mengganggu bacaan. |
| 5, R-19 | Glow stiker berulang dihapus. Reduced motion mempersingkat animasi/transisi, menghentikan pengulangan dekoratif, dan mematikan flash visual layar. | Gerak membantu interaksi dan menghormati preferensi pengguna. |
| 6, R-20/R-05 | Contoh strip memakai ilustrasi lokal yang sudah ada dan diberi label. Tiga tombol mengganti bingkai contoh; pilihan dibawa ke sesi baru. | Pengguna melihat hasil sebelum membuka kamera tanpa foto atau klaim rekaan. |
| 7, R-15/R-16 | Label Indonesia/Inggris diperjelas. Tahapan Foto, Cek Foto, Hias & Simpan menunjukkan posisi dan menyediakan navigasi kembali. | Tombol menjelaskan tujuannya; tahapan mencerminkan layar yang benar-benar tersedia. |
| 8, R-05/R-20 | Alat dikelompokkan menjadi Bingkai, Teks & Tanggal, Stiker memakai details/summary native. Desktop memisahkan preview dan alat; tablet mempunyai grid alat; mobile menumpuk konten. Simpan dan berbagi berada pada bar aksi, dengan tombol berbagi 44px. | Alat tersusun sesuai pekerjaan dan tetap terjangkau. |
| 9, R-20/C-2 | Tombol Undo/Redo memakai riwayat yang sudah ada. Petunjuk foto/stiker tersedia; foto dapat digeser dan di-zoom melalui keyboard. | Pengguna ponsel menemukan riwayat dan pengguna keyboard dapat mengatur foto. |
| 10, R-20/R-05 | Thumbnail bingkai dan filter memakai foto pengguna melalui URL blob lokal. Tema dapat disaring menurut kelompok yang sesuai isi sebenarnya. | Hasil pilihan lebih mudah dibandingkan; foto tetap di perangkat. |
| 11, R-20/R-31 | Pengunjung dipindah ke bawah halaman awal dan kontrol kamera, dengan penekanan lebih rendah. | Ruang utama menonjolkan hasil dan aksi membuat foto. |
| 12, R-11/R-20 | CTA, input, panel, segmented control, dan toggle mempunyai radius sesuai fungsi. Tombol sekunder lebih tenang; warna pink kuat untuk aksi utama dan pilihan aktif. | Bentuk dan warna membantu hierarki. |

Perbaikan terkait: bingkai baru hasil render ulang selalu menerima skala agar tetap muat. Zoom foto dengan roda mouse juga masuk riwayat perubahan.

Vite diperbarui secara kompatibel dari 6.4.3 ke 6.4.5 pada lockfile melalui `npm audit fix`. Audit penuh menjadi 0 kerentanan. Tidak ada upgrade major atau perubahan dependensi produksi.

Instruksi auto-commit/push dicatat pada `AGENTS.md`. Berkas CMS/backend yang berubah di luar pekerjaan ini tidak disertakan dalam commit UI. Build rilis dibuat dari checkout terisolasi dengan menyalin hanya perubahan UI yang relevan.

## Bukti verifikasi

- `npm run lint`: lulus.
- `npm test`: 72 lulus, 0 gagal pada workspace, termasuk tes keamanan yang tersedia.
- `npm run build`: lulus dengan Vite 6.4.5.
- `npm audit`: 0 kerentanan.
- `node scripts/verify-ui.mjs`: lulus setelah implementasi.
- Checkout rilis terisolasi juga lulus lint, 72 tes, dan build. Bundle hasilnya lulus `node scripts/verify-ui.mjs http://127.0.0.1:4181/` dengan CSP produksi aktif.
- Deploy selesai dari `/tmp/snappie-ui-release.nhcPYr/dist/` ke `/var/www/snappie/`. HTML publik identik dengan build rilis.
- `node scripts/verify-ui.mjs https://snappiestudio.com/`: seluruh skenario lulus setelah deploy. Dashboard CMS anonim mengembalikan HTTP 303 menuju login dan API admin mengembalikan HTTP 401.
- Browser menguji lebar 320, 390, 720, 1000, dan 1440 piksel; kedua mode pada halaman awal; kontras deskripsi, placeholder, serta judul dialog; nama/fokus modal; dialog bertumpuk; dan tombol Back.
- Contoh ilustrasi: pergantian bingkai serta status terpilih bekerja; tema pilihan dipakai pada sesi baru.
- Editor: kelompok alat membuka/menutup; zoom foto dengan keyboard bekerja; Undo/Redo memulihkan caption; bingkai hasil render ulang tetap mempunyai skala.
- Tema: thumbnail memakai foto lokal dan kategori Momen Spesial menampilkan enam tema sebenarnya. Seluruh 22 pilihan tema diterapkan pada preview dan berhasil diekspor menjadi PNG yang dapat didekode.
- Layout: 1, 3, 4, dan 6 foto mempertahankan jumlah foto dan menghasilkan PNG yang dapat didekode.
- Stiker: petunjuk muncul setelah penambahan; seleksi tidak memakai animasi berulang; reduced motion menonaktifkan transisi dekoratif.
- Tombol simpan/berbagi tetap dapat dijangkau dan mempunyai target sentuh yang memadai; editor tidak meluber horizontal pada lima lebar yang diuji.
- Tahapan memungkinkan kembali ke kamera lalu ke Cek Foto saat foto sudah tersedia; thumbnail filter memakai foto lokal.
- Tidak ada exception browser yang tidak tertangani.

Screenshot browser tersimpan di `/tmp/snappie-start-390.png`, `/tmp/snappie-start-1440.png`, `/tmp/snappie-result-390.png`, dan `/tmp/snappie-result-1440.png`. Foto editor pada tes adalah gambar sintetis untuk pemeriksaan. Permintaan API visitor diintersep selama tes browser.

## Delivery Gate

- **Hard Gate:** pemeriksaan terkait perubahan, ekspor PNG, kedua mode, dan breakpoint yang disebutkan lulus. Tidak ada konten atau aset realistis yang direkayasa.
- **Purpose-Gate:** alasan warna, tipografi, motif, komposisi, bentuk, dan gerak tercantum di atas; kontrol menggunakan perilaku aplikasi yang nyata.
- **Liveliness:** identitas pink dan judul khas tetap ada, komposisi halaman awal menampilkan contoh, dan preview menjadi fokus editor.
- **Craftsmanship:** lint, unit test, build, audit dependensi, dan pemeriksaan browser menjadi syarat rilis. Kamera fisik belum tersedia untuk diuji; alur kamera menggunakan stream Canvas dan error terkontrol. Pengujian emulasi tidak diklaim sebagai pengujian sensor atau perangkat nyata.

## Pembaruan foto contoh atas permintaan pengguna

Foto grup yang diunggah pengguna disalin tanpa perubahan ke `src/assets/sample-group.jpeg`. Foto tersebut menggantikan ilustrasi pada contoh strip halaman awal, sampel efek, dan thumbnail bingkai sebelum ada foto sesi. Label Indonesia/Inggris diperbarui menjadi contoh dengan foto. Setelah pengguna mengunggah foto, thumbnail tetap memakai foto sesi aktif melalui URL blob lokal.

Lint, 72 unit test, build, dan pemeriksaan browser lokal serta produksi lulus. Browser memverifikasi foto contoh berukuran asli 588 × 393, foto pada sampel efek, serta perpindahan ke thumbnail foto sesi. HTML produksi identik dengan build yang dideploy.
