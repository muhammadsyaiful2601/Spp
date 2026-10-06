# Panduan Lengkap Instalasi di Shared Hosting cPanel

Panduan ini men-deploy portal ke shared hosting yang memakai cPanel. Frontend
React disajikan sebagai file statis di satu domain/subdomain, sedangkan backend
Laravel menjadi API pada subdomain terpisah.

Contoh yang dipakai:

- Frontend: `portal.sekolah.sch.id`
- API: `api.sekolah.sch.id`
- Source privat aplikasi: `~/apps/sekolah`
- Document root frontend: `~/public_html/portal`
- Document root API: `~/apps/sekolah/backend/public`

Ganti nama domain, direktori, database, akun, dan email contoh dengan nilai
milik sekolah. Tampilan dan menu cPanel berbeda antarpenyedia hosting; gunakan
nilai koneksi dan versi PHP yang ditampilkan penyedia, bukan menyalin nilai
contoh secara membabi buta.

## 1. Pastikan paket hosting cocok sebelum membeli

Hubungi penyedia hosting dan pastikan paket yang dipilih mendukung **semua**
hal berikut:

- PHP **8.3** untuk CLI/Terminal dan PHP-FPM/website, dengan ekstensi
  `pdo_mysql`, `mbstring`, `xml`/DOM, `curl`, `zip`, `intl`, `gd`,
  `fileinfo`, `openssl`, dan `bcmath`.
- Laravel dapat memakai direktori privat di luar document root. Document root
  domain/subdomain API harus bisa diarahkan langsung ke folder
  `backend/public`, bukan ke folder `backend`.
- Terminal/SSH cPanel aktif, Git tersedia, dan Composer 2 bisa digunakan.
- MySQL/MariaDB yang mendukung InnoDB dan `utf8mb4`, serta database dan user
  khusus yang dapat dibuat lewat cPanel.
- HTTPS/AutoSSL tersedia untuk domain frontend dan subdomain API.
- Symlink lokal diizinkan untuk `php artisan storage:link`.
- Email keluar melalui SMTP tersedia (layanan email hosting atau SMTP
  eksternal), dan koneksi SMTP tidak diblokir oleh provider.
- Ruang disk cukup untuk source, `vendor`, build frontend, log, upload, dan
  backup. Tanyakan juga batas inode, ukuran upload, memory PHP, dan CPU.

Untuk build frontend di server, Node.js **22.12+** dan npm juga diperlukan.
Banyak shared hosting tidak menyediakan Node.js di Terminal. Ini tidak
menggagalkan deployment: build frontend di komputer/CI lalu unggah isi
`dist/`, seperti dijelaskan di bagian 8.

**Jangan lanjutkan di paket tersebut** bila provider memaksa document root API
ke folder `backend` (bukan `backend/public`), tidak menyediakan PHP 8.3/Composer
yang cocok, melarang symlink dan tidak menawarkan solusi storage, atau
menonaktifkan Terminal. Jangan mengatasi batasan itu dengan menaruh seluruh
folder Laravel di dalam `public_html`; gunakan paket yang kompatibel atau VPS.

## 2. Siapkan domain dan subdomain

### Jika domain dan hosting dibeli dari provider yang sama

Lewati pengaturan nameserver bila domain sudah mengarah ke hosting. Pastikan
domain utama berstatus aktif dan SSL dapat diterbitkan.

### Jika domain dikelola di tempat lain

Provider hosting biasanya memberi nameserver untuk domain, atau IP/shared
hostname untuk DNS. Ikuti instruksi resmi provider. Bila memakai DNS A record,
buat record berikut menggunakan IP hosting yang diberikan provider:

| Jenis | Nama/Host | Tujuan |
| --- | --- | --- |
| A | `portal` | IP hosting |
| A | `api` | IP hosting |

Jangan menebak IP server. DNS dapat memerlukan waktu untuk tersebar. Jika provider
menggunakan Cloudflare/proxy atau meminta CNAME, ikuti konfigurasi yang mereka
sediakan.

### Tambahkan domain di cPanel

