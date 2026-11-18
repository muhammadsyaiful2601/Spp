# Portal Keuangan Sekolah

Sistem manajemen pembayaran SPP dan biaya non-SPP untuk sekolah. Dibangun dengan
Laravel 13 (backend PHP) dan React (frontend).

---

## Daftar Isi

1. [Struktur Repositori](#struktur-repositori)
2. [Persyaratan](#persyaratan)
3. [Instalasi Backend](#instalasi-backend)
4. [Instalasi Frontend](#instalasi-frontend)
5. [Konfigurasi Environment](#konfigurasi-environment)
6. [Migrasi Database & Seeding](#migrasi-database--seeding)
7. [Menjalankan Server Pengembangan](#menjalankan-server-pengembangan)
8. [Antrian (Queue) untuk Email](#antrian-queue-untuk-email)
9. [Optimasi Produksi](#optimasi-produksi)
10. [Perintah Artisan yang Berguna](#perintah-artisan-yang-berguna)
11. [Troubleshooting](#troubleshooting)

---

## Struktur Repositori

```
Spp/
├── backend/              # Laravel 13 API
│   ├── app/
│   ├── config/
│   ├── database/
│   ├── routes/
│   ├── tests/
│   └── .env.example
├── frontend/             # React SPA
│   ├── src/
│   └── .env.example
├── README.md             # Panduan instalasi (file ini)
├── CPANEL.md             # Panduan deployment shared hosting
├── DEPLOY.md             # Panduan deployment produksi
└── .gitignore
```

---

## Persyaratan

### Backend (Laravel)

| Alat | Versi Minimum | Keterangan |
|------|--------------|------------|
| PHP | 8.3 | `bcmath`, `ctype`, `fileinfo`, `json`, `mbstring`, `openssl`, `pdo_mysql`, `tokenizer`, `xml` |
| Composer | 2.x | Manajer dependensi PHP |
| MySQL / MariaDB | 5.7 / 10.2+ | Database server |
| Git | 2.x | Version control |

### Frontend (React)

| Alat | Versi Minimum |
|------|--------------|
| Node.js | 18+ |
| npm / yarn | Terbaru |

---

## Instalasi Backend

Masuk ke folder `backend/` lalu jalankan:

```bash
cd backend

# 1. Install dependensi PHP
composer install

# 2. Salin file environment
cp .env.example .env

# 3. Generate application key
php artisan key:generate

# 4. Buat database (contoh MySQL)
mysql -u root -p -e "CREATE DATABASE sekolah CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 5. Sesuaikan DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD di .env

# 6. Jalankan migrasi dan seeder awal
php artisan migrate --seed

# 7. (Opsional) Seed data dummy historis 3 tahun ke belakang
php artisan db:seed --class=DummyHistorySeeder
```

> Akun default setelah `migrate --seed`:
> - `admin` / `password` (role: admin)
> - `pimpinan` / `password` (role: pimpinan)

---

## Migrasi Database & Seeding

```bash
# Jalankan semua migrasi
php artisan migrate

# Migrasi + seeder data awal (tahun ajaran, kelas, tarif, akun)
php artisan migrate --seed

# Seed data dummy historis (3 tahun ajaran, 180 siswa)
php artisan db:seed --class=DummyHistorySeeder
```

> Pastikan `php artisan migrate --seed` sudah dijalankan sebelum `DummyHistorySeeder`,
> karena data dummy bergantung pada akun admin dan data referensi yang sudah ada.

---

## Menjalankan Server Pengembangan

Backend:

```bash
cd backend
php artisan serve
```

Backend tersedia di `http://localhost:8000`.

Frontend:

```bash
cd frontend
npm run dev
```

---

## Antrian (Queue) untuk Email

Email peringatan masuk ("Bukan saya?") dikirim melalui antrian agar login
tidak tertahan oleh proses SMTP. Jalankan worker di background:

```bash
cd backend
php artisan queue:work --sleep=3 --tries=3 --max-time=3600
```

Di shared hosting (cPanel), lihat `CPANEL.md` untuk panduan cron job.

---

## Optimasi Produksi

Untuk server produksi, jalankan setelah konfigurasi selesai:

```bash
cd backend

php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Setelah `config:cache` / `route:cache`, perubahan `.env` atau `routes/` tidak
berlaku hingga cache dibersihkan:

```bash
php artisan config:clear
php artisan route:clear
php artisan view:clear
```

Tambahkan di `.env` produksi:

```ini
APP_DEBUG=false
LOG_STACK=single
CACHE_STORE=redis
QUEUE_CONNECTION=redis
```

---

## Perintah Artisan yang Berguna

| Perintah | Keterangan |
|----------|------------|
| `php artisan migrate` | Jalankan migrasi database |
| `php artisan migrate --seed` | Migrasi + jalankan DatabaseSeeder |
| `php artisan migrate:rollback` | Batalkan migrasi terakhir |
| `php artisan db:seed --class=DummyHistorySeeder` | Seed data dummy historis |
| `php artisan key:generate` | Generate APP_KEY |
| `php artisan config:cache` | Cache konfigurasi (produksi) |
| `php artisan route:cache` | Cache rute (produksi) |
| `php artisan config:clear` | Bersihkan cache konfigurasi |
| `php artisan route:clear` | Bersihkan cache rute |
| `php artisan queue:work` | Jalankan worker antrian |
| `php artisan test` | Jalankan test suite |
| `php artisan route:list` | Lihat semua route yang terdaftar |

---

## Troubleshooting

### "Target class [Database\Seeders\DummyHistorySeede] does not exist"

Nama kelas yang benar adalah `DummyHistorySeeder` (dengan huruf `r` di akhir):

```bash
php artisan db:seed --class=DummyHistorySeeder
```

### Email verifikasi tidak sampai

Secara default `MAIL_MAILER=log`, hanya menulis ke `storage/logs/laravel.log`.
Untuk email nyata, atur `MAIL_MAILER=smtp` dan isi konfigurasi SMTP di `.env`.

### Login gagal meski password benar

Pastikan akun `is_active = true`. Akun bendahara default nonaktif. Aktifkan
melalui halaman manajemen bendahara atau langsung via database.

### Query lambat pada laporan/dashboard

Migration `2026_11_18_000000_add_performance_indexes` menambahkan indeks pada
kolom yang sering difilter. Jalankan:

```bash
php artisan migrate
```

### Cache tidak terbarui setelah mengubah profil sekolah

Cache profil berlaku 1 jam dan di-invalidasi otomatis saat diubah. Jika masih
lama, jalankan:

```bash
php artisan cache:clear
```

---

## Lisensi

MIT
> - 3 akun bendahara (nonaktif secara default)

---

## Instalasi Frontend

```bash
cd frontend

# Install dependensi
npm install

# Build untuk produksi
npm run build

# Atau jalankan dev server
npm run dev
```

Pastikan `VITE_APP_URL` di `frontend/.env.example` menunjuk ke backend API.

---

## Konfigurasi Environment

Beberapa variabel penting di `backend/.env`:

| Variabel | Keterangan |
|----------|------------|
| `APP_URL` | URL publik backend API |
| `FRONTEND_URL` | URL frontend React SPA (tautan email peringatan masuk) |
| `BCRYPT_ROUNDS` | Kost hashing kata sandi (default: 12) |
| `MAIL_MAILER` | `log` untuk dev, `smtp` untuk produksi |
| `QUEUE_CONNECTION` | `database` untuk dev, `redis` untuk produksi |
| `CACHE_STORE` | `database` untuk dev, `redis` untuk produksi |
| `EMAIL_VERIFICATION_EXPOSE_CODE` | **JANGAN** `true` di produksi |