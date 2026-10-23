# Tindak lanjut audit 008

Persetujuan pengguna: nomor **2, 3, 5, dan 6** dari `audit-008-2026-10-23.md`.

## Perubahan

2. Latar halaman utama memakai warna dasar solid yang lebih tenang. Pola asli tetap dipakai khusus halaman utama, dengan opacity 0,018 pada mode terang dan 0,025 pada mode gelap. Intro tetap tanpa panel tambahan.

3. Pilihan gaya menjadi galeri horizontal manual dengan thumbnail hasil, label tema/efek, penanda centang, dan `aria-pressed`. Kombinasi yang tersedia: Pastel + Normal, Film + Vintage, dan Minimal + Hitam Putih. Swipe, drag mouse, tombol sebelumnya/berikutnya, serta keyboard Home/End dan panah menggunakan hasil yang sama. Arah panah mengikuti RTL. Pemilih efek terpisah tetap tersedia.

5. Pemilihan gaya atau efek memicu reveal strip sekali selama 300 ms. Animasi tidak mengubah ukuran atau skala bingkai. Reduced motion menampilkan hasil akhir langsung. Peralihan warna kontrol dibuat langsung agar pergantian mode tidak menampilkan teks terang di atas latar terang selama animasi.

6. Bar Kamera/Galeri muncul pada lebar di bawah 720 px setelah kedua tombol pembuka keluar viewport. Bar memakai handler asli, mengikuti status sibuk, menampilkan kesalahan izin kamera, dan menyediakan aksi coba lagi. Ruang bawah mengikuti tinggi aktual bar serta safe-area. Bar disembunyikan selama dialog dan pada layar selain halaman utama.

## Arah visual

ENERGY 2 / RHYTHM 2 / MOTION 2. Foto pengguna, identitas pink, font merek, dan slogan yang sudah disetujui tetap menjadi dasar. Gerak menjelaskan pergantian hasil; pola latar mendukung identitas. Galeri memberi pilihan visual yang bisa dimainkan tanpa rotasi otomatis.

## Delivery Gate ruang lingkup perubahan

- **R-03/R-35 PASS:** Chrome headless memverifikasi lebar 320, 390, 600, 719, 720, 1000, dan 1440 px. Galeri menggulir di dalam kontainernya; halaman tidak meluber horizontal. Konten terakhir tetap berada di atas bar.
- **R-25 PASS:** pemeriksaan browser menghitung kontras teks minimal 4,5:1 dan batas kontrol minimal 3:1 pada area baru di kedua mode, termasuk komposit pola latar. Pemeriksaan referensi menghasilkan 6,85:1 untuk teks terang dan 3,95:1 untuk batas kontrol terang; pasangan gelap masing-masing 9,59:1 dan 5,12:1.
- **R-32/R-34 PASS:** fokus galeri terlihat di dalam area scroll; Home/End, panah, RTL, Escape dialog, swipe, dan drag mouse diuji. Drag tidak memilih gaya tanpa sengaja dan keyboard tetap bekerja setelah drag.
- **R-35 PASS:** simulasi zoom CSS 200% pada viewport 640 px mempertahankan lebar konten, kontrol, dan jarak konten terakhir dari bar aksi.
- **R-19 PASS:** transisi cetak selesai sekali; daftar animasi aktif kosong setelah selesai dan saat reduced motion aktif.
- **R-26/R-27 PASS:** bar membuka file picker melalui sentuhan dan memakai alur kamera yang sama. Pending request menonaktifkan kedua tombol kamera; penolakan izin menampilkan pesan dan aksi coba lagi.
- **R-07/R-23 PASS:** pola dan foto contoh memakai aset yang sudah ada. Tidak ada aset gambar atau dependensi baru.
- **Konsistensi PASS:** 16 katalog bahasa tetap lengkap. Alur preview, ukuran bingkai, pengurutan, PNG/GIF, favorit, dan perlindungan foto belum diunduh lulus uji regresi.

## Validasi

- `npm run lint` lulus.
- `npm test` lulus: 149 tes.
- `npm run build` lulus.
- `node scripts/verify-ui.mjs http://127.0.0.1:4197/` lulus, termasuk galeri dan bar aksi.
- Pemeriksaan tambahan Chrome menguji swipe/drag, RTL, kontras pola, zoom, motion, dan penolakan izin kamera. Tangkapan layar ditinjau pada lebar 390 dan 1440 px.

Nomor 1 dan 4 tetap tercatat sebagai rekomendasi pada audit awal.

Verifikasi produksi `https://snappiestudio.com/` lulus untuk swipe/drag, keyboard RTL, transisi cetak, kontras, zoom, ruang bar aksi, dan pemulihan kesalahan kamera. SHA-256 `dist/index.html` identik dengan berkas yang dilayani dari web root produksi.
