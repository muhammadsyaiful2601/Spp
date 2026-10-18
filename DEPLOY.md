# Hosting — Kartu Hafalan

Dokumen ini hanya berisi yang **wajib diingat**. Langkah lengkap per_menu ada di
[CPANEL.md](CPANEL.md) (shared hosting cPanel). Baca kartu ini dulu, kerjakan,
baru buka CPANEL.md kalau ada yang jeblok.

Aplikasi ini dua bagian: **frontend** (React/Vite, di domain portal) dan
**backend** (Laravel, di domain API).

---

## Hafal: 5 LANGKAH, URUTANNYA TIDAK BOLEH DIKABAIL

| # | Langkah | Inti |
|---|---|---|
| 1 | Domain + SSL | HTTPS untuk **kedua** domain (portal & API). Tanpa SSL, token login terkirim polos. |
| 2 | Database MySQL | Database + user khusus. Jangan pakai `root`. |
| 3 | Isi `backend/.env` | Semua rahasia **+** `APP_URL` **+** `FRONTEND_URL`. |
| 4 | Isi `.env` root, lalu build | `CORS_ALLOWED_ORIGINS` + `VITE_API_URL`, **lalu `npm run build`**. |
| 5 | Uji 3 alur | Login → verifikasi email → lupa kata sandi. |

---

## Hafal: 3 NILAI YANG PALING SERING SALAH

Cuma tiga. Kalau lupa sesuatu, hampir pasti salah satu dari tiga ini.

**1. `FRONTEND_URL` — di `backend/.env`**
Dipakai backend untuk membuat tautan di email. Salah isi ⇒ tombol "Buka halaman
atur ulang" di email mengarah ke localhost, dan user tidak bisa selesai reset
kata sandi sama sekali.

**2. `VITE_API_URL` — di `.env` root, lalu BUILD ULANG**
Dibaca browser dan **DIBEKUKAN saat `npm run build`**. Ubah `.env` tanpa build
 ulang ⇒ portal masih memanggil API `localhost`. Gejalanya persis seperti
"server tidak dapat dihubungi" padahal server jalan baik.

**3. `CORS_ALLOWED_ORIGINS` — di `.env` root**
Kosong ⇒ browser memblokir seluruh panggilan lintas-origin dan login gagal.

---

## Hafal: 2 JEBAKAN

**Jebakan 1 — `backend/.env` menang atas `.env` root.**
Untuk kunci yang muncul di kedua file, yang dipakai adalah nilai di
`backend/.env`. Jadi `APP_URL` dan `FRONTEND_URL` — yang sudah ada di
`backend/.env.example` — **harus diubah di `backend/.env`**. Mengubahnya di
root `.env` saja tidak ada efeknya.

`.env` root hanya berkuasa untuk kunci yang tidak disebut `backend/.env`, yaitu
`CORS_ALLOWED_ORIGINS` dan nilai `VITE_*`.

**Jebakan 2 — `EMAIL_VERIFICATION_EXPOSE_CODE` harus `false`.**
Kalau `true`, kode verifikasi ikut dikembalikan dalam respons API, dan siapa pun
bisa memverifikasi akun orang lain tanpa akses ke inbox-nya. Hanya `true` saat
menjalankan test otomatis.

---

## PERINTAH SETELAH ISI ENV

```sh
cd backend
php artisan key:generate
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
php artisan migrate --force
php artisan storage:link
php artisan config:cache

cd ../frontend
npm install
npm run build
```

`config:cache` **membekukan** seluruh konfigurasi. Kalau nanti mengubah `.env`,
wajib `php artisan optimize:clear` lalu `config:cache` lagi, kalau tidak
perubahan itu tidak terbaca sama sekali.

---

## TIDAK BOLEH DILUPAKAN

- **Queue worker.** Setiap login yang berhasil mengirim email peringatan lewat
  queue (`QUEUE_CONNECTION=database`). Tanpa worker, email itu tidak pernah
  terkirim dan tidak ada error yang muncul — login tetap sukses. Pasang cron:

  ```cron
  * * * * * cd /home/AKUN/apps/sekolah/backend && php artisan queue:work --stop-when-empty --tries=1 >> /dev/null 2>&1
  ```

- **Uji SMTP sebelum menghidupkan akun.** `MAIL_MAILER=log` hanya menulis ke
  log — kode verifikasi tidak pernah sampai ke user. Buktikan dengan
  `php artisan mail:test alamat@email-anda`.

- **Port SMTP menentukan `MAIL_SCHEME`.** Port 587 ⇒ `MAIL_SCHEME=smtp`
  (STARTTLS). Port 465 ⇒ `MAIL_SCHEME=smtps` (TLS langsung). Kalau salah, email
  gagal diam-diam.

- **Akun pertama** dibuat tanpa seeder demo, lalu emailnya diverifikasi.

- **Backup database + `backend/.env` + folder upload**, disimpan di luar
  hosting. Kalau `APP_KEY` hilang, semua password dan token tidak bisa dibaca
  lagi.