1. Masuk ke cPanel menggunakan tautan dan akun dari provider.
2. Buka **Domains** (pada versi tertentu: **Subdomains**).
3. Tambahkan `portal.sekolah.sch.id`, lalu catat atau tentukan document root
   frontend, misalnya `public_html/portal`.
4. Tambahkan `api.sekolah.sch.id`. Atur document root tepat ke folder
   `apps/sekolah/backend/public` (path relatif dari home account; UI bisa
   menampilkan path lengkap).
5. Pastikan document root API **tidak** menunjuk `apps/sekolah/backend`,
   `apps/sekolah`, atau direktori home.

Domain utama dapat dipakai sebagai frontend bila dikehendaki; dalam hal itu,
atur document root frontend ke `public_html` dan gunakan domain tersebut
konsisten di seluruh panduan. Pemisahan domain frontend/API pada contoh
memudahkan pengelolaan dan tidak membutuhkan konfigurasi cookie Sanctum karena
aplikasi mengirim token API Bearer.

## 3. Buka Terminal dan periksa lingkungan

Di cPanel buka **Terminal** (umumnya di kategori **Advanced**). Jika Terminal
tidak tersedia, minta provider mengaktifkan SSH/Terminal. Jangan menaruh
password, access token, atau isi `.env` dalam tiket publik.

Periksa lokasi home, PHP aktif, ekstensi, Git, Composer, dan Node:

```bash
printf 'HOME=%s\n' "$HOME"
pwd
php -v
php -m
command -v php
command -v git
command -v composer
composer --version
node --version
npm --version
```

- `php -v` harus menunjukkan PHP 8.3 yang sama dengan versi domain pada
  **MultiPHP Manager**. cPanel kadang memakai versi PHP CLI yang berbeda dari
  PHP web.
- Jika PHP CLI bukan 8.3, periksa daftar **PHP Selector**, dokumentasi provider,
  atau lokasi binary dari provider. Pada beberapa server CloudLinux binary
  bernama `php83`/`ea-php83`; nama dan path tidak universal. Gunakan binary PHP
  yang benar juga saat memanggil Composer dan Artisan, atau minta provider
  menyamakan versi CLI dan website.
- `php -m` harus mencakup ekstensi yang disebut pada bagian 1. Composer akan
  melaporkan ekstensi lain yang kurang.
- Jika `composer` tidak tersedia, minta instruksi Composer resmi provider.
  Jangan menjalankan installer Composer dari alamat yang tidak dipercaya atau
  menyalin `vendor` dari Windows.
- Node/npm hanya diperlukan untuk build frontend di cPanel. Jika tidak ada,
  lanjutkan ke bagian 8 dan build di komputer lain.

Di cPanel buka **MultiPHP Manager** atau **Select PHP Version**. Pilih PHP 8.3
untuk kedua domain, lalu aktifkan ekstensi yang diperlukan jika menu tersebut
tersedia. Terminal PHP dan PHP web harus memakai versi dan ekstensi yang cocok.

## 4. Unduh source ke direktori privat

Source backend, file `.env`, dependensi `vendor`, dan backup harus disimpan di
luar semua document root. Buat folder privat lalu clone branch rilis `Syaiful`:

```bash
mkdir -p "$HOME/apps"
cd "$HOME/apps"
git clone --branch Syaiful --single-branch \
  https://github.com/muhammadsyaiful2601/Spp.git sekolah
cd "$HOME/apps/sekolah"
git status --short
```

Clone HTTPS di atas sesuai untuk repository yang dapat dibaca publik. Jika
repository bersifat privat, gunakan Git Version Control cPanel dengan deploy
key read-only atau SSH key yang disiapkan sesuai panduan provider. Jangan
menempelkan GitHub Personal Access Token dalam URL clone, riwayat Terminal,
script, atau chat.

Output `git status --short` seharusnya kosong setelah clone baru. Direktori
berikut harus berada di source privat:

```text
~/apps/sekolah/
  backend/
  frontend/
```

## 5. Buat database MySQL di cPanel

1. Buka **MySQL Database Wizard** atau **MySQL Databases**.
2. Buat database, misalnya `spp`. cPanel biasanya menambahkan prefix akun,
   sehingga nama sebenarnya mungkin seperti `akunhost_spp`.
