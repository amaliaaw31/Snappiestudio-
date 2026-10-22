# Notifikasi Discord

Penyesuaian sesuai pilihan kanal pengguna. Identitas dan susunan CMS tetap mengikuti ENERGY 1 / RHYTHM 2 / MOTION 1. Status notifikasi kini menyebut Discord jika konfigurasi kanal tersedia, tanpa mengembalikan URL atau token.

Hard Gate dan Craftsmanship: lint, 103 tes, build, validasi bash, dan pengujian browser fitur CMS lulus. Tujuan Discord divalidasi, payload memakai content dan menonaktifkan mention, wait=true mewajibkan konfirmasi ID pesan. Pengiriman yang gagal tetap dicoba pada siklus monitor berikutnya. Pengujian tidak mengirim pesan ke Discord nyata; webhook pemilik belum tersedia.

Installer menerima URL melalui input terminal tersembunyi, menyimpan URL kanonik secara atomik dalam konfigurasi privat server, dan mempertahankan konfigurasi lain. Tidak ada URL webhook pada repo, argumen proses, status CMS, atau pesan notifikasi. Mode after mengikuti pilihan sesi; lingkup ini tidak menambahkan aset atau susunan halaman baru.
