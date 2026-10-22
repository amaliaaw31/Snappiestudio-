# Kontrol contoh halaman utama

Permintaan pengguna: kerjakan seluruh enam rekomendasi setelah penyesuaian ukuran bingkai.

## Perubahan

1. Keterangan, pemilih efek, dan tiga pilihan tema berada sebelum bingkai pada urutan DOM. Kontrol dapat ditemukan tanpa melewati strip foto yang panjang. Ukuran bingkai tetap mengikuti preview dan hasil.
2. Tombol filter modal dan strip kamera memakai `aria-pressed`, disinkronkan dengan pilihan aktif. Modal mengumumkan nama efek preview melalui live region.
3. Tombol tema menampilkan thumbnail tiga foto dari aset grup yang sudah dipakai aplikasi. Label diterjemahkan secara terpisah agar pergantian bahasa tidak menghapus thumbnail.
4. Modal halaman utama menyimpan pilihan efek sementara. Pengguna dapat membandingkan efek pada foto preview sebelum menekan Gunakan. Escape, tombol tutup, dan klik backdrop membatalkan pilihan sementara. Membuka ulang modal memulihkan efek tersimpan dan posisi gulir paling atas. Pilihan kamera tetap langsung berlaku.
5. Tombol tema memakai border 2px dan berat font tetap pada semua status. Pemilihan hanya mengubah warna sehingga ukuran dan posisi tombol stabil.

Identitas tetap pink Snappie, font yang sudah ada, dan foto grup pengguna. ENERGY 2 / RHYTHM 2 / MOTION 1. Tidak ada dependensi atau aset visual baru. Thumbnail dipakai untuk membandingkan bingkai; preview modal dipakai untuk membandingkan efek.

## Verifikasi otomatis

Regresi browser memeriksa lima lebar layar (320, 390, 720, 1000, 1440px), kedua mode warna, posisi kontrol, thumbnail yang terlihat, stabilitas ukuran tombol, dan kesamaan geometri bingkai dengan preview/hasil. Pemilihan sementara, beberapa efek berturut-turut, Gunakan, pembatalan Escape, pemulihan fokus, serta putaran Tab maju/mundur diperiksa.

Event sentuhan Chromium memeriksa membuka modal, memilih efek, dan menekan Gunakan pada viewport 390×844, 412×915, serta landscape 844×390. Tombol Gunakan tetap terlihat dan tingginya minimal 44px. Regresi juga mencakup kamera simulasi, galeri, 22 tema, ekspor PNG layout 1/3/4/6 foto, dan footer unduhan. Screenshot halaman awal dan modal pada 390px diperiksa.

## Verifikasi perangkat fisik yang belum tersedia

Sesi ini tidak terhubung ke iPhone atau Android fisik. Browser pengujian yang tersedia adalah Chromium; ukuran viewport dan event sentuhan tidak membuktikan perilaku Safari. Validasi berikut masih perlu dijalankan pada Safari iPhone dan Chrome Android:

- Buka situs produksi, ganti tema, coba beberapa efek, batalkan, lalu gunakan satu efek. Pastikan tampilan dan pilihan tersimpan sesuai.
- Izinkan kamera, ambil foto, ganti kamera, lalu ulangi setelah menolak izin untuk memeriksa pemulihan.
- Impor foto galeri, buka preview/hasil, unduh PNG, dan buka file hasilnya.
- Buka menu Share dan jalankan berbagi dengan aplikasi yang terpasang; batalkan lalu coba lagi.
- Ulangi dalam orientasi landscape serta saat toolbar browser muncul/hilang. Pastikan Gunakan dan Download tetap terjangkau.

Delivery Gate: kontrol mempunyai perilaku nyata, urutan mengikuti kebutuhan pengguna, bentuk bingkai tetap konsisten, dan batas pengujian fisik dinyatakan secara eksplisit.

Lint, 75 unit test, dan build final lulus. Deploy selesai dengan backup `/var/backups/snappiestudio/deploy-mJk0MozU`. Regresi browser produksi lulus, termasuk uji sentuhan dan kesamaan ukuran bingkai. HTML publik identik dengan build; CSP header cocok dengan policy HTML. Perubahan server yang sedang berlangsung tidak disertakan dalam commit UI ini.