3. Buat user database khusus, misalnya `sppuser`. Nama sebenarnya juga
   mungkin menjadi `akunhost_sppuser`.
4. Buat password database acak yang kuat; simpan pada pengelola password.
5. Tambahkan user tersebut ke database dan beri **ALL PRIVILEGES**.
6. Catat nama database penuh, nama user penuh, password, serta database host
   yang ditentukan provider. Host sering `localhost`, tetapi sebagian provider
   memakai hostname terpisah. Jangan menganggap `127.0.0.1` selalu benar.

Jika akses MySQL tersedia di Terminal, uji koneksi tanpa menuliskan password
sebagai bagian dari perintah:

```bash
mysql -h localhost -u akunhost_sppuser -p akunhost_spp
```

Ganti `localhost` dan dua nama berpemilik prefix sesuai informasi cPanel. Ketik
password saat diminta; perintah `exit` untuk keluar dari prompt MySQL. Jika
perintah `mysql` tidak tersedia, lanjutkan dan uji koneksi melalui migrasi
Laravel.

## 6. Pasang dan konfigurasi Laravel API

Masuk ke backend dan pasang dependensi produksi menggunakan PHP 8.3:

```bash
cd "$HOME/apps/sekolah/backend"
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
```

Jika provider mensyaratkan binary PHP khusus dan Composer merupakan PHAR,
jalankan Composer melalui PHP yang cocok sesuai instruksi provider, misalnya
`/path/ke/php83 /path/ke/composer.phar install ...`. Jangan menebak path;
konfirmasikan kepada provider.

Buat konfigurasi backend:

```bash
cp .env.example .env
nano .env
```

Jika `nano` tidak terpasang, gunakan `vi` atau File Manager cPanel. Simpan
`backend/.env` **hanya di luar document root**. Ubah pengaturan minimal
berikut:

```dotenv
APP_NAME="Portal Keuangan Sekolah"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.sekolah.sch.id
FRONTEND_URL=https://portal.sekolah.sch.id

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=akunhost_spp
DB_USERNAME=akunhost_sppuser
DB_PASSWORD="PASSWORD_DATABASE_DARI_CPANEL"

EMAIL_VERIFICATION_EXPOSE_CODE=false
```

`DB_HOST` harus mengikuti provider, dan `DB_DATABASE`/`DB_USERNAME` harus
memakai nama lengkap yang diberikan cPanel, termasuk prefix akun.

### Atur SMTP sebelum mengaktifkan akun

Masukkan kredensial SMTP yang disediakan provider atau layanan email sekolah.
Contoh STARTTLS port 587:

```dotenv
MAIL_MAILER=smtp
MAIL_SCHEME=smtp
MAIL_HOST=mail.sekolah.sch.id
MAIL_PORT=587
MAIL_USERNAME="portal@sekolah.sch.id"
MAIL_PASSWORD="PASSWORD_ATAU_KUNCI_SMTP"
MAIL_FROM_ADDRESS="portal@sekolah.sch.id"
MAIL_FROM_NAME="${APP_NAME}"
```

Gunakan nilai dari provider; untuk TLS langsung biasanya skema `smtps` port
465. Pastikan alamat pengirim telah dibuat/diverifikasi. `MAIL_MAILER=log`
tidak mengirim email. `EMAIL_VERIFICATION_EXPOSE_CODE` **wajib `false`** di
hosting publik. Verifikasi email diperlukan aplikasi sebelum fitur portal
digunakan.

Atur izin file konfigurasi dan jalankan migrasi:

