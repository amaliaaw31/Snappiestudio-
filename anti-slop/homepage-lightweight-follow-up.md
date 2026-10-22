# Halaman awal yang lebih ringan dan interaktif

Permintaan pengguna: menyederhanakan halaman awal situs utama, menghilangkan bingkai di sekitar isi, dan meningkatkan interaksi. Auto-commit, push, dan deploy tetap berlaku setelah pemeriksaan lulus.

## Perubahan dan alasan

- Panel di belakang judul, deskripsi, dan tombol dihapus. Konten berada langsung pada latar agar komposisi lebih terbuka (R-05, R-11, R-20).
- Pengolah line-art Canvas dan mask layar penuh dihapus. Halaman awal tidak lagi mengunduh `bac.jpg` berukuran 260.344 byte atau menjalankan blur, deteksi tepi, serta konversi PNG latar saat mulai (R-07, R-31).
- Latar menggunakan gradient CSS ringan yang mengikuti identitas pink dan mode gelap. Efek ini memberi suasana tanpa unduhan gambar atau pemrosesan piksel tambahan (R-01).
- Pemilih efek native memakai daftar filter yang sudah ada. Pilihan langsung mengubah tiga foto contoh dan menyinkronkan filter kamera. Pilihan bingkai tetap bekerja dan foto contoh tetap berasal dari unggahan pengguna (R-26, C-2).
- Judul dan contoh strip diperkecil pada ponsel. Tablet memakai komposisi dua kolom ketika ruang cukup. Aksi kamera dan galeri tetap menjadi fokus (R-03).
- Komentar tentang mask dan pengolah latar yang sudah tidak berlaku dihapus bersama mekanismenya. Komentar baru menyatakan batas teknis secara singkat; tidak dilakukan pembersihan komentar di luar lingkup.

Identitas: pink Snappie, font judul yang sudah ada, dan foto grup pengguna. ENERGY 2 / RHYTHM 2 / MOTION 1 untuk halaman awal: respons kontrol dan hover, tanpa gerak dekoratif berulang. Tidak ada dependensi atau aset visual baru.

## Verifikasi

- Workspace lulus lint, 75 tes, dan build setelah tambahan footer ringkas.
- Checkout rilis terisolasi lulus lint, 72 tes, dan build. Perbedaan jumlah tes berasal dari perubahan backend yang sedang berlangsung di workspace; perubahan tersebut tidak disertakan dalam rilis halaman awal.
- Browser memverifikasi bahwa pemilih efek mengubah foto contoh, pilihan bingkai bekerja, dan panel teks tidak memiliki background, radius, atau shadow pada kedua mode.
- Resource timing browser membuktikan halaman tidak meminta gambar latar `bac.jpg`; elemen mask latar juga tidak ada.
- Alur kamera, galeri, modal, Undo/Redo, 22 tema, dan PNG layout 1/3/4/6 foto diperiksa melalui skrip regresi yang tersedia.
- Lima lebar layar: 320, 390, 720, 1000, dan 1440 piksel; kedua mode, kontras teks, serta navigasi keyboard diperiksa.
- Screenshot halaman awal diperiksa pada `/tmp/snappie-start-390.png` dan `/tmp/snappie-start-1440.png`.
- Bundle rilis terisolasi lulus pengujian browser dengan CSP produksi. Setelah deploy, skrip yang sama lulus pada `https://snappiestudio.com/`; HTML publik identik dengan build rilis.

Pengurangan 260.344 byte adalah ukuran berkas latar yang tidak lagi diminta, bukan klaim peningkatan waktu muat atau skor performa. Kamera fisik belum diuji; regresi memakai stream dan error terkontrol.

## Delivery Gate

- Hard Gate: kontrol yang diubah mempunyai perilaku nyata; hasil uji terkait tercatat. Tidak ada aset atau klaim rekaan.
- Purpose-Gate: alasan layout, warna, ukuran, dan penghapusan dekorasi dinyatakan di atas.
- Liveliness: identitas Snappie tetap terlihat; contoh dapat dicoba melalui bingkai dan efek.
- Craftsmanship: perubahan halaman awal dan komentar terkait dijaga terarah. Build rilis terisolasi digunakan agar perubahan backend yang belum disetujui tidak ikut terpublikasi.

## Footer unduhan ringkas

Permintaan lanjutan pengguna: Download dan Share berada dalam satu baris yang ringkas. Footer kini menampilkan dua tombol setinggi minimal 44px. Pilihan Instagram, WhatsApp, Facebook, TikTok, dan Threads berada dalam popover native yang dibuka melalui Share. Ini mengurangi tinggi bar tanpa menghilangkan pilihan berbagi.

Browser memverifikasi posisi Download/Share sejajar dan tinggi footer tidak melebihi 76px pada lebar 320, 390, 720, 1000, dan 1440px. Escape menutup popover dan mengembalikan fokus; memilih platform menutup popover lalu membuka dialog platform yang sudah ada. Pintasan editor tidak menangkap input saat popover aktif.

Rilis akhir memakai build terisolasi beserta keluaran CSP dan helper deploy yang diwajibkan instruksi repo terbaru. Konfigurasi/build helper dibaca dari pekerjaan keamanan yang sedang berlangsung, sementara commit UI hanya mencakup berkas halaman awal, footer, tes browser, dan laporan ini.

Deploy akhir selesai melalui helper tersebut, dengan backup pada `/var/backups/snappiestudio/deploy-sxlAdj8z`. Pengujian browser produksi lulus untuk footer ringkas, popover Share, halaman awal, seluruh tema, dan ekspor PNG. HTML publik identik dengan build; CSP HTTP sesuai policy HTML. Dashboard CMS anonim mengembalikan 303 dan API admin 401.
