# Follow-up audit UI: prioritas tinggi

Lingkup yang disetujui: temuan 1, 2, dan 3 pada `audit-001-2026-10-22.md`. Pengguna juga meminta commit dan push. Temuan lain tidak dikerjakan.

## Perbaikan

1. **Pesan kamera (R-27):** status meminta izin dan penyebab kegagalan kini tampil di halaman awal maupun layar kamera. Tombol pembuka mencegah permintaan ganda saat menunggu, lalu menyediakan percobaan ulang setelah gagal. Galeri tetap tersedia sebagai alternatif. Pesan baru tersedia dalam bahasa Indonesia dan Inggris, dengan fallback Inggris untuk bahasa lain.
2. **Kontras (R-25):** teks pendukung, label, placeholder, judul modal, dan keterangan alat memakai warna lebih terbaca. Header dialog pada mode gelap memakai permukaan gelap. Identitas pink dan motif latar tetap dipertahankan. Judul modal terang meningkat dari 4,17:1 menjadi 5,79:1; judul modal gelap mencapai 6,80:1.
3. **Fokus modal (R-32):** semua dialog mempunyai nama aksesibel. Dialog tertutup dan halaman belakang memakai `inert`. Tab/Shift+Tab tetap di dialog aktif. Escape menutup dialog teratas, termasuk pada dialog bertumpuk; penutupan mengembalikan fokus ke pemicu. Browser Back menutup tumpukan sesuai urutan. Pintasan stiker dan riwayat editor tidak berjalan selama dialog terbuka.

## Bukti verifikasi

- `npm run lint`: lulus.
- `npm test`: 70 lulus, 0 gagal, termasuk tes keamanan yang sudah ada.
- `npm run build`: lulus.
- `git diff --check`: lulus sebelum deploy.
- `node scripts/verify-ui.mjs`: lulus pada server lokal.
- `node scripts/verify-ui.mjs https://snappiestudio.com/`: lulus setelah deploy.
- HTML produksi dibandingkan dengan `dist/index.html`: identik.
- Build disalin dengan `sudo -n cp -a dist/. /var/www/snappie/`.

Skenario browser yang diverifikasi:

- Permintaan kamera tertunda: status terlihat dan tombol pembuka nonaktif.
- Izin kamera ditolak: error terlihat pada halaman awal, tombol coba lagi tersedia.
- Percobaan ulang berhasil: layar kamera aktif dan status error dibersihkan.
- Kamera tidak ditemukan saat mengganti kamera: error terlihat pada layar kamera.
- Lebar 320, 390, dan 1440 piksel: halaman awal tidak meluber horizontal.
- Kedua mode pada setiap lebar: kontras deskripsi, placeholder, dan judul dialog memenuhi 4,5:1.
- Modal bahasa: fokus masuk ke tombol tutup; halaman belakang tidak interaktif.
- Tab dan Shift+Tab: fokus melingkar di dalam modal.
- Escape: dialog tertutup dan fokus kembali ke tombol bahasa.
- Galeri berisi gambar sintetis: masuk preview lalu hasil melalui kontrol sebenarnya.
- Tema custom lalu pemilih warna: modal induk tidak interaktif selama modal anak terbuka.
- Escape pada modal anak: fokus kembali ke kontrol warna induk.
- Escape pada modal induk: fokus kembali ke pemilih tema di editor.
- Browser Back saat modal bertumpuk: semua modal tertutup dan fokus kembali ke editor.
- Tombol tutup stiker: fokus kembali ke tombol pembuka.
- Editor hasil: tidak meluber horizontal pada viewport desktop yang diuji.
- Tidak ada exception browser yang tidak tertangani.

Tes kamera browser menggunakan stream Canvas sintetis dan error terkontrol. Ini membuktikan alur UI, bukan kompatibilitas sensor kamera fisik. API visitor diintersep selama tes agar tidak menambah hitungan produksi. Tidak ada foto pengguna yang dikirim ke server.

## Delivery Gate untuk perubahan yang disetujui

- **Hard Gate:** temuan 1–3 diperbaiki dan skenario terkait lulus. Ini bukan sertifikasi seluruh kontrol atau seluruh variasi tema situs.
- **Purpose-Gate:** warna digelapkan untuk keterbacaan; pengelolaan fokus ditambahkan agar dialog dapat digunakan dengan keyboard. Tidak ada aset, dekorasi, atau dependensi baru.
- **Liveliness:** perubahan mengikuti identitas situs yang sudah ada; tidak menetapkan ulang palet, komposisi, motif, atau animasi.
- **Craftsmanship:** lint, unit test, build, serta uji browser lokal dan produksi lulus. Pengujian perangkat kamera nyata belum dilakukan.

`npm audit --omit=dev` menemukan 0 kerentanan. `npm audit` penuh masih melaporkan 1 kerentanan high pada dependensi pengembangan Vite yang sudah ada. Tidak ada perubahan versi dependensi dalam lingkup perbaikan UI ini.