```bash
chmod 600 .env
php artisan key:generate
php artisan migrate --force
php artisan storage:link
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

`key:generate` hanya dijalankan pada instalasi baru. Jangan jalankan kembali
pada update atau pemulihan data: `APP_KEY` harus dipertahankan. Jangan jalankan
`migrate:fresh` atau `db:seed` pada produksi. `php artisan storage:link`
membuat `backend/public/storage` mengarah ke `backend/storage/app/public`;
pastikan link itu dapat diakses publik lewat domain API dan provider
mengizinkan symlink.

Berikan PHP hak tulis yang diperlukan tanpa `777`:

```bash
chmod -R u+rwX storage bootstrap/cache
```

Pada shared hosting PHP biasanya berjalan sebagai pemilik account; bila operasi
gagal, gunakan **File Manager → Permissions** atau tanya provider. Jangan
mengubah semua source menjadi writable oleh publik.

## 7. Atur document root API dan keamanan

Di cPanel → **Domains**, pastikan document root `api.sekolah.sch.id` tepat
berada di:

```text
/home/NAMA_AKUN/apps/sekolah/backend/public
```

Path aktual dapat berbeda; gunakan nilai `$HOME` dan path domain dari cPanel.
Hanya folder `backend/public` yang boleh disajikan oleh web server. Laravel
menyediakan `.htaccess` di folder tersebut untuk meneruskan request ke
`index.php`; jangan menghapusnya. Source Laravel, `.env`, `vendor`,
`storage`, dan database tidak boleh berada di document root publik.

Aktifkan directory privacy/listing protection bila ada. Jangan membuat
redirect API menuju frontend sebagai pengganti konfigurasi PHP. Pastikan
document root menjalankan PHP 8.3 dan file `index.php` di sana dapat memuat
`../vendor/autoload.php` serta `../bootstrap/app.php`. Dengan struktur source
di atas, path tersebut sudah sesuai.

Jika cPanel/provider tidak mengizinkan document root API diarahkan ke
`backend/public`, **berhenti di sini** dan minta solusi resmi provider atau
paket hosting yang mendukungnya. Jangan memindahkan `index.php` begitu saja
tanpa menyelaraskan bootstrap path, dan jangan pernah menaruh `.env` atau
seluruh source di `public_html`.

## 8. Build dan pasang frontend

Atur API production URL ketika membangun frontend:

```text
VITE_API_URL=https://api.sekolah.sch.id/api/v1
VITE_SESSION_IDLE_MINUTES=15
```

Variabel Vite dimasukkan ke bundle saat build; `.env` backend tidak
mengaturnya. Jangan pernah memasukkan password SMTP, database, `APP_KEY`, atau
token privat ke variabel `VITE_*`, karena bundle frontend dapat dibaca semua
pengunjung.

### Opsi A — build di Terminal cPanel jika Node.js tersedia

Pastikan Node.js versi 22.12 atau lebih baru tersedia (`node --version`), lalu:

```bash
cd "$HOME/apps/sekolah/frontend"
cat > .env.production <<'EOF'
VITE_API_URL=https://api.sekolah.sch.id/api/v1
VITE_SESSION_IDLE_MINUTES=15
EOF

