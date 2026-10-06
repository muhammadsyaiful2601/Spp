# Aplikasi Pembayaran Sekolah

Implementasi awal aplikasi pembayaran SPP dan biaya sekolah: React + Vite SPA di `frontend/` dan Laravel REST API + Sanctum di `backend/`.

> **Deploy produksi?** Ikuti [Panduan Deploy ke VPS / Hosting](DEPLOY.md) — mencakup Ubuntu + Nginx + MySQL + HTTPS, verifikasi pasca-deploy, perawatan, dan alternatif shared hosting (cPanel).

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

### Identitas & logo tersimpan di database

Seluruh branding berada di tabel `school_profiles` — bukan di `localStorage` — sehingga satu instalasi dapat dipakai untuk banyak sekolah (white-label) dan setiap perubahan pimpinan langsung terlihat di semua perangkat:

- `POST /api/v1/pimpinan/sekolah-profile` (`role:pimpinan`) — menyimpan nama sekolah, yayasan, alamat, telepon, email, dan catatan kuitansi. `receipt_template` dan `website` tidak punya kontrol di formulir, jadi nilainya dibaca ulang dan dipertahankan. Audit `profil_sekolah.ubah`.
- `POST /api/v1/pimpinan/sekolah-profile/upload-logo` (`role:pimpinan`) — mengunggah logo ke disk `public` (`logo_path`); berkas lama otomatis terhapus saat diganti. Audit `profil_sekolah.berkas`.
- `GET /api/v1/public/sekolah-profile` mengembalikan identitas + `foundation_name` + `receipt_note` + warna + logo + favicon. SPA memakai nilai server sebagai **kebenaran tunggal** (efek mirror di `App.tsx`); `localStorage` (`cendekia-profile`) hanya paint pertama saat request masih berjalan atau server tidak terjangkau.
- Tombol **Simpan profil** mengirim identitas ke server **dan** mendorong warna tema bila berbeda dari nilai server — tidak ada perubahan branding yang hanya hidup di browser. Tombol **Simpan tema** tetap tersedia untuk menyimpan warna saja.
- Halaman ini **khusus `pimpinan`**: akun `admin` (bendahara) **tidak melihat** bagian logo, favicon, dan tema warna sama sekali — hanya formulir identitas read-only tanpa tombol simpan — tetapi kartu verifikasi email di atasnya tetap aktif agar bendahara yang belum verifikasi bisa menyelesaikan verifikasi dari layar ini. Backend juga mengunci seluruh endpoint branding di `role:pimpinan`, dan handler frontend menolak aksi non-pimpinan dengan toast.
- Warna yang hanya dipratinjau (belum disimpan) akan kembali ke nilai server setelah muat ulang — perilaku yang benar; tekan **Simpan tema** atau **Simpan profil** agar bertahan.

> Logo yang selama ini hanya tersimpan di `localStorage` perangkat tidak ikut terpindah, karena memang tidak pernah sampai ke server. Pimpinan cukup mengunggah ulang logo **sekali**; setelah itu tersimpan permanen di database.


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
- Endpoint ini menerima query **`?academic_year_id=`**. Tanpa parameter, server memakai tahun ajaran yang `is_active`.

## Tahun ajaran (Academic year)

Dulu pilihan tahun ajaran di Topbar dan Dashboard hanya **hiasan** — sebuah `<span>` dan `<button>` tanpa `onClick`, sementara `fetchPortalData()` tidak pernah mengirim id. Sekarang berfungsi penuh.

### Endpoint

| Method | Endpoint | Role | Fungsi |
|---|---|---|---|
| GET | `/api/v1/data/tahun-ajaran` | `pimpinan`, `admin` | Daftar tahun ajaran + konteks (jumlah siswa, tagihan, penerimaan, `has_tariffs`) |
| POST | `/api/v1/pimpinan/tahun-ajaran` | `pimpinan` | Buat tahun baru, opsional salin tarif |
| POST | `/api/v1/pimpinan/tahun-ajaran/{id}/aktifkan` | `pimpinan` | Jadikan tahun aktif (transaksi, demote yang lain) |

Body `POST /pimpinan/tahun-ajaran`:

```json
{ "start_year": 2027, "end_year": 2028, "copy_from": 1, "is_active": false }
```

- `copy_from` menyalin seluruh `spp_periods` dan `position_rates` dari tahun tersebut, sehingga tahun baru langsung bisa dipakai tanpa tarif Rp 0.
- `end_year` **wajib** = `start_year + 1`; selain itu `422`.
- `name` otomatis `"{start}/{end}"` dan harus unik.
- Tidak ada endpoint hapus: tahun ajaran adalah arsip keuangan, jadi data historis tidak boleh hilang.

### Perilaku di frontend

- Pemilih ada di **Topbar** dan **Dashboard** (`AcademicYearSwitcher`), sinkron dengan state yang sama.
- Pilihan disimpan di `localStorage` (`cendekia-academic-year`) agar browser reopen pada tahun yang sama.
- Query key portal adalah `["portal-data", selectedYearId]`, jadi berganti tahun langsung refetch seluruh data.
- `admin` **melihat** daftar tahun ajar tetapi tombol **Aktifkan / Tahun ajaran baru** disembunyikan (`canManageYears`), bukan ditampilkan lalu gagal 403.
- Tahun tanpa tarif SPP diberi badge **"Tanpa tarif"** supaya tidak disalahartikan sebagai nol penerimaan.

### Penting: scope per tahun

Tagihan SPP terikat pada `academic_year_id`. Saat berpindah tahun, `students[].paid_months`, `summary.total_received`, dan `monthly_revenue` hanya menghitung tagihan tahun tersebut — angka tahun lalu **tidak bocor** ke tahun baru. Ini yang diuji `test_portal_can_be_scoped_to_a_specific_academic_year`.

### Keamanan

