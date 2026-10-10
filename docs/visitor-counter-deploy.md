# Penghitung pengunjung dan CMS

Penghitung mencatat browser unik berdasarkan UUID acak yang tersimpan di localStorage. Server hanya menyimpan SHA-256 UUID tersebut di SQLite. Angka adalah perkiraan browser unik: menghapus data browser atau memakai perangkat lain dapat menghasilkan hitungan baru. Foto tidak pernah dikirim ke API counter.

Service systemd ada di `deploy/snappiestudio-counter.service`. API hanya listen pada `127.0.0.1:3001`; Caddy meneruskan `/api/visitors` dan `/api/admin/*` ke service. CMS terdiri dari dua halaman: login di `/cms` (`public/cms.html`) dan jumlah serta lokasi pengunjung di `/cms/dashboard` (`public/cms-dashboard.html`). Endpoint admin meminta HTTP Basic Auth. Setelah login, kredensial disimpan di sessionStorage (hanya selama tab terbuka) dan dihapus saat keluar.

Lokasi: saat kunjungan pertama, server membaca IP klien dari `X-Forwarded-For` (yang ditambahkan Caddy) dan mencocokkannya dengan basis data offline DB-IP Lite. Hanya kode negara, nama negara, dan kota yang disimpan; IP tidak disimpan. Unduh basis datanya ke `/var/lib/snappiestudio-counter/geo/dbip-city-lite.mmdb` (`curl -sSL -o dbip.mmdb.gz https://download.db-ip.com/free/dbip-city-lite-YYYY-MM.mmdb.gz && gunzip dbip.mmdb.gz`) dan perbarui setiap bulan. Variabel `GEOIP_DB_PATH` di service mengarah ke berkas itu; tanpa berkas, lokasi tercatat sebagai tidak diketahui.

Pada Caddy 2.6, gunakan directive `basicauth` dan hash password menggunakan `caddy hash-password`. Di dalam site block `snappiestudio.com, www.snappiestudio.com`, tambahkan handler berikut sebelum handler file statis:

```caddyfile
@counter path /api/visitors
handle @counter {
    reverse_proxy 127.0.0.1:3001
}

@admin path /api/admin/*
handle @admin {
    basicauth {
        admin <hash-password>
    }
    reverse_proxy 127.0.0.1:3001
}

@cmsDashboard path /cms/dashboard /cms/dashboard/ /cms-dashboard.html
handle @cmsDashboard {
    root * /var/www/snappie
    rewrite * /cms-dashboard.html
    file_server
}

@cms path /cms /cms/ /cms.html
handle @cms {
    root * /var/www/snappie
    rewrite * /cms.html
    file_server
}
```

Instal dengan `sudo bash deploy/install-visitor-counter.sh '<hash dari caddy hash-password>'`. Script membuat backup Caddyfile, memasang dan menyalakan service, memvalidasi Caddy, mengirim build, lalu reload Caddy. SQLite disimpan di `/var/lib/snappiestudio-counter/visitors.sqlite` dan bertahan saat build situs di-deploy ulang. Jalankan `npm run start:counter` untuk pengembangan lokal bersama Vite.
