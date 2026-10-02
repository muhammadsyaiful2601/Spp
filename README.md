# Aplikasi Pembayaran Sekolah

Implementasi awal aplikasi pembayaran SPP dan biaya sekolah: React + Vite SPA di `frontend/` dan Laravel REST API + Sanctum di `backend/`.

## Menjalankan aplikasi

> **Penting:** port backend dan `VITE_API_URL` harus sama persis. Default
> `php artisan serve` memakai **8000**.

Terminal 1:

```powershell
cd backend
php artisan migrate --seed
php artisan storage:link
php artisan serve            # berjalan di http://127.0.0.1:8000
```

Terminal 2:

```powershell
cd frontend
Copy-Item .env.example .env.local   # VITE_API_URL=http://127.0.0.1:8000/api/v1
npm run dev
```

Buka `http://localhost:5173`. Frontend mengambil branding publik dan seluruh data
siswa, tagihan, transaksi, tarif, serta tema dari API.

### Jika tidak bisa login

Pesan di layar login sudah membedakan dua kemungkinan:

| Pesan | Arti | Solusi |
| --- | --- | --- |
| `Username atau kata sandi tidak sesuai.` | Server hidup, kredensial salah | Periksa username/kata sandi |
| `Server tidak dapat dihubungi. Pastikan backend berjalan, lalu coba lagi.` | Permintaan tidak sampai ke server | Jalankan `php artisan serve`, dan cocokkan `VITE_API_URL` dengan portnya |

Bila port tidak cocok, browser diam-diam gagal tanpa pesan jelas. Periksa dengan:

```powershell
curl -o NUL -w "%{http_code}" http://127.0.0.1:8000/api/v1/public/sekolah-profile
# harus: 200
```

## Halaman Akun Saya

Halaman profil **pribadi** yang tersedia untuk semua pengguna, berbeda dari
halaman *Profil sekolah* yang hanya untuk `pimpinan`.

| Endpoint | Keterangan |
| --- | --- |
| `GET /api/v1/auth/me` | Data akun sendiri: username, nama, email, role, tanggal bergabung |
| `POST /api/v1/auth/profile` | Ubah nama dan email sendiri |
| `POST /api/v1/auth/password` | Ubah kata sandi (wajib Menyertakan kata sandi lama) |

- `username` dan `role` **tidak** dapat diubah dari antarmuka.
- Email harus unik dan tervalidasi formatnya.
- Kata sandi baru minimal 8 karakter dan harus dikonfirmasi.
- Setelah kata sandi diubah, sesi di perangkat lain dicabut, tetapi perangkat
  yang sedang digunakan tetap masuk.

### Navigasi

Menu **AKUN → Akun saya** di sidebar muncul untuk `pimpinan` maupun `admin`.
Blok identitas di bawah sidebar (nama + avatar) juga bisa diklik untuk membuka
halaman ini, dengan dukungan keyboard (`Enter`/`Spasi`).

## Sesi pengguna

Token dan data pengguna disimpan di **`localStorage`**, bukan `sessionStorage`.
Sesi tetap aktif saat berpindah tab, menutup tab, atau me-restart browser, dan
hilang hanya setelah menekan tombol Keluar.

- Token yang tertinggal di `sessionStorage` versi lama dimigrasikan otomatis ke
  `localStorage` saat aplikasi dimuat, jadi pengguna tidak ikut terlempar keluar.
- Respons `401` otomatis membersihkan sesi, agar antarmuka kembali ke halaman
  login alih-alih looping request gagal.
- Semua pembacaan/penulisan storage dibungkus `try/catch` agar tetap berjalan
  saat penyimpanan browser dinonaktifkan (mis. mode privat).

## Akun lokal

Seeder hanya membuat akun berikut pada environment `local` dan `testing`:

| Peran | Username | Kata sandi |
| --- | --- | --- |
| Pimpinan | `pimpinan` | `password` |
| Admin | `admin` | `password` |