`DashboardController::portal()` menolak `academic_year_id` yang tidak ada dengan `422`. Tanpa ini, id sembarang akan diteruskan ke `summary()` dan dereference tahun `null` (fatal error).

## Kelola bendahara

Halaman **Kelola bendahara** (menu *Preferensi*, khusus `pimpinan`) untuk mengelola akun bendahara — user dengan role `admin` yang mencatat pembayaran dan mengelola data siswa.

### Endpoint

Semua di bawah `role:pimpinan`:

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/v1/pimpinan/bendahara` | Daftar bendahara + `last_login_at` |
| POST | `/api/v1/pimpinan/bendahara` | Buat akun baru |
| PUT | `/api/v1/pimpinan/bendahara/{id}` | Ubah nama / username / email |
| POST | `/api/v1/pimpinan/bendahara/{id}/password` | Atur ulang kata sandi |
| POST | `/api/v1/pimpinan/bendahara/{id}/status` | Aktifkan / nonaktifkan |

### Nonaktifkan, bukan hapus

Migration `2026_10_02_080000_add_is_active_to_users_table` menambah kolom `is_active` pada `users`.

Akun bendahara **tidak dihapus**, hanya dinonaktifkan, karena akun tersebut memiliki jejak audit transaksi yang ia catat. Menghapus barisnya akan membuat riwayat pembayaran menggantung.

Efeknya:

1. **Login ditolak** — `AuthController::login()` menolak akun `is_active = false` meski password benar, dan **tidak menerbitkan token**.
2. **Token lama langsung dicabut** — seluruh `personal_access_tokens` milik akun dihapus saat dinonaktifkan, jadi tab yang sudah terbuka kehilangan akses pada request berikutnya, bukan menunggu kedaluwarsa.
3. **Reset kata sandi juga mencabut token**, sehingga kata sandi baru menjadi satu-satunya cara masuk kembali.

### Pengaman

- **Akun `pimpinan` tidak bisa dikelola dari halaman ini.** Route model binding akan dengan senang hati me-resolve user `pimpinan`, jadi controller menolak dengan `404` — dadurch pimpinan tidak bisa menonaktifkan atau menurunkan akunnya sendiri lewat layar ini.
- **Bendahara aktif terakhir tidak boleh dinonaktifkan.** Kalau tidak, tidak ada lagi yang bisa mencatat pembayaran. Server membalas `422` dengan pesan *“Minimal harus ada satu bendahara aktif.”*
- Password selalu di-hash (cast `hashed`) dan **tidak pernah** ikut di response API.

### Role

- `pimpinan` → menu terlihat, query dijalankan, semua aksi aktif.
- `admin` → menu **tidak tampil** di sidebar dan query di-*disable* (`enabled: currentUser?.role === "pimpinan"`), jadi tidak pernah menembak endpoint yang pasti `403`.

## Log aktivitas (audit trail)

Pimpinan punya menu **Log aktivitas** di sidebar: jejak siapa melakukan apa, kapan, dari IP mana, dan terhadap data apa. Layar ini hanya membaca — tidak ada tombol ubah atau hapus.

### Bagaimana barisnya terbentuk

- Setiap perubahan **yang berhasil** memanggil `App\Support\ActivityLogger::record()` sebagai langkah terakhir, misalnya `pembayaran.spp`, `bendahara.tambah`, `tarif.spp`, `tahun_ajaran.aktifkan`, `akun.masuk`.
- Perekaman bersifat **best-effort**: setiap kegagalan ditangkap lalu `report()`, tidak pernah dilempar. Audit yang menjatuhkan request pembayaran lebih buruk daripada satu baris yang hilang.
- Baris menyimpan **snapshot** pelaku (`actor_name`, `actor_username`, `actor_role`) plus `subject_*` dan `meta`, bukan sekadar foreign key — tetap bermakna setelah akun diganti nama, dinonaktifkan, atau dihapus. `ip_address` dan `user_agent` ikut tersimpan.
- Kegagalan masuk (`akun.masuk_gagal`) tetap dicatat tanpa pelaku, sehingga percobaan sandi salah tetap terlihat.

Kategori kanonik dan labelnya ada di `ActivityLogger::CATEGORY_LABELS`: `akun`, `pembayaran`, `siswa`, `bendahara`, `tarif`, `tahun_ajaran`, `profil_sekolah`.

### Endpoint

```
GET /api/v1/pimpinan/log-aktivitas
```

Parameter: `search` (description, action, nama/username pelaku, label subjek), `category`, `from`, `to`, `per_page` (5–100, default 20).

```json
{
  "data": [
    {
      "action": "bendahara.tambah",
      "category": "bendahara",
      "category_label": "Kelola bendahara",
      "description": "...",
      "actor": { "name": "Pimpinan Sekolah", "role_label": "Pimpinan" },
      "subject": { "type": "user", "id": 3, "label": "Bendahara Baru" },
      "details": { "username": "bendahara2" },
      "ip_address": "127.0.0.1",
      "created_at": "2026-10-05T08:15:00+07:00"
    }
  ],
  "meta":     { "page": 1, "per_page": 20, "total": 42, "last_page": 3 },
  "summary":  { "total": 42, "today": 4, "actors": 2, "filtered": 17, "by_category": { "akun": 20 } },
  "categories": [ { "value": "akun", "label": "Akun & keamanan" } ]
}
```

Dua aturan yang sengaja dipisah:

- `meta` dan `summary.filtered` **mengikuti filter aktif**, sedangkan `summary.total`, `today`, dan `actors` selalu menghitung **seluruh tabel** — kartu ringkasan tidak berubah ketika pengguna memasang filter.
- `summary.by_category` dihitung dari lingkup pencarian + rentang tanggal **tanpa** filter kategori, jadi setiap pilihan di dropdown tetap menampilkan angkanya walau satu kategori sedang dipilih.
- Urutannya `created_at DESC, id DESC`; `id` adalah penentu kedua supaya paginasi tidak melompat ketika banyak baris dibuat pada detik yang sama.
- Kategori yang belum dikenal tetap ditambahkan ke daftar (labelnya di-*headline*), sehingga baris buatan versi lama tidak pernah jadi tidak terjangkau.

### Akses

- `role:pimpinan` → akun `admin` mendapat `403`.
- `verified` → akun belum verifikasi mendapat `403` dengan `code: "email_unverified"`.
- Tidak ada route tulis: `POST`/`PUT`/`DELETE` membalas `405`, karena audit trail yang bisa diedit oleh orang yang diaudit bukan lagi audit trail.

### Tampilan

- Pencarian di-debounce **300 ms** di sisi klien; permintaan memakai **15 baris per halaman**.
- Query hanya dijalankan ketika pengguna adalah `pimpinan` yang sudah terverifikasi (sama seperti query tarif), jadi layar lain tidak membayar ongkos request yang pasti `403`.
- Filter kategori dan rentang tanggal selalu mengembalikan halaman ke `1`, supaya tidak mendarat di halaman yang sudah tidak ada.
- Uji coba: `backend/tests/Feature/ActivityLogApiTest.php`.

## Username & foto profil (self-service)

Setiap akun — `pimpinan` maupun bendahara — dapat mengelola **username** dan **foto profilnya sendiri** dari layar **Akun saya**.

### Yang berubah

- `POST /api/v1/auth/profile` sekarang menerima `username` (sebelumnya read-only). Validasi: `alpha_dash`, min 3, max 100, unik.
- `GET /api/v1/auth/me` mengembalikan `photo_path`.
- `POST /api/v1/auth/photo` — unggah/ganti foto (PNG/JPG/WebP, maks 2 MB).
- `DELETE /api/v1/auth/photo` — hapus foto, kembali ke inisial.
- `GET /api/v1/pimpinan/bendahara` ikut mengembalikan `photo_path` agar avatar tampil di daftar bendahara.

Role **tidak** bisa diubah lewat endpoint ini — hanya lewat halaman **Kelola bendahara** oleh `pimpinan`.

### Foto tampil di semua tempat

Komponen `Avatar` dipakai seragam di:

| Lokasi | Tampilan |
|---|---|
| Topbar | avatar lingkaran |
| Sidebar | avatar + `@username` + peran |
| Akun saya | avatar besar + tombol ganti/hapus |
| Kelola bendahara | avatar tiap bendahara |

Kalau tidak ada foto, komponen otomatis menampilkan **inisial** dengan warna yang stabil per nama (hash), jadi tiap orang warnanya konsisten antar sesi. Jika file gagal dimuat (mis. dihapus di server), `onError` langsung fallback ke inisial — tidak pernah tampil gambar rusak.

### Penting: symlink storage

Foto disimpan di disk `public` pada folder `avatars/`. Agar bisa diakses lewat `/storage/...`, symlink **wajib** ada:

```bash
php artisan storage:link
```

Tanpa itu, upload berhasil (status `200`) tetapi gambar **tidak akan muncul** di browser.

### Mengganti foto tidak meninggalkan file yatim

`updatePhoto()` menghapus file lama **sebelum** menyimpan yang baru, jadi tidak ada file yatim yang menumpuk di `storage/app/public/avatars/`. Ini diuji dengan `assertMissing()` pada file sebelumnya.

### Test

`test_any_account_can_upload_and_replace_a_profile_photo` membuktikan: upload → ganti (file lama hilang) → hapus (kolom jadi `null`, file hilang).

## Verifikasi email & lupa kata sandi

Dua alur mandiri: **pemulihan kata sandi** (tanpa sesi) dan **verifikasi email** (menjadi kunci akses).

### ⚠️ Sebelum fitur ini bisa dipakai: atur SMTP

Semua yang ada di bawah ini **hanya bekerja kalau email benar-benar terkirim**. Tanpa konfigurasi SMTP, `MAIL_MAILER=log` hanya menulis isi email ke `storage/logs/laravel.log` — kode verifikasi tidak akan pernah sampai ke pengguna, dan akun hasil seeder tidak akan bisa membuka portal.

Isi `backend/.env`:

```env
MAIL_MAILER=smtp
MAIL_SCHEME=smtp
MAIL_HOST=smtp-relay.brevo.com
MAIL_PORT=587
MAIL_USERNAME=<kunci smtp>
MAIL_PASSWORD=<kunci smtp>
MAIL_FROM_ADDRESS="email-yang-sudah-diverifikasi@domain.sch.id"
MAIL_FROM_NAME="Portal Keuangan SDIT"
```

Lalu **buktikan** sebelum lanjut:

```bash
php artisan config:clear
php artisan mail:test alamat@email-anda
```

Perintah ini mencetak konfigurasi aktif, menolak mengirim bila mailer masih `log`, dan mengubah pesan error SMTP menjadi penyebab yang bisa ditindaklanjuti (sandi salah, port diblokir, TLS, atau pengirim belum terverifikasi).

| Provider | Host | Port | Catatan |
|---|---|---|---|
| Brevo | `smtp-relay.brevo.com` | 587 | 300 email/hari gratis |
| Gmail | `smtp.gmail.com` | 587 | **App Password**, bukan password akun (aktifkan 2FA dulu) |
| Hosting sendiri | `mail.domain.sch.id` | 587 | kredensial email Biasa |

Dua hal yang sering menggigit:

- **`MAIL_SCHEME` hanya menerima `smtp` atau `smtps`.** Nilai `tls` ditolak dengan error. `smtp` berarti STARTTLS (port 587), `smtps` berarti TLS langsung (port 465).
- **`MAIL_ENCRYPTION` sudah tidak dibaca sejak Laravel 7.** Kalau `.env` lama masih memakainya, enkripsi diam-diam tidak aktif dan credential terkirim tanpa proteksi. Hapus, pakai `MAIL_SCHEME`.

`MAIL_FROM_ADDRESS` juga wajib sudah diverifikasi di akun penyedia. Brevo dan Gmail menolak pengirim asing dengan error 550/553, dan kode verifikasi jatuh ke spam.

### Kode verifikasi tidak pernah ditampilkan di layar

Kode verifikasi dan kode atur ulang **tidak pernah dirender di browser** — tidak ada mode dev, tidak ada pratinjau, tidak ada isian otomatis.

Dulu frontend menampilkan begini:

```
Kode dikirim ke email Anda. Mode pengembangan: 978633
```

Itu berbahaya karena kode itu adalah **bukti kepemilikan akun**. Siapa pun yang melihat layar itu — orang di belakang, screenshot saat remotely, shoulder surfer di ruang bendahara — bisa memverifikasi akun atau mengambil alih kata sandinya. Untuk portal yang menyimpan data keuangan siswa, itu bukan risiko kecil.

Sekarang **tidak ada jalur kode di frontend sama sekali**. Field kode harus diketik manual dari email, persis seperti di produksi. Kalau suatu saat backend lupa menyalakan flag-nya, tampilan tetap aman karena tidak ada kode yang bisa dirender.

Gate di backend (`EMAIL_VERIFICATION_EXPOSE_CODE`) tetap ada sebagai lapis kedua, dan default-nya `false` di **semua** environment:

| Environment | Nilai | Alasan |
|---|---|---|
| Lokal | `false` | kode dibaca dari inbox atau `laravel.log` |
| Staging / preview | `false` | bisa dijangkau publik |
| Produksi | `false` | kode hanya hidup di dalam email |

Dulu syaratnya "selama bukan production", yang berarti **staging ikut membocorkan kode**. Sekarang tidak ada environment yang mewarisinya secara tidak sengaja.

Untuk mengambil kode saat pengembangan lokal:

```bash
# kalau MAIL_MAILER=log
tail -f storage/logs/laravel.log | grep -A3 "kode verifikasi"

