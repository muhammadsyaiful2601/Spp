# Aplikasi Pembayaran Sekolah

Implementasi awal aplikasi pembayaran SPP dan biaya sekolah: React + Vite SPA di `frontend/` dan Laravel REST API + Sanctum di `backend/`.

## Menjalankan aplikasi

Terminal 1:

```powershell
cd backend
php artisan migrate --seed
php artisan storage:link
php artisan serve --port=8001
```

Terminal 2:

```powershell
cd frontend
Copy-Item .env.example .env.local
npm run dev
```

Buka `http://localhost:5173`. Frontend mengambil branding publik dari API; transaksi demo dan pengaturan pada SPA masih disimpan di browser (`localStorage`). Atur `VITE_API_URL` pada `frontend/.env.local` untuk menunjuk API lain. Endpoint autentikasi, siswa, pembayaran, tarif, kuitansi, dan laporan tersedia di Laravel, tetapi belum seluruhnya dihubungkan ke aksi SPA.

## Akun lokal

Seeder hanya membuat akun berikut pada environment `local` dan `testing`:

| Peran | Username | Kata sandi |
| --- | --- | --- |
| Pimpinan | `pimpinan` | `password` |
| Admin | `admin` | `password` |

Ganti kredensial sebelum deployment. Atur database MySQL, `APP_URL`, HTTPS, dan kredensial storage pada `.env` server.

## Cakupan

SPA menyediakan loading screen bermerek, login/logout Sanctum, dashboard, daftar dan pencarian siswa, input pembayaran SPP/non-SPP, kuitansi siap cetak, pengaturan tarif, profil sekolah/logo, favicon tab browser yang dapat diunggah dan dihapus oleh pimpinan, serta ekspor CSV dan PDF laporan berkop sekolah. API mencakup autentikasi token, otorisasi role, profil dan validasi upload, tarif SPP/biaya, data siswa/tagihan, pembayaran atomik, kuitansi JSON, serta laporan. Belum termasuk sinkronisasi CRUD/transaksi SPA ke API, ekspor Excel, atau isolasi data multi-tenant; tinjau dan lengkapi sebelum deployment komersial.

## Favicon sekolah

Favicon diatur oleh peran `pimpinan` pada halaman **Profil sekolah** (menu *Preferensi → Profil sekolah*):

- `POST /api/v1/pimpinan/sekolah-profile/upload-favicon` (`multipart/form-data`, field `favicon`) — PNG, JPG, WebP, atau ICO maksimal 512 KB. SVG ditolak untuk mencegah stored XSS. Mengunggah ulang akan otomatis menghapus berkas lama.
- `DELETE /api/v1/pimpinan/sekolah-profile/favicon` — mengembalikan ikon bawaan `/favicon.svg`.

Berkas tersimpan pada disk `public` dan disajikan lewat `/storage/...` (jalankan `php artisan storage:link`). Nilai `favicon_path` ikut dikembalikan oleh `GET /api/v1/public/sekolah-profile` sehingga seluruh pengguna SPA memakai favicon yang sama. Halaman SPA menuliskan nilainya ke elemen `<link rel="icon">` melalui `applyFavicon()` setiap kali branding berubah; elemen `<title>` dokumen tetap statis.