Ganti kredensial sebelum deployment. Atur database MySQL, `APP_URL`, HTTPS, dan kredensial storage pada `.env` server.

## Cakupan

SPA menyediakan loading screen bermerek, login/logout Sanctum dengan sesi persisten, dashboard, daftar dan pencarian siswa, input pembayaran SPP/non-SPP, kuitansi siap cetak, pengaturan tarif, profil sekolah/logo, favicon tab browser yang dapat diunggah dan dihapus oleh pimpinan, tema warna Islami yang dapat dipilih pimpinan, notifikasi bell, tanggal dan jam di navbar, serta ekspor CSV dan PDF laporan berkop sekolah. API mencakup autentikasi token, otorisasi role, profil dan validasi upload, tema sekolah, tarif SPP/biaya, data siswa/tagihan, pembayaran atomik, kuitansi JSON, laporan, dan satu endpoint agregat `/data/portal`. Belum termasuk penulisan CRUD/transaksi SPA ke API, ekspor Excel, atau isolasi data multi-tenant; tinjau dan lengkapi sebelum deployment komersial.

## Tema Islami (SDIT) & warna kustom

Nuansa aplikasi mengikuti identitas **SDIT (Sekolah Dasar Islam Terpadu)**:

- **Emblem kubah masjid** (`MosqueMark`) menggantikan ikon graduasi di sidebar, halaman masuk, layar muat, kuitansi, dan favicon bawaan.
- **Salam Islami** — “Assalamu'alaikum” dipakai pada judul dashboard dan headline halaman masuk.
- **Bintang delapan (Rub el Hizb)** (`StarMotif`) sebagai motif dekoratif pada kartu semester dan editor tema.
- **Pola geometris Islami** sebagai latar panel visual halaman masuk (SVG data-URI, tanpa request eksternal).
- Label sidebar dan halaman masuk menjadi `SDIT · PORTAL KEUANGAN`.

### Warna dapat diganti pimpinan

| Preset | Warna utama | Aksen |
|---|---|---|
| Hijau Putih *(bawaan)* | `#24634e` | `#c88942` |
| Toska Keemasan | `#1f6f6b` | `#c9a227` |
| Biru Nila | `#2b5c8a` | `#d4a017` |
| Marun Acts | `#7d2c34` | `#cfa14b` |
| Ungu Noble | `#4a3b78` | `#c9a961` |
| Biru Muda | `#35618f` | `#3f9d8f` |

- `POST /api/v1/pimpinan/sekolah-profile/theme` (`role:pimpinan`) — menyimpan `theme_primary` dan `theme_accent` pada `school_profiles`. Nilai divalidasi sebagai heksadesimal 6 digit.
- Kedua warna juga dikembalikan oleh `GET /api/v1/public/sekolah-profile`, sehingga **seluruh pengguna** (termasuk yang belum masuk) melihat tema yang sama.
- Layar **Profil sekolah** menyediakan preset, color picker bebas, dan pratinjau langsung. Perubahan tampil seketika sebelum disimpan.

### Cara kerja ramp warna

`applyTheme()` di `frontend/src/api.ts` menurunkan seluruh turunan dari dua warna tersebut lalu menulisnya sebagai custom property ke `<html>`:

```
--brand, --brand-deep, --brand-dark, --brand-nav, --brand-mid, --brand-strong,
--brand-soft, --brand-tint, --brand-border, --brand-ink, --brand-ring, --brand-shadow,
--accent, --accent-light, --accent-soft, --accent-tint, --accent-ink, --accent-glow
```

Semua permukaan bermerek di `index.css` dan `login.css` membaca variabel tersebut, sehingga satu pilihan warna langsung menata ulang sidebar, tombol, grafik, badge, avatar, focus ring, dan panel halaman masuk. Nilai bawaan juga ditulis di `:root` supaya render pertama tidak berkedip.

## Data portal (dummy → database)

