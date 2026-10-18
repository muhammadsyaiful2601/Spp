<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Retensi log aktivitas
    |--------------------------------------------------------------------------
    |
    | `ActivityLogger` menulis satu sampai tiga baris per perubahan — setiap
    | masuk, setiap pembayaran, setiap perubahan pengaturan — dan tidak ada yang
    | pernah mengosongkannya. Pada database shared hosting tabel ini akhirnya
    | mendominasi query halaman log, karena layar itu menghitung empat agregat
    | di setiap permintaan.
    |
    | Angka di bawah dipakai oleh `php artisan activity-logs:prune`, yang
    | dijalankan otomatis oleh jadwal di routes/console.php. Tombol "Hapus log"
| di layar leadership tetap ada untuk keadaan darurat, tetapi tombol hanya
    | membantu kalau seseorang menyadari masalahnya — jadwal tidak.
    |
    */

    // Umur maksimum satu baris sebelum dipangkas.
    'retention_days' => (int) env('ACTIVITY_LOG_RETENTION_DAYS', 90),

    // Jumlah baris terbaru yang wajib tersisa, apa pun nilai retensinya.
    // Pagar ini yang membuat konfigurasi yang salah tidak bisa mengosongkan
    // seluruh riwayat.
    'minimum_rows' => (int) env('ACTIVITY_LOG_MINIMUM_ROWS', 500),

];