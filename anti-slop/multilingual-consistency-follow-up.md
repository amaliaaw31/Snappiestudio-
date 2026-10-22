# Konsistensi multibahasa web utama

Lingkup rilis: halaman awal, kamera, preview, hasil, dialog editor dan berbagi. CMS/admin mempunyai pekerjaan tersendiri di workspace dan tidak disertakan dalam perubahan ini.

## Perubahan

- Seluruh 16 bahasa sekarang memiliki 259 kunci antarmuka yang sama. Sebelumnya 14 bahasa hanya memiliki 108 dari 237 kunci. Tambahan juga mencakup tooltip, label aksesibilitas, nama palet, tanggal, tombol kamera dan deskripsi foto.
- Pergantian bahasa memperbarui kontrol font, palet aktif, nama/pencarian emoji, status izin kamera, label navigasi, tanggal dan penghitung pengunjung. Pemformatan ulang penghitung menggunakan total yang sudah diambil, tanpa mencatat kunjungan baru.
- Nama dan kata pencarian 120 emoji berasal dari anotasi Unicode CLDR untuk 16 bahasa, dibundel secara lokal dengan lisensi dan sumbernya. Pencarian lama dalam Indonesia/Inggris tetap berfungsi.
- Merek, nama font/platform, teks yang ditulis pengguna, dan slogan persis `your little photo moment` tetap dipertahankan. Pesan awal tanpa JavaScript dan metadata pencarian bawaan tetap memakai bahasa default Indonesia; UI aktif mengikuti pilihan pengguna.
- Arah antarmuka Arab mengikuti RTL. Nomor foto dan angka pemilih tanggal mengikuti locale. Fallback Inggris tetap tersedia untuk kunci baru yang mungkin belum dilengkapi nanti; tes saat ini memastikan tidak ada kunci antarmuka yang hilang.

Identitas, layout, ukuran bingkai, dan gerak tidak ditambah. Data terjemahan lokal menghindari layanan terjemahan saat pengguna memakai situs dan tidak mengirim foto atau pencarian keluar.

## Verifikasi

- Lint, 92 unit test workspace, dan build lulus.
- Tes memeriksa kesetaraan seluruh kunci bahasa, placeholder interpolasi, seluruh binding HTML, 1.920 nama emoji, serta pencarian nama lokal.
- Browser memilih setiap bahasa melalui menu nyata, memeriksa teks/menu/tooltip/label aksesibilitas, lalu menjalankan kamera simulasi, impor galeri, preview dan hasil. Keempat ukuran layar 320/390/720/1440px diperiksa untuk setiap bahasa pada halaman awal dan editor.
- Slogan tidak berubah dalam bahasa apa pun. Screenshot hasil Arab dan Jepang pada 390px diperiksa.
- Regresi bingkai, modal efek, sentuhan, ekspor PNG, Undo/Redo dan footer unduhan tetap lulus.

Pemeriksaan otomatis memvalidasi cakupan dan perilaku, bukan peninjauan bahasa oleh penutur asli. Kamera fisik dan Safari iPhone belum diuji. Tidak ada perubahan autentikasi, routing atau kebijakan CSP; hash CSP hasil build mengikuti proses deploy yang sudah ada.

## Layout 4 dan 6 foto

Permintaan lanjutan pengguna: empat foto disusun vertikal seperti strip tiga foto; enam foto menjadi tiga kolom dengan dua baris. Preview dan hasil memakai satu kolom untuk empat foto, serta grid tiga kolom untuk enam foto. Composer PNG memakai jumlah kolom/baris yang sama. Lebar dasar empat foto mengikuti strip 300px; enam foto memakai lebar dasar 660px yang diskalakan utuh agar muat layar. Tinggi area enam foto mengikuti tinggi bingkai yang sudah diskalakan agar tidak menyisakan ruang kosong besar.

Browser memeriksa posisi tiap slot pada preview dan hasil, lalu lima lebar layar untuk kedua layout. Enam gambar uji dengan warna berbeda dipakai untuk memeriksa urutan setiap foto di PNG melalui pembacaan piksel. Ekspor dengan bingkai dan tanpa bingkai lulus; orientasi empat foto tetap vertikal dan enam foto melebar. Screenshot kedua layout pada 390px diperiksa. Lint, 92 unit test, build, dan regresi gabungan multibahasa/layout lulus.

Rilis gabungan dideploy melalui helper dengan backup `/var/backups/snappiestudio/deploy-uTDV8wi3`. Build terisolasi dan situs produksi sama-sama lulus regresi 16 bahasa serta layout 4/6 foto. HTML publik identik dengan build rilis dan CSP header sesuai policy HTML. Perubahan server yang sedang berlangsung tidak dimasukkan dalam rilis frontend atau commit ini.

## Koreksi susunan 6 foto

Arahan terbaru pengguna mengganti enam foto menjadi dua kolom dengan tiga baris. Preview/hasil dan PNG memakai dua kolom, lebar dasar 440px, serta area perhitungan caption yang sesuai. Empat foto tetap satu kolom vertikal. Regresi posisi slot dan pembacaan piksel PNG mengikuti susunan terbaru.

Koreksi lulus lint, 92 unit test, build, regresi browser rilis dan produksi, serta pemeriksaan screenshot 390px. Deploy selesai dengan backup `/var/backups/snappiestudio/deploy-bhUXxgZk`; HTML dan CSP produksi cocok dengan build koreksi.

## Tambahan 8 foto

Permintaan berikutnya menambahkan delapan foto dalam dua kolom dan empat baris. Pilihan jumlah foto menjadi 1/3/4/6/8, dengan label delapan foto di seluruh 16 bahasa sehingga masing-masing kamus mempunyai 260 kunci. Pilihan kamera tersimpan dalam preferensi; impor dari halaman awal memilih layout delapan foto untuk jumlah berkas di atas enam.

Preview, hasil dan PNG memakai geometri dua kolom yang sama dengan enam foto, dengan empat baris untuk delapan foto. Tombol jumlah foto memakai lima kolom agar semua pilihan tetap terlihat dan terjangkau di ponsel. Regresi mencakup pilihan kamera, preferensi, delapan foto dari galeri, posisi slot, serta urutan delapan warna pada PNG.

Rilis final diselaraskan dengan commit CMS terbaru dan lulus lint, 100 unit test, build, serta regresi browser rilis/produksi. Semua lima tombol jumlah foto diperiksa pada lebar 320px untuk 16 bahasa; layout delapan foto diperiksa pada lima lebar layar dan screenshot 390px. Ekspor dengan/tanpa bingkai lulus, termasuk pemeriksaan urutan delapan foto melalui piksel PNG. Deploy memakai backup `/var/backups/snappiestudio/deploy-h8fnrYPD`; HTML dan CSP publik cocok dengan build rilis.
