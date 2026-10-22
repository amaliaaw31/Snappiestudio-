# CMS: diagram dan provinsi

CMS menampilkan diagram browser unik per periode, aktivitas per jam WIB, serta sepuluh provinsi/wilayah dengan browser terbanyak. Diagram provinsi menggabungkan kota dalam negara dan provinsi yang sama. Persentase memakai seluruh browser sesuai filter, termasuk browser dengan provinsi belum diketahui. Tabel lokasi tetap memuat semua wilayah.

Kolom `province` ditambahkan ke tabel `visitors` tanpa menghapus catatan atau mengubah waktu kunjungan. Nilai berasal dari `subdivisions[0].names.en` dalam basis data DB-IP City Lite lokal. Negara lain memakai wilayah administratif tingkat pertama. Kunjungan lama tidak dapat dilengkapi karena IP tidak disimpan; kunjungan ulang mempertahankan lokasi pertama.

Daftar kunjungan, tabel lokasi, pencarian, dan ekspor CSV menyertakan provinsi. Pencarian tetap memakai parameter SQL dan memperlakukan wildcard sebagai teks. CSV melewati escaping dan penetralan formula yang sama untuk semua kolom. Endpoint admin tetap memerlukan sesi; operasi tulis tetap memerlukan CSRF.

## Konfigurasi produksi

Unit `deploy/snappiestudio-counter.service` memakai lokasi checkout saat ini dan membaca `/etc/snappiestudio/counter.env`. Simpan `CMS_PASSWORD_HASH_FILE` yang mengarah ke file bcrypt privat di luar web root. Pertahankan kredensial yang sudah ada. Jangan menyimpan password atau hash produksi dalam repo.

Atur `GEOIP_DB_PATH=/var/lib/snappiestudio-counter/geo/dbip-city-lite.mmdb`. Basis data DB-IP Lite perlu diperbarui bulanan; pemasangan ini memakai edisi Oktober 2026. Sumber dan lisensi: [DB-IP Lite](https://db-ip.com/db/lite.php), [format MMDB](https://db-ip.com/db/format/ip-to-city-lite/mmdb.html). Atribusi DB-IP tetap tampil di CMS.

Build disalin ke `/var/www/snappie`. Perubahan backend memerlukan restart `snappiestudio-counter`, yang mengakhiri sesi admin. Migrasi menambahkan satu kolom nullable; kode lama dapat membaca database yang sudah dimigrasi, sehingga rollback kode tidak perlu menghapus kolom.

## Verifikasi

Tes mencakup ekstraksi GeoIP, migrasi catatan lama, pemisahan kota bernama sama di provinsi berbeda, pencarian provinsi di seluruh laporan, serta kolom provinsi CSV. Uji Chrome lokal memakai database dan kredensial tes sementara, tanpa menyentuh data produksi.