npm ci
npm run build
```

Jika build gagal karena Node.js terlalu lama atau memory server tidak cukup,
gunakan opsi B. Jangan upgrade Node sistem bersama tanpa izin provider.

### Opsi B — build di komputer sendiri atau CI

Di komputer yang memiliki Node.js 22.12+:

1. Clone/check out branch `Syaiful` yang sama dengan backend.
2. Buat `frontend/.env.production` dengan nilai `VITE_API_URL` dan
   `VITE_SESSION_IDLE_MINUTES` di atas.
3. Jalankan `npm ci` lalu `npm run build`.
4. Unggah **isi** folder `frontend/dist/` ke document root frontend melalui
   File Manager cPanel/SFTP. Jangan unggah source frontend atau `node_modules`.

### Salin hasil build ke document root frontend

Jika menggunakan opsi A, salin hasil build ke lokasi frontend yang dipilih,
misalnya `~/public_html/portal`:

```bash
mkdir -p "$HOME/public_html/portal"
cp -a "$HOME/apps/sekolah/frontend/dist/." "$HOME/public_html/portal/"
```

Atur domain `portal.sekolah.sch.id` di cPanel agar document root menunjuk ke
direktori tersebut. Untuk domain utama, gunakan document root domain yang
sebenarnya, misalnya `~/public_html`.

Buat atau pastikan file `~/public_html/portal/.htaccess` berisi aturan Apache
berikut agar route SPA bekerja saat URL dimuat ulang:

```apache
Options -Indexes
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ index.html [L]
</IfModule>
```

Sesuaikan path jika document root bukan `public_html/portal`. Jika memakai
File Manager, aktifkan **Show Hidden Files** untuk membuat atau mengedit
`.htaccess`. Setelah setiap build, unggah kembali isi `dist/`; setiap perubahan
`VITE_*` selalu memerlukan build baru.

## 9. Aktifkan SSL/HTTPS

1. Pastikan DNS domain dan subdomain sudah mengarah sesuai panduan provider.
2. Di cPanel buka **SSL/TLS Status**, **AutoSSL**, atau menu SSL provider.
3. Jalankan **Run AutoSSL** atau aktifkan sertifikat untuk
   `portal.sekolah.sch.id` dan `api.sekolah.sch.id`.
4. Tunggu sertifikat berstatus aktif untuk kedua hostname.
5. Jika provider menyediakan opsi **Force HTTPS Redirect**, aktifkan setelah
   HTTPS berhasil diuji.

Jangan login atau memasukkan data melalui HTTP. Frontend dan API harus sama-sama
menggunakan HTTPS karena token login dikirim browser ke API.

## 10. Buat akun pimpinan pertama tanpa seeder demo

Seeder proyek membuat akun contoh dengan password bawaan dan email
placeholder. **Jangan jalankan `php artisan db:seed` atau `migrate --seed` di
hosting produksi.**

Setelah API, database, dan SMTP tersedia, dari Terminal jalankan prompt berikut
di backend. Password tidak akan ditampilkan saat diketik:

```bash
cd "$HOME/apps/sekolah/backend"
read -r -p "Nama pimpinan: " ADMIN_NAME
read -r -p "Username pimpinan: " ADMIN_USERNAME
read -r -p "Email aktif pimpinan: " ADMIN_EMAIL
read -r -s -p "Password awal yang kuat: " ADMIN_PASSWORD
printf '\n'
export ADMIN_NAME ADMIN_USERNAME ADMIN_EMAIL ADMIN_PASSWORD

php artisan tinker --execute='
\App\Models\User::create([
    "name" => getenv("ADMIN_NAME"),
    "username" => getenv("ADMIN_USERNAME"),
    "email" => getenv("ADMIN_EMAIL"),
    "password" => \Illuminate\Support\Facades\Hash::make(getenv("ADMIN_PASSWORD")),
    "role" => "pimpinan",
]);
'

unset ADMIN_NAME ADMIN_USERNAME ADMIN_EMAIL ADMIN_PASSWORD
```

Jika Terminal/provider tidak mengizinkan mode Tinker ini, minta provider atau
administrator membantu membuat **satu** akun `pimpinan` memakai Artisan/Tinker;
jangan menaruh password plaintext di file PHP publik, URL, atau tiket bantuan.
Akun dibuat dalam keadaan belum terverifikasi. Login lewat frontend, kirim kode
verifikasi, dan pastikan email masuk sebelum mengaktifkan fitur. Pimpinan dapat
membuat akun admin/bendahara dari dalam aplikasi.

## 11. Uji instalasi end-to-end

Uji konfigurasi email dari Terminal:

```bash
cd "$HOME/apps/sekolah/backend"
php artisan mail:test alamat-yang-dapat-diakses@example.com
```

Jika sebelumnya `config:cache` sudah dibuat dan nilai `.env` berubah:

```bash
php artisan config:clear
php artisan config:cache
```

Periksa endpoint berikut dari browser atau Terminal:

```bash
curl -i https://api.sekolah.sch.id/up
curl -i https://api.sekolah.sch.id/api/v1/public/sekolah-profile
curl -I https://portal.sekolah.sch.id
```

Setiap endpoint di atas seharusnya merespons HTTP 200. Bila `curl` tidak
tersedia di cPanel, buka alamat tersebut di browser. Lalu verifikasi:

1. Halaman portal tampil dengan HTTPS tanpa mixed-content warning.
2. API profile publik merespons tanpa error database.
3. Login pimpinan berhasil dan email verifikasi benar-benar diterima.
4. Pimpinan dapat membuka profil sekolah dan menyimpan nama/alamat/kontak.
5. Upload logo dan foto dapat diakses melalui API (menguji storage link).
6. Admin/bendahara dapat login, menginput pembayaran, melihat kuitansi, dan
   mengunduh laporan PDF.
7. Route frontend tetap tampil setelah browser di-refresh pada URL aplikasi.

Jalankan uji dengan data percobaan dan tinjau keterbatasan yang dicantumkan pada
bagian **Cakupan** di [README.md](README.md) sebelum memakai data keuangan
sungguhan.

## 12. Backup melalui cPanel dan Terminal

Aktifkan backup provider jika tersedia, tetapi jangan menjadikannya satu-satunya
salinan. Backup harus meliputi:

- Database MySQL.
- `backend/.env` (berisi rahasia; simpan terenkripsi dan batasi akses).
- `backend/storage/app/public` (logo, foto, dan berkas upload).

Simpan salinan di luar document root dan unduh salinan terpisah ke media/layanan
backup yang aman. Jangan pernah menaruh backup di `public_html`.

### Backup database dari Terminal

Gunakan nama database penuh dan host MySQL dari provider. MySQL meminta
password secara interaktif:

```bash
mkdir -p "$HOME/backups"
chmod 700 "$HOME/backups"
mysqldump --single-transaction -h localhost \
  -u akunhost_sppuser -p akunhost_spp \
  | gzip > "$HOME/backups/spp-$(date +%F-%H%M).sql.gz"