Seluruh data siswa, tagihan, dan transaksi diambil dari database. **Tidak ada lagi data contoh** — instalasi baru benar-benar kosong dan diisi lewat aplikasi.

- `GET /api/v1/data/portal` (`auth:sanctum`, role `pimpinan` atau `admin`) — satu payload berisi `students`, `transactions`, `class_levels`, `spp_rates`, `position_rates`, `academic_year`, dan `summary`.
- Field `paid_months` memakai **urutan tahun ajaran** (0 = Jul … 11 = Jun) agar cocok dengan grid bulan di UI.
- `summary.total_received`, `summary.spp_arrears`, `summary.non_spp_arrears`, dan `summary.monthly_revenue` (12 bucket Jul–Jun) dihitung dari `payment_transactions` dan `spp_bills`.

### Seeder = akun saja

`DatabaseSeeder` **hanya** membuat dua akun login:

| Username | Password | Role |
|---|---|---|
| `pimpinan` | `password` | pimpinan |
| `admin` | `password` | admin |

Tidak ada siswa, tagihan, transaksi, atau profil sekolah yang dibuat otomatis.

### Reference data dipindah ke migration

Karena **tidak ada endpoint** untuk membuat `class_levels` dan `academic_years`, data ini dipindah ke migration `2026_10_01_070000_seed_school_reference_data` (selalu ada, bukan dummy):

- 1 tahun ajaran aktif (`2026/2027`)
- 6 tingkat kelas (Kelas I–VI)
- 5 pos biaya + tarif per kelas
- 2 periode SPP per kelas (Ganjil/Genap)

Nilainya tetap dapat diubah `pimpinan` dari layar **Pengaturan tarif**. `school_profiles` sengaja **tidak** diisi migration — barisnya dibuat otomatis oleh `firstOrCreate()` memakai `APP_NAME`, dan identitas sekolah diisi lewat layar **Profil sekolah**.

### Instalasi baru

```
php artisan migrate --force
php artisan db:seed --force
php artisan storage:link
```

> Frontend menyimpan cache baca-aja di `localStorage` (`cendekia-students`, `cendekia-transactions`, `cendekia-spp-amounts`, `cendekia-profile`). Hapus key tersebut bila ingin memaksa refresh dari server. Semua angka dashboard (total penerimaan, tunggakan, grafik bulanan) berasal dari database.

## Favicon sekolah

Favicon diatur oleh peran `pimpinan` pada halaman **Profil sekolah** (menu *Preferensi → Profil sekolah*):

- `POST /api/v1/pimpinan/sekolah-profile/upload-favicon` (`multipart/form-data`, field `favicon`) — PNG, JPG, WebP, atau ICO maksimal 512 KB. SVG ditolak untuk mencegah stored XSS. Mengunggah ulang akan otomatis menghapus berkas lama.
- `DELETE /api/v1/pimpinan/sekolah-profile/favicon` — menghapus favicon sekolah.

Berkas tersimpan pada disk `public` dan disajikan lewat `/storage/...` (jalankan `php artisan storage:link`). Nilai `favicon_path` ikut dikembalikan oleh `GET /api/v1/public/sekolah-profile` sehingga seluruh pengguna SPA memakai favicon yang sama.

### Urutan prioritas tab browser

`applyFavicon()` memilih sumber ikon tab secara berurutan:

1. `favicon` yang diunggah oleh `pimpinan` (disimpan di server).
2. `logo_path` sekolah — dipakai otomatis bila favicon belum diunggah.
3. `/favicon.svg` — ikon bawaan aplikasi (graduasi hijau merek), sudah diganti dari logo template Vite.

Judul tab juga ikut mengikuti nama sekolah (`<title>` = `{nama sekolah} · Portal Keuangan`) melalui `useEffect` pada `profile.school`.

> Browser melakukan cache secara agresif terhadap favicon. Setelah mengunggah favicon baru, muat ulang dengan **hard reload** (`Ctrl+Shift+R`) bila tab masih menampilkan ikon lama.
