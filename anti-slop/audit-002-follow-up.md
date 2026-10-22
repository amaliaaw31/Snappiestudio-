# Tindak lanjut audit CMS

Pengguna mengizinkan aktivasi akun admin dengan kredensial yang ditentukan dan meminta kolom username kosong saat halaman dibuka. Temuan 1 pada audit 002 sudah ditutup. Nilai awal `admin` dihapus dari formulir; username dan password akun hanya dipasang dalam konfigurasi privat server.

Password diterima lewat input terminal tanpa echo dan diubah menjadi bcrypt dengan cost 12. Hash disimpan di `/etc/snappiestudio/cms-password.hash`; konfigurasi layanan menunjuk file tersebut. Direktori memakai izin 0750 dan file 0640, dimiliki root dengan grup layanan. Password plaintext tidak ditulis ke file, HTML, atau repo.

## Delivery Gate perubahan login

- Hard Gate PASS: login produksi berhasil, dashboard dan laporan berstatus HTTP 200 dengan sesi valid, logout berhasil, dan sesi yang sudah dicabut ditolak dengan HTTP 401. HTML formulir tidak berisi nilai awal username atau kredensial akun.
- Purpose-Gate PASS: hanya nilai awal input yang dihapus; struktur, identitas warna, dan kontrol tetap mengikuti CMS yang sudah diuji.
- Liveliness PASS: ENERGY 1 / RHYTHM 2 / MOTION 1 dipertahankan tanpa aset atau dekorasi baru.
- Craftsmanship PASS: `npm run lint`, 72 tes termasuk keamanan, `npm run build`, `npm audit`, dan `git diff --check` lulus. Audit dependensi melaporkan 0 kerentanan.

Build sudah disalin ke `/var/www/snappie` dan layanan direstart. Pengujian login produksi tidak memanggil registrasi visitor atau reset. Jumlah browser tetap 24. Pengujian autentikasi memakai API sebenarnya dengan cookie sesi dan CSRF; password, hash, cookie, serta token tidak dicetak dalam hasil verifikasi.
