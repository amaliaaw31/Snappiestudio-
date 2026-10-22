# Background dan kontrol contoh halaman utama

Permintaan: pulihkan background lama hanya di halaman utama, perbaiki pergantian bingkai, dan gunakan modal untuk memilih efek.

- Background menggunakan hasil algoritma garis lama sebagai PNG statis 164.778 byte. Tidak ada pemrosesan piksel pada perangkat pengunjung. Pseudo-element hanya dibuat ketika `body.on-start` aktif, dengan warna dan opasitas mengikuti mode terang/gelap.
- Reproduksi browser menemukan `.start-demo .frame` masih `inline`: pada tema pastel, tingginya 500px sementara pembungkus hanya 470px. `display: block` membuat batas bingkai kembali membungkus foto dengan benar.
- Tombol efek membuka dialog filter yang sudah tersedia. Pilihan memperbarui seluruh foto contoh dan filter kamera. Escape, penguncian fokus, dan pengembalian fokus memakai pengelola modal yang sama.
- Pemilihan efek di halaman utama tidak mengubah foto sesi sebelumnya. Thumbnail modal halaman utama memakai foto contoh grup; editor tetap memakai foto pengguna secara lokal.

Identitas tetap pink Snappie, font judul yang ada, dan foto grup pengguna. ENERGY 2 / RHYTHM 2 / MOTION 1. Background lama dipulihkan atas permintaan pengguna; tidak ada animasi dekoratif atau dependensi baru.

Verifikasi: lint, 75 unit test, build, dan pengujian browser lulus. Pergantian ketiga bingkai diperiksa pada lebar 320, 390, 720, 1000, dan 1440px. Tes memastikan foto berada dalam batas bingkai, modal mengubah efek dan mengembalikan fokus, serta background hilang ketika kamera dibuka. Regresi juga memeriksa kamera simulasi, galeri, 22 tema, ekspor PNG, dan footer unduhan ringkas. Screenshot halaman awal 390px dan 1440px diperiksa. Kamera fisik belum diuji.

Delivery Gate: kontrol berfungsi, motif berasal dari background lama, perubahan terarah, dan bukti regresi dicatat. Warna dan tipografi mempertahankan identitas yang ada; gerak tidak ditambah.

Deploy selesai melalui `scripts/deploy.sh`, dengan backup `/var/backups/snappiestudio/deploy-zRicCLnI`. Regresi browser produksi lulus. HTML publik identik dengan build dan CSP header cocok dengan policy HTML.