chmod 600 "$HOME"/backups/spp-*.sql.gz
```

Pastikan file hasil berukuran tidak nol dan unduh melalui SFTP/cPanel ke lokasi
aman. Jika provider tidak memasang `mysqldump`, gunakan **phpMyAdmin → Export**
atau fitur backup cPanel. Atur jadwal backup otomatis melalui **Cron Jobs**
hanya jika provider mendukung cron; simpan log dan arsip di luar document root,
dan jangan mencetak password ke crontab/log.

Contoh membuat arsip upload untuk dipindahkan ke lokasi aman:

```bash
tar -czf "$HOME/backups/uploads-$(date +%F-%H%M).tar.gz" \
  -C "$HOME/apps/sekolah/backend/storage" app/public
chmod 600 "$HOME"/backups/uploads-*.tar.gz
```

Salin `.env` secara manual melalui kanal backup yang dilindungi; jangan
mengirimnya lewat email/chat atau membuat salinan di area publik.

### Pemulihan database

Pemulihan menimpa database tujuan. Ambil backup keadaan saat ini dan periksa
nama database dengan cermat sebelum menjalankannya:

```bash
gzip -t "$HOME/backups/NAMA-BACKUP.sql.gz"
gunzip -c "$HOME/backups/NAMA-BACKUP.sql.gz" \
  | mysql -h localhost -u akunhost_sppuser -p akunhost_spp
```

Pulihkan `storage/app/public` dan `.env` yang cocok dengan database tersebut.
Pertahankan `APP_KEY`, lalu jalankan `php artisan config:cache`. Untuk migrasi
atau update, ambil backup terlebih dahulu.

## 13. Update aplikasi dari Terminal cPanel

Sebelum update, lakukan backup. Perintah ini mengasumsikan source di
`~/apps/sekolah` dan deployment branch `Syaiful`:

```bash
cd "$HOME/apps/sekolah"
git status --short
git pull --ff-only origin Syaiful

cd backend
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
php artisan migrate --force
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache

