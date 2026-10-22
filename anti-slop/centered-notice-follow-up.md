# Banner pengumuman di tengah layar

Mode after mengikuti pilihan sesi. Arah ENERGY 1 / RHYTHM 2 / MOTION 1 tetap digunakan. Pengumuman memakai warna Snappie yang sudah ada, judul jelas, pesan di tengah, dan satu tombol Tutup. Bayangan membedakan banner mengambang dari konten di belakangnya; garis atas menandai pengumuman. Tidak ada animasi atau aset baru.

- Hard Gate PASS: konten tetap teks biasa. Tombol memakai elemen native dengan fokus terlihat dan tinggi minimal 44 piksel. Pengumuman yang ditutup tidak muncul lagi pada polling berikutnya untuk pesan yang sama.
- Purpose Gate PASS: banner terletak pada pusat viewport sesuai permintaan. Lebar dibatasi pada HP dan desktop. Pesan panjang bergulir di dalam area teks agar tombol tetap terjangkau pada layar pendek.
- Liveliness PASS: warna, radius, dan garis memakai identitas banner Snappie sebelumnya. Judul dan jarak memisahkan informasi dari tindakan tutup tanpa dekorasi tambahan.
- Craftsmanship PASS: lint, 118 unit test, dan build lulus. Browser lokal menguji kedua tema pada lebar 320/390/768/1440 piksel, posisi tengah pada empat kombinasi viewport, serta pesan panjang pada 568 × 240 piksel. Tombol dapat difokuskan dan ditutup dengan Enter. Alur perintah Discord bertanda tangan, scheduler, polling, perubahan pesan, dan penghapusan pengumuman tetap lulus tanpa exception browser.

Pemeriksaan memakai database sementara dan pesan sintetis; tidak memasang pengumuman percobaan di produksi. Tangkapan browser lokal diperiksa secara visual. Banner tidak memakai modal sehingga tidak mengunci fokus atau menghentikan interaksi dengan halaman.