# kalau SMTP aktif (produksi) — cukup buka inbox
```

Menonaktifkan flag ini **tidak merusak alur**: kode tetap dikirim dan tetap bisa dipakai. Yang hilang hanya atribut `dev_code` pada respons JSON, yang memang tidak boleh ada.

### Lupa kata sandi

| Method | Endpoint | Sesi |
|---|---|---|
| POST | `/api/v1/auth/forgot-password` | tidak perlu |
| POST | `/api/v1/auth/reset-password` | tidak perlu |

Isi `{ "identifier": "admin atau admin@sekolah.sch.id" }`, lalu `{ token, password, password_confirmation }`.

**Tidak membocorkan keberadaan akun.** Balasannya identik baik email terdaftar maupun tidak, dan isinya selalu kosong baik pada akun yang ditemukan maupun yang tidak. Endpoint ini tidak bisa dipakai untuk menebak siapa yang punya akun.

Kode 64 karakter **disimpan sebagai hash SHA-256** di `password_reset_tokens` — kalau tabelnya bocor, token tidak bisa dipakai. Setelah dipakai, **semua token perangkat ikut dicabut** sehingga sesi lama langsung mati bersama kata sandi lamanya.

Email reset kini memuat **tautan langsung** `FRONTEND_URL/?kode=<64 karakter>`. Tombol *Kirim tautan atur ulang* **tidak lagi langsung membuka form reset**: layar parkir di *Cek email Anda* dan menunggu — halaman reset baru terbuka tepat di langkah *buat kata sandi baru* dengan kode sudah terisi otomatis, begitu tautan di email diklik. Tiga catatan keamanannya:

- Kode **langsung dihapus dari URL** begitu halaman dibuka (`history.replaceState`), sehingga tidak menetap di address bar, history browser, maupun header `Referer`.
- Parameter `kode` hanya dipercaya kalau persis **64 karakter alphanumeric** (`Str::random(64)`); selain itu dibuang, tidak pernah disalin ke form.
- Kode mentah **tetap dicetak di email** sebagai cadangan untuk klien mail yang tidak merender tautan; layar *Cek email Anda* menyediakan tombol *Tautan tidak bisa diklik? Masukkan kode manual* yang membuka form reset manual — tautan menambah kenyamanan, tidak menghapus lapisan verifikasi.

Gerbang sebenarnya tetap di server: `POST /auth/reset-password` menuntut kode yang cocok dengan hash + masa berlaku, jadi membuka halaman reset tanpa email hanya menghasilkan form yang akan ditolak server.

### Verifikasi email

Kode 6 digit dikirim ke email lalu diinput di **halaman Profil sekolah**:

| Method | Endpoint | Sesi |
|---|---|---|
| POST | `/api/v1/auth/verification/send` | perlu |
| POST | `/api/v1/auth/verification/verify` | perlu |

- Kode disimpan sebagai **hash** dan **dihapus setelah dipakai** — hanya bisa sekali.
- Berlaku **30 menit** (`EMAIL_VERIFICATION_TTL`).
- Kirim ulang **di-throttle** (429) supaya tidak bisa dipakai spam email. Jeda kirim
  ulang adalah `EMAIL_VERIFICATION_RESEND_COOLDOWN` (**default 2 menit**) dan
  **terpisah** dari masa berlaku kode.
  > Jangan menyamakan jeda kirim ulang dengan masa berlaku. Sebelumnya throttle
  > memakai nilai TTL (30 menit), sehingga kode yang salah kirim / masuk folder
  > spam tidak bisa diganti selama setengah jam — kolom `email_verification_sent_at`
  > juga belum di-cast ke `datetime`, jadi klik "Kirim ulang" berakhir `500`,
  > bukan `429`. Keduanya sudah diperbaiki dan ditutup regression test.
- Ganti kode = kode lama otomatis batal.
  > Karena itu **jangan mengetik kode dari email lama**. Setiap kirim ulang
    mengacak kode baru dan kode sebelumnya langsung ditolak (422). Pakai selalu
    email **terbaru** di inbox.

### Peringatan masuk (email keamanan)

Setiap **login berhasil** mengirim email ke alamat pemilik akun — **hanya jika email sudah terverifikasi** (`email_verified_at` terisi). Akun seed yang belum verifikasi sengaja tidak menerima email ini.

Isi email (Bahasa Indonesia):

- **Waktu (WIB), alamat IP, dan perangkat** (hasil pembacaan `User-Agent`, mis. `Google Chrome di Windows`) — agar pembaca bisa mencocokkan dengan aktivitasnya sendiri. Waktu ditampilkan dalam WIB meski server menyimpan UTC.
- Instruksi: *"Jika Anda sendiri yang baru masuk, abaikan email ini."*
- Tombol **"Bukan saya — akhiri seluruh sesi"** menuju halaman konfirmasi bertanda tangan, dan saran segera mengubah kata sandi melalui `FRONTEND_URL/?lupa=1` (frontend langsung membuka layar **Lupa Kata Sandi**).

| Method | Endpoint | Sesi |
|---|---|---|
| GET | `/keamanan/keluar-sesi` | tidak perlu — **hanya halaman konfirmasi** |
| POST | `/keamanan/keluar-sesi` | tidak perlu — dibuktikan tanda tangan |

**Kenapa dua langkah, bukan satu tombol langsung?** GET tidak menyentuh sesi sama sekali. Pembaca email / link scanner (Gmail, Outlook, dsb.) menembakkan GET secara otomatis begitu email terbuka — kalau GET langsung mencabut sesi, pengguna yang *sah* bisa ter-logout dari portal hanya karena membuka inbox. Pencabutan baru terjadi lewat POST dari halaman konfirmasi.

- Keduanya dijaga middleware `signed`, **tanpa `auth`**: penerima mungkin sedang membaca email di perangkat yang belum masuk portal. Tanda tangan membuktikan tautan berasal dari email kita, masih berlaku (`LOGIN_ALERT_LINK_TTL_HOURS`, **default 24 jam**), dan menunjuk akun yang benar — URL tanpa tanda tangan, diutak-atik, atau kedaluwarsa membalas **403**.
- Konfirmasi mencabut **seluruh** token sesi akun (semua perangkat — kasus kata sandi bocor tidak bisa ditebak dari satu perangkat saja), lalu mencatat audit `akun.keluar_email` dengan akun yang dicabut sebagai aktor. Klik kedua kali tidak menulis audit baru: no-op bukan peristiwa.
- Kegagalan SMTP **tidak pernah membatalkan login** — dicatat via `report()`, sign-in tetap `200`. Email dikirim **sinkron**, bukan lewat antrean, karena deployment tidak menjalankan queue worker (notification yang di-queue tidak akan pernah terkirim).

Ditutup `LoginAlertEmailTest` (12 tes): kirim / tidak kirim per kondisi akun, isi email + tautan bertanda tangan, halaman GET yang inert, POST yang mencabut + audit, idempotensi, 403 untuk URL tanpa tanda tangan, diutak-atik, dan kedaluwarsa, serta dua tes throttle login di bawah.

### Proteksi brute-force (throttle rute auth)

Audit keamanan menemukan satu lubang nyata: `POST /api/v1/auth/login` **tidak punya batas percobaan** — kata sandi bisa ditebak berapa pun tanpa hambatan (SQL injection, XSS, dan CSRF sudah aman: query memakai binding, output di-escape, token `@csrf` terpasang).

Rutenya kini dibungkus **`throttle:10,1`**: maksimal **10 percobaan login per menit per IP**. Ambang itu sengaja tinggi — pengguna yang salah ketik beberapa kali tidak akan tersentuh — tapi terlalu rendah untuk menebak kata sandi (10 percobaan/menit = 14.400/hari, tetap masuk akal untuk audit rate tapi tidak cukup untuk menembus password yang kuat).

Detail yang disengaja:

- **Per IP, bukan per username** — penyerang tidak bisa menghindari throttle dengan menggilir username. Sebaliknya, satu IP yang memblokir login juga memblokir semua username dari IP itu; itu trade-off yang diterima karena dampaknya hanya satu menit.
- **Membalas JSON, bukan halaman error HTML** — frontend membaca `429` dan menampilkan *"Terlalu banyak percobaan login. Tunggu satu menit, lalu coba lagi."* (`isRateLimited()` di `frontend/src/api.ts`), bukan pesan "username atau kata sandi tidak sesuai" yang menyesatkan.
- **Throttle menghitung semua request ke rute itu**, bukan hanya yang gagal — 10 login *berhasil* beruntun dari IP yang sama juga kena batas. Wajar untuk perilaku normal.
- Setelah jendela satu menit berlalu, hitungan reset otomatis — tidak ada mekanisme unlock manual.

Ditutup dua tes di `LoginAlertEmailTest`: 10 kegagalan beruntun dijawab normal (422), percobaan ke-11 kena throttle (429 JSON, bukan HTML), dan login dengan kredensial benar tetap berhasil setelah jendela throttle terbuka.

#### Putaran kedua: tiga rute auth sisanya

Audit ulang menemukan celah serupa pada endpoint yang menjawab tebakan terhadap rahasia berukuran tetap:

| Rute | Batas | Alasan |
|---|---|---|
| `POST /auth/verification/verify` | `throttle:10,1` | Kode hanya **6 digit** (10⁶ kombinasi), berlaku 30 menit, dan sebelumnya tanpa lockout sama sekali. Tanpa batas, sesi yang dicuri (password bocor tapi inbox tidak) bisa menyapu seluruh ruang tebakan jauh sebelum kode kedaluwarsa — mengalahkan tujuan verifikasi itu sendiri. |
| `POST /auth/forgot-password` | `throttle:5,1` | Endpoint anonim: **setiap request mengirim email dan merotasi token reset** (`updateOrInsert`). Tanpa batas, ini jadi alat mail-bombing sekaligus cara membunuh kode reset yang sah di inbox korban. Sengaja lebih ketat dari login karena tiap hit punya efek nyata. |
| `POST /auth/reset-password` | `throttle:10,1` | Defence-in-depth. Token 64 karakter acak membuat tebakan tidak praktis, tapi rute tetap menerima hard stop yang sama seperti seluruh permukaan auth. |

Catatan: konfigurasi `auth.passwords.users.throttle => 60` yang ada di `config/auth.php` **tidak menolong di sini** — controller pemulihan tidak memakai Password broker (menulis `password_reset_tokens` secara manual), jadi config itu kode mati. Throttle harus ditanam di level rute.

Sama seperti login: per IP, membalas **JSON 429** (bukan halaman error HTML), dan frontend menerjemahkannya lewat `isRateLimited()` — form lupa sandi, reset, dan kartu verifikasi kini menampilkan *"Tunggu satu menit, lalu coba lagi."* alih-alih pesan yang menyesatkan.

Ditutup tiga tes di `SchoolPaymentApiTest`: 10 kode salah dijawab normal (422) lalu percobaan ke-11 kena throttle (429) dan akun tetap belum terverifikasi; 5 permintaan lupa sandi lolos lalu yang ke-6 kena throttle **sebelum mengirim email keenam**; dan 10 token reset salah dijawab 422 lalu yang ke-11 kena throttle — kata sandi tidak pernah berubah.

### Gate: akun belum verifikasi tidak bisa apa-apa

Middleware `EnsureEmailVerified` membungkus seluruh endpoint setelah `auth/*`. Yang tetap boleh hanya `auth/*`, `public/*`, dan `pimpinan/sekolah-profile` — dipakai halaman profil tempat verifikasi dilakukan.

Semua endpoint lain membalas **403** dengan penanda yang bisa dibaca mesin:

```json
{ "message": "Verifikasi alamat email Anda untuk menggunakan seluruh fitur portal.",
  "code": "email_unverified" }
```

Di sisi frontend, `navGroups` ikut disembunyikan — akun yang belum verifikasi hanya melihat satu menu **Verifikasi email**, jadi tidak ada tombol yang pasti gagal.

### Akun hasil seeder **belum** terverifikasi

`DatabaseSeeder` sengaja **tidak** mengisi `email_verified_at`, jadi `pimpinan` dan `admin` harus memverifikasi alamatnya pada login pertama.

Alasannya: akun seed memakai alamat placeholder `@example.test` yang tidak bisa menerima email. Menandainya terverifikasi berarti menyerahkan sesi siap pakai atas alamat yang **tidak pernah dibuktikan pemiliknya** — persis hal yang ingin dicegah gerbang verifikasi.

`seedUser()` memakai `forceFill()` untuk memaksa `email_verified_at` jadi `NULL`. Tanpa itu, `updateOrCreate()` hanya menulis atribut `$fillable`, sehingga baris lama **diam-diam mempertahankan** verifikasi lamanya dan `db:seed` tidak akan me-reset apa pun.

### Mengganti email membatalkan verifikasi


`POST /auth/profile` membandingkan email lama dengan baru **sebelum** disimpan. Kalau berbeda, `email_verified_at`, token, dan waktu kirim dikosongkan.

Ini bukan sekadar fitur — tanpa itu ada **lubang keamanan**: `email_verified_at` tidak termasuk `$fillable`, jadi email yang sudah terverifikasi bisa diganti ke alamat mana pun dan tetap berstatus "terverifikasi" **tanpa pernah membuktikan kepemilikannya**. Artinya siapa pun bisa menulis alamat sekolah pada akunnya dan lolos sebagai pemilik.

Akun yang sudah terverifikasi pun ikut kehilangan statusnya — alamat baru memang belum terbukti miliknya. Test `test_changing_the_email_revokes_an_existing_verification` mengunci perilaku ini.

### Mengganti alamat bawaan sendiri

Akun hasil seeder memakai alamat `@example.test` yang **tidak bisa menerima email**. Tanpa kemampuan menunjuk alamat sendiri, akun tersebut tidak akan pernah bisa verifikasi.

Karena itu kartu verifikasi menyediakan **field email yang bisa diedit** (hanya saat belum terverifikasi):

1. Ganti alamat → **Simpan**
2. **Kirim kode** (tombol terkunci selama masih ada perubahan yang belum disimpan, supaya kode tidak terkirim ke alamat lama)
3. Masukkan kode → portal aktif

Alamat yang diketik disimpan sebagai draft (`emailDraft`), jadi gagal menyimpan tidak menghilangkan isian pengguna. Email tetap harus unik.

### Sesi berakhir otomatis

Portal menyimpan token di `localStorage` supaya tab bertahan setelah restart — konsekuensinya, browser yang ditinggal terbuka **tetap masuk selamanya**. `lib/session.ts` menyimpan waktu aktivitas terakhir dan `useIdleLogout` menutup sesi saat idle melewati batas.

Yang dipantau:

- **Aktivitas pengguna** (mouse, keyboard, scroll, sentuh) — menghitung ulang idle, di-*throttle* 5 detik supaya tidak menulis `localStorage` tiap gerakan mouse.
- **Timer 15 detik** — keluar otomatis lewat `onExpire`.
- **Event `storage`** — keluar di satu tab berarti **semua tab ikut keluar**, bukan meninggalkan jendela setengah masuk.

Detail yang disengaja:

- Timestamp disimpan di `localStorage`, bukan state, jadi **reload tidak mereset penghitung idle**.
- Nilai rusak, `0`, atau negatif dianggap **idle penuh** (langsung logout), bukan "baru aktif" — usia yang tidak diketahui tidak boleh memperpanjang sesi.
- Memuat halaman dihitung sebagai aktivitas; kalau tidak, reload terlihat seperti idle.
- `logoutApi()` dibungkus `try/catch` supaya **server mati tidak menghalangi keluar** — sesi lokal tetap dibersihkan.
- `startSession()` dipanggil saat login, sehingga hitungan mulai dari saat masuk, bukan dari timestamp kunjungan sebelumnya.

Batas idle: **15 menit**, diatur lewat `VITE_SESSION_IDLE_MINUTES` di `.env.local`. Nilai yang bukan angka positif **jatuh ke 15 menit**, bukan mematikan timeout — konfigurasi salah tidak boleh membuka akses tanpa batas.

### Peringatan sebelum keluar

Karena 15 menit terasa singkat, **2 menit terakhir** menampilkan banner hitung mundur dengan tombol **"Tetap masuk"**. Tanpa itu, logout mendadak terasa sewenang-wenang dan berisiko membuang pekerjaan yang sedang dikerjakan.

### Layar memuat hanya saat login

Layar memuat penuh (`LoadingScreen`) **hanya muncul setelah menekan tombol masuk**. Reload, berpindah tab, atau membuka ulang aplikasi **tidak** menampilkannya lagi.

Dulu `schoolProfileQuery` dan `portalQuery` ikut memicu layar penuh. Karena cache React Query hanya hidup di memori, setiap cold start selalu kosong — sehingga **refresh biasa saja sudah mengganti seluruh antarmuka dengan layar splash**. Padahal data yang di-fetch kedua query itu sudah dicerminkan ke `localStorage` dan dipakai sebagai initial state, jadi selalu ada isi nyata untuk ditampilkan.

Sekarang aplikasi merender angka terakhir yang diketahui **langsung**, lalu memperbaikinya sendiri di latar belakang saat respons datang. Pembaruan itu dibungkus `startTransition`, jadi React menahan tampilan lama sampai data baru siap — tidak ada kedip.

| Kejadian | Tampilan |
|---|---|
| Tekan tombol masuk | Layar memuat penuh |
| Reload / buka tab lain | Langsung tampil, data disegarkan diam-diam |
| Unduh PDF | Spinner di tombolnya sendiri |

Ekspor PDF dulu ikut memunculkan layar penuh. Itu lebih buruk dari menunggunya: laporan yang sedang dibaca menghilang dan muncul kembali beberapa saat kemudian. Sekarang hanya tombol ekspor yang berputar dan dinonaktifkan.

State hitung mundur **hanya** diperbarui saat banner sudah tampil. Kalau tidak, aplikasi akan renders ulang tiap beberapa detik sepanjang sesi — pemborosan untuk sesuatu yang tidak terlihat.




## Pengaturan tarif
Dulu kedua tab di halaman ini **tidak benar-benar menyimpan apa pun**: tombol **Simpan pengaturan** hanya menjalankan `setSaved(true)` — perubahan state lokal tanpa satu pun panggilan API. Ditambah data yang ditampilkan pun hardcoded: `Kelas I`–`Kelas VI`, `TAHUN AJARAN 2026 / 2027`, dan `Terakhir diperbarui 28 September 2026`.

Sekarang seluruh halaman membaca dan menulis ke database.

### Endpoint

Semua di bawah `role:pimpinan`:

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/v1/pimpinan/tarif-spp` | Daftar periode SPP (`?academic_year_id=`) |
| POST | `/api/v1/pimpinan/tarif-spp` | Tarif SPP semua kelas sekaligus |
| GET | `/api/v1/pimpinan/tarif-non-spp` | Tarif biaya per tingkat kelas |
| POST | `/api/v1/pimpinan/tarif-non-spp` | Simpan nominal + status aktif |
| POST | `/api/v1/pimpinan/pos-biaya` | Tambah pos biaya baru |

### Kenapa endpoint baru (bulk)

Endpoint lama `POST /spp-periode` bekerja **satu baris per permintaan**. Untuk 6 kelas × 2 semester itu **12 request**, dan untuk 5 pos × 6 kelas justru **30 request**. Kalau salah satu gagal di tengah, form berakhir setengah tersimpan.

`POST /tarif-spp` dan `POST /tarif-non-spp` menerima seluruh form dalam **satu request transaksional**, jadi semua atau tidak sama sekali.

### Detail penting

- **Satu nominal per kelas berlaku untuk kedua semester.** Backend memperbarui *semua* baris `spp_periods` milik kelas tersebut, jadi angka di UI benar-benar berlaku untuk ganjil **dan** genap.
- **Kelas baru otomatis dapat tarif.** Bila sebuah kelas belum punya baris `spp_periods`, dua semester standar (Ganjil 7–12, Genap 1–6) dibuat otomatis — tanpa ini kelas baru diam-diam berharga Rp 0.
- **Pos biaya baru langsung tertarif di semua tingkat kelas**, jadi bisa langsung dipakai di menu Pembayaran.
- **Switch aktif/nonaktif benar-benar berfungsi.** Menonaktifkan sebuah pos menyembunyikannya dari pilihan pembayaran (karena `position_rates` hanya mengambil `payment_positions.is_active = true`), dan mengaktifkannya kembali menampilkannya.
- State di frontend hanya menyimpan **nilai yang sudah diubah user** (`sppDrafts` / `costDrafts`); sisanya diturunkan saat render. Ini menghindari `setState` di dalam `useEffect` yang memicu render berantai — pola itu memang caught oleh aturan lint `react(set-state-in-effect)`.

### Tampilan

- Tahun ajaran dan daftar kelas dibaca dari server, mengikuti **tahun ajaran yang sedang dipilih** di Topbar.
- "Terakhir disimpan" memakai waktu sebenarnya dari Aksi terakhir, bukan tanggal hardcoded.
- Error API (mis. nama pos duplikat, tarif negatif) ditampilkan di halaman sebagai banner merah.

### Seeder = akun saja

`DatabaseSeeder` **hanya** membuat dua akun login:

| Username | Password | Role |
|---|---|---|
| `pimpinan` | `password` | pimpinan |
| `admin` | `password` | admin |

Tidak ada siswa, tagihan, transaksi, atau profil sekolah yang dibuat otomatis.

### Reference data dipindah ke migration

Karena **belum ada endpoint** untuk membuat `class_levels`, data ini dipindah ke migration `2026_10_01_070000_seed_school_reference_data` (selalu ada, bukan dummy):

- 1 tahun ajaran awal (`2026/2027`) — tahun berikutnya dapat dibuat lewat UI (lihat bagian **Tahun ajaran**)
- 6 tingkat kelas (Kelas I–VI)
- 5 pos biaya + tarif per kelas
- 2 periode SPP per kelas (Ganjil/Genap)

Nilainya tetap dapat diubah `pimpinan` dari layar **Pengaturan tarif**. `school_profiles` sengaja **tidak** diisi migration — barisnya dibuat otomatis oleh `firstOrCreate()` memakai `APP_NAME`, dan identitas sekolah diisi lewat layar **Profil sekolah**.

### Instalasi baru

```
# 1. Isi kredensial SMTP di .env lebih dulu (lihat bagian Verifikasi email)
php artisan config:clear

# 2. Pastikan email benar-benar bisa keluar. Kalau gagal, berhenti di sini.
php artisan mail:test alamat@email-anda

# 3. Baru pasang skema datanya
php artisan migrate --force
php artisan db:seed --force
php artisan storage:link

# 4. Optimalkan untuk produksi
php artisan config:cache
```

> **Jangan sampai urutan ini tertukar.** `config:cache` membuat Laravel berhenti membaca `.env`, jadi kalau kredensial SMTP diisi **setelah** langkah 4, perubahan itu diam-diam tidak berlaku dan email kembali gagal tanpa error yang mencolok.

> Pada server publik, `EMAIL_VERIFICATION_EXPOSE_CODE` **wajib `false`**. Nilai ini di-cache bersama config di atas.

> Frontend menyimpan cache baca-aja di `localStorage` (`cendekia-students`, `cendekia-transactions`, `cendekia-spp-amounts`, `cendekia-profile`). Gunakan tombol **Bersihkan cache** di halaman **Akun saya** untuk menghapusnya sekaligus mengosongkan cache React Query — lihat [Bersihkan cache](#bersihkan-cache). Key juga bisa dihapus manual lewat devtools. Semua angka dashboard (total penerimaan, tunggakan, grafik bulanan) berasal dari database.

## Bersihkan cache

Portal menyimpan dua lapis cache agar tampilan pertama tetap cepat:

1. **`localStorage`** — salinan baca-aja `cendekia-students`, `cendekia-transactions`, `cendekia-spp-amounts`, dan `cendekia-profile`.
2. **React Query (memori browser)** — semua respons API, dengan `staleTime` 60 detik.

Tombol **Bersihkan cache** pada halaman **Akun saya** (tersedia untuk semua role) membersihkan kedua lapisan sekaligus:

- Menghapus salinan `localStorage` di atas. Sesi (`cendekia-token`, `cendekia-user`) dan preferensi (`cendekia-academic-year`, `cendekia-read-notices`) **tidak disentuh** — pembersihan tidak pernah mengeluarkan pengguna dari akunnya.
- Membuang query yang tidak sedang dipakai dari memori, lalu mengambil ulang query yang aktif di layar dari server; hasilnya menulis kembali salinan `localStorage` dengan data segar. Tampilan tidak pernah blank — data lama tetap ada sampai data baru tiba.
- Toast menampilkan perkiraan ukuran yang dibebaskan, misal `Cache dibersihkan (±512 KB). Data dimuat ulang dari server.`

Sisi server **tidak memakai cache sama sekali** (tidak ada pemakaian `Cache::` atau helper `cache()` di backend), sehingga tidak ada artisan cache yang perlu dijalankan — setiap angka dashboard dihitung langsung dari database.

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

## Kontributor

Proyek ini dikembangkan oleh manusia bersama empat asisten AI:

| Kontributor | Peran |
| --- | --- |
| [muhammadsyaiful2601](https://github.com/muhammadsyaiful2601) | Pemilik & pengembang utama |
| [Muse Spark](https://developers.google.com/gemini) (Google) | Asisten AI |
| [Claude](https://claude.ai) (Anthropic) | Asisten AI |
| [ChatGPT](https://chat.openai.com) (OpenAI) | Asisten AI |
| [Muse](https://github.com/features/copilot) (GitHub) | Asisten AI |

## Data dummy pengetesan

Seeder `DummyHistorySeeder` mengisi tiga tahun ajaran histori
(2023/2024–2025/2026) dengan 180 siswa (30 per kelas), tarif, 6.480 tagihan
SPP, 2.700 tagihan non-SPP, dan ±8.200 transaksi berpola realistis
(~83% bulan SPP lunas, 108 tagihan berstatus `sebagian`) sehingga
dashboard, grafik, dan laporan bisa diuji dengan isi yang menyerupai
data nyata. Tarif histori dimundurkan ~5% per tahun dari tarif aktif
agar tren grafik terlihat naik.

```powershell
cd backend
php artisan db:seed --class=DummyHistorySeeder
```

- **Hanya untuk lokal/pengetesan** — jangan dijalankan di produksi karena
  mengacak nomor transaksi dan menambah ratusan baris.
- **Idempoten** — aman dijalankan ulang; baris dummy sebelumnya (prefix
  `DUM-`) dihapus dulu sebelum diisi kembali.
- **Tidak merusak test suite** — seeder ini tidak dipanggil dari
  `DatabaseSeeder`, jadi `migrate --seed` dan `php artisan test` tetap
  memakai data minimal yang cepat.