cd ../frontend
```

Jika Node/npm tersedia di cPanel, bangun dan pasang frontend:

```bash
npm ci
npm run build
cp -a dist/. "$HOME/public_html/portal/"
```

Jika tidak, build di komputer/CI sesuai bagian 8, lalu unggah isi `dist/` ke
document root frontend dengan File Manager/SFTP.

Jangan melanjutkan bila Git menunjukkan perubahan lokal yang tidak dikenal,
`git pull` gagal, atau Composer/migrasi/build mengembalikan error. Jangan
mengganti `.env`/`APP_KEY`, menghapus upload, atau menjalankan `migrate:fresh`.
Sesudah update, ulangi tes bagian 11. Jika cPanel tidak mengizinkan perintah
shell atau Git, unggah source rilis melalui SFTP/File Manager **tanpa**
menimpa `.env` dan `storage`; instalasi dependency dan migrasi tetap harus
dijalankan memakai Terminal atau bantuan provider.

## 14. Masalah umum di cPanel

| Gejala | Yang perlu diperiksa |
| --- | --- |
| Composer menyatakan PHP atau ekstensi tidak sesuai | Bandingkan versi `php -v`, PHP domain di MultiPHP Manager, dan `php -m`. Jalankan Composer dengan PHP CLI yang cocok atau minta provider menyamakan versinya. |
| `could not find driver` / gagal koneksi database | Aktifkan `pdo_mysql`; pastikan nama database/user dengan prefix, password, dan host MySQL provider benar. Host sering `localhost`, tetapi gunakan nilai resmi hosting. |
| API menampilkan 403/404 atau directory listing | Periksa document root domain API: harus tepat `backend/public`. Pastikan `.htaccess` dan `mod_rewrite` didukung. |
| API 500 | Lihat `backend/storage/logs/laravel.log` melalui Terminal/File Manager; periksa `.env`, cache config, PHP versi web, izin `storage` dan `bootstrap/cache`. Pastikan `APP_DEBUG=false`. |
| `storage:link` gagal | Provider mungkin membatasi symlink. Minta dukungan solusi symlink lokal yang aman. Jangan mengekspos seluruh folder `storage` dengan memindahkannya ke `public_html`. |
| Email tidak terkirim | Jalankan `php artisan mail:test ...`; periksa `MAIL_*`, TLS/port, alamat pengirim terverifikasi, cache konfigurasi, spam, dan apakah provider memblokir SMTP keluar. |
| Halaman frontend 404 setelah refresh | Tambahkan aturan rewrite SPA pada `.htaccess` document root frontend seperti di bagian 8; pastikan Apache `mod_rewrite` diaktifkan. |
| Foto/logo tidak tampil | Uji izin `storage/app/public`, symlink `public/storage`, URL `https://api.../storage/...`, dan aturan provider terhadap symlink. |
| `npm ci` kehabisan memory atau Node tidak tersedia | Build di komputer dengan Node.js 22.12+ atau CI, lalu unggah isi `dist/`. |
| SSL hanya aktif pada salah satu hostname | Aktifkan AutoSSL untuk frontend dan API satu per satu, lalu tunggu sertifikat valid untuk kedua domain. |

Log Laravel dapat dibaca dari Terminal:

```bash
tail -n 100 "$HOME/apps/sekolah/backend/storage/logs/laravel.log"
```

Jangan bagikan log tanpa menyensor email, IP, token, data siswa, dan detail
transaksi. Jangan kirim `.env`, password, private key, atau backup ke publik.

## 15. Checklist sebelum serah terima

- [ ] Paket hosting memenuhi persyaratan bagian 1.
- [ ] DNS frontend dan API menuju hosting dan HTTPS aktif pada keduanya.
- [ ] Document root API hanya `backend/public`; source dan `.env` tetap privat.
- [ ] `APP_ENV=production`, `APP_DEBUG=false`, dan `APP_KEY` tersimpan tetap.
- [ ] MySQL memakai database/user khusus dengan prefix cPanel yang benar.
- [ ] SMTP teruji; kode email verifikasi diterima.
- [ ] `EMAIL_VERIFICATION_EXPOSE_CODE=false`.
- [ ] Akun pimpinan dibuat tanpa seeder demo dan email akun terverifikasi.
- [ ] Frontend terhubung ke `https://api.../api/v1`.
- [ ] Login, profil, upload, pembayaran, kuitansi, dan laporan diuji.
- [ ] Backup database, `.env`, dan upload tersimpan di luar hosting dan dapat
  dipulihkan.
- [ ] Tidak ada password/token di source frontend, repository, atau dokumen
  publik.
