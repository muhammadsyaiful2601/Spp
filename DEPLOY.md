# Panduan Hosting dan Deploy

Dokumen ini menjelaskan cara men-deploy portal ke server Ubuntu 24.04 dengan
Nginx, PHP-FPM, MySQL, dan HTTPS. Frontend React dibangun menjadi file statis;
backend Laravel menyediakan API. Contoh domain yang digunakan:

- Frontend: `portal.sekolah.sch.id`
- API: `api.sekolah.sch.id`

Ganti semua domain, password, email, nama database, dan nama pengguna contoh
dengan milik sekolah. Perintah server di bawah dijalankan pada VPS melalui SSH.

## 1. Arsitektur dan kebutuhan

```text
Browser
  ├── https://portal.sekolah.sch.id ── Nginx ── frontend/dist (React SPA)
  └── https://api.sekolah.sch.id    ── Nginx ── PHP-FPM ── Laravel ── MySQL
```

| Bagian | Persyaratan |
| --- | --- |
| Sistem operasi | Ubuntu 24.04 LTS |
| Web server | Nginx |
| PHP | PHP 8.3, ekstensi MySQL, XML, cURL, Mbstring, ZIP, Intl, GD, dan BCMath |
| Database | MySQL 8 |
| Frontend build | Node.js 22 (Vite 8 memerlukan Node.js 20.19+ atau 22.12+) |
| Dependensi PHP | Composer 2 |
| Domain | Dua subdomain dengan DNS mengarah ke IP VPS |
| Email | Akun SMTP yang dapat mengirim email verifikasi dan pemulihan akun |

Tidak perlu menjalankan `npm run dev`, `php artisan serve`, Redis, atau queue
worker pada produksi. Nginx menyajikan hasil build React dan meneruskan PHP ke
PHP-FPM. Notifikasi email dikirim sinkron oleh aplikasi.

## 2. Siapkan domain, VPS, dan firewall

1. Buat dua DNS **A record**:
   - `portal.sekolah.sch.id` → IP publik VPS.
   - `api.sekolah.sch.id` → IP publik VPS.
2. Siapkan VPS Ubuntu 24.04. VPS 2 vCPU dan RAM 4 GB cukup untuk instalasi
   dasar, tetapi kebutuhan sebenarnya bergantung pada banyaknya pengguna.
3. Izinkan port TCP **22** (SSH), **80** (HTTP untuk penerbitan/redirect
   sertifikat), dan **443** (HTTPS) pada firewall penyedia VPS.
4. Jika memakai UFW, aktifkan aturan berikut setelah memastikan akses SSH
   diizinkan:

   ```bash
   sudo ufw allow OpenSSH
   sudo ufw allow 'Nginx Full'
   sudo ufw enable
   sudo ufw status
   ```

Jangan membuka port MySQL (3306) ke internet. Gunakan password SSH/key yang
kuat dan jangan menonaktifkan firewall.

## 3. Pasang paket server

Masuk ke VPS menggunakan akun sudo. Perintah berikut memakai `sudo`; jika sudah
masuk sebagai `root`, hilangkan awalan `sudo`.

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y nginx mysql-server git curl unzip \
  php8.3-fpm php8.3-cli php8.3-common php8.3-mysql php8.3-mbstring \
  php8.3-xml php8.3-curl php8.3-zip php8.3-bcmath php8.3-intl php8.3-gd
```

Pasang Composer 2 dan Node.js 22:

```bash
cd /tmp
curl -fsSLO https://getcomposer.org/installer
php installer --install-dir=/usr/local/bin --filename=composer
rm installer

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

php -v
composer --version
node --version
npm --version
```

Pastikan `php -v` menunjukkan 8.3 atau lebih baru yang didukung proyek,
`node --version` menunjukkan 22.12 atau lebih baru, dan `composer --version`
menunjukkan Composer 2. Bila salah satu versi tidak cocok, hentikan instalasi
dan pasang versi yang memenuhi persyaratan sebelum melanjutkan.

## 4. Buat database dan pengguna aplikasi

Jalankan konfigurasi keamanan MySQL, lalu buka shell MySQL:

```bash
sudo mysql_secure_installation
sudo mysql
```

Di prompt MySQL, buat database dan pengguna khusus aplikasi. Ganti nilai
password dengan password acak yang kuat dan simpan di pengelola password:

```sql
CREATE DATABASE spp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'spp'@'127.0.0.1' IDENTIFIED BY 'GANTI_DENGAN_PASSWORD_ACAK_YANG_KUAT';
GRANT ALL PRIVILEGES ON spp.* TO 'spp'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

Pengguna aplikasi tidak perlu diberi akses MySQL dari host selain loopback VPS.

## 5. Ambil kode dan pasang backend

Contoh ini menempatkan source di `/var/www/sekolah`. Perintah clone dijalankan
sebagai pengguna deployment yang memiliki izin menulis ke direktori tersebut.

```bash
sudo mkdir -p /var/www
sudo chown "$USER":"$USER" /var/www
cd /var/www
git clone https://github.com/muhammadsyaiful2601/Spp.git sekolah
cd /var/www/sekolah/backend
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
```

Jangan unggah `vendor` dari komputer Windows; Composer harus memasang dependensi
di server. Buat berkas konfigurasi produksi:

```bash
cp .env.example .env
nano .env
```

Isi minimal nilai berikut di `.env`. Jangan mengirim atau menyimpan isi `.env`
di Git, tiket publik, atau chat:

```dotenv
APP_NAME="Portal Keuangan Sekolah"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.sekolah.sch.id
FRONTEND_URL=https://portal.sekolah.sch.id

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=spp
DB_USERNAME=spp
DB_PASSWORD="GANTI_DENGAN_PASSWORD_MYSQL"

EMAIL_VERIFICATION_EXPOSE_CODE=false
```

Atur SMTP sebelum konfigurasi Laravel di-cache. Contoh untuk layanan SMTP
dengan STARTTLS port 587:

```dotenv
MAIL_MAILER=smtp
MAIL_SCHEME=smtp
MAIL_HOST=smtp.penyedia-email.example
MAIL_PORT=587
MAIL_USERNAME=akun-smtp
MAIL_PASSWORD="GANTI_DENGAN_PASSWORD_ATAU_KUNCI_SMTP"
MAIL_FROM_ADDRESS="portal@sekolah.sch.id"
MAIL_FROM_NAME="${APP_NAME}"
```

Ikuti host, port, nama pengguna, dan metode TLS dari penyedia email. Untuk TLS
langsung umumnya gunakan `MAIL_SCHEME=smtps` dan port 465. Jangan memakai
`MAIL_MAILER=log` di produksi: email hanya masuk ke log server dan kode
verifikasi tidak sampai ke pengguna. `EMAIL_VERIFICATION_EXPOSE_CODE` wajib
`false`.

Setelah menyimpan `.env`, jalankan:

```bash
php artisan key:generate
php artisan migrate --force
php artisan storage:link
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

`key:generate` hanya dijalankan ketika memasang aplikasi baru. Pada update
berikutnya jangan membuat APP_KEY baru, karena akan membuat token dan data
terenkripsi lama tidak dapat digunakan. Jangan jalankan `migrate:fresh` atau
`db:seed` pada database produksi.

### Izin berkas Laravel

PHP-FPM perlu menulis ke `storage` dan `bootstrap/cache`. Contoh berikut
mengasumsikan PHP-FPM berjalan sebagai `www-data`:

```bash
sudo chown -R "$USER":www-data /var/www/sekolah
sudo find /var/www/sekolah -type d -exec chmod 755 {} \;
sudo find /var/www/sekolah -type f -exec chmod 644 {} \;
sudo chmod -R ug+rwX /var/www/sekolah/backend/storage
sudo chmod -R ug+rwX /var/www/sekolah/backend/bootstrap/cache
sudo chmod 640 /var/www/sekolah/backend/.env
```

`chmod 640` menjaga `.env` tetap terbaca oleh PHP-FPM melalui grup `www-data`
tanpa membuatnya dapat dibaca semua pengguna server. Jangan memberi izin
`777`. Jika deployment dilakukan oleh pengguna lain, atur grup/ACL agar
pengguna deployment dan `www-data` memiliki akses yang diperlukan tanpa
membuat seluruh source dapat ditulis oleh web server.

## 6. Buat akun pimpinan pertama

Seeder aplikasi membuat akun contoh ber-password bawaan dan alamat email
placeholder yang tidak bisa menerima email. **Jangan jalankan `db:seed` di
produksi.** Buat akun pimpinan pertama secara manual melalui Tinker agar
kredensial produksi tidak dimasukkan ke repository.

Dari `/var/www/sekolah/backend`, jalankan prompt berikut. Password diminta
secara tersembunyi dan tidak perlu ditulis sebagai bagian dari perintah:

```bash
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

Pastikan username dan email belum pernah dipakai. Akun dibuat belum
terverifikasi dengan sengaja. Setelah frontend aktif dan SMTP lolos pengujian,
login menggunakan akun ini, kirim kode verifikasi ke email aktif, lalu
verifikasi email sebelum menggunakan fitur portal. Setelah login pertama,
ubah password awal jika kebijakan sekolah mengharuskannya. Pimpinan dapat
membuat akun bendahara/admin dari menu aplikasi.

## 7. Build frontend React

Bangun frontend di server atau di CI dengan versi Node.js yang sesuai. Variabel
`VITE_*` ditanam saat build; `.env` backend tidak mengatur URL API frontend.

```bash
cd /var/www/sekolah/frontend
cat > .env.production <<'EOF'
VITE_API_URL=https://api.sekolah.sch.id/api/v1
VITE_SESSION_IDLE_MINUTES=15
EOF

npm ci
npm run build
```

Hasil build berada di `/var/www/sekolah/frontend/dist`. Atur `VITE_API_URL`
ke alamat API HTTPS yang benar. Setiap perubahan `VITE_*` mengharuskan build
ulang dan deploy ulang isi `dist/`. Jangan mengunggah `.env.production` ke
repositori karena variabel build dapat mengandung konfigurasi yang tidak boleh
dipublikasikan.

## 8. Konfigurasikan Nginx

Buat file `/etc/nginx/sites-available/sekolah`:

```nginx
server {
    listen 80;
    server_name api.sekolah.sch.id;
    root /var/www/sekolah/backend/public;
    index index.php;
    charset utf-8;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }

    client_max_body_size 10m;
    access_log /var/log/nginx/sekolah-api-access.log;
    error_log /var/log/nginx/sekolah-api-error.log;
}

server {
    listen 80;
    server_name portal.sekolah.sch.id;
    root /var/www/sekolah/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    access_log /var/log/nginx/sekolah-web-access.log;
    error_log /var/log/nginx/sekolah-web-error.log;
}
```

Aktifkan site dan periksa konfigurasi:

```bash
sudo ln -s /etc/nginx/sites-available/sekolah /etc/nginx/sites-enabled/sekolah
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable --now nginx php8.3-fpm mysql
```

Jika konfigurasi default Nginx mengambil alih domain, nonaktifkan symlink
default setelah memastikan tidak sedang digunakan:

```bash
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

`try_files ... /index.html` diperlukan agar URL internal React tetap berfungsi
ketika dibuka atau di-refresh langsung.

## 9. Aktifkan HTTPS

Pastikan kedua DNS sudah mengarah ke VPS dan Nginx menjawab kedua hostname,
kemudian pasang sertifikat Let's Encrypt:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.sekolah.sch.id -d portal.sekolah.sch.id
sudo certbot renew --dry-run
```

Pilih redirect HTTP ke HTTPS saat diminta. Pastikan pembaruan sertifikat
otomatis aktif. Jangan gunakan portal sebelum sertifikat HTTPS aktif, karena
token autentikasi API dikirim dari browser.

## 10. Uji email dan deployment

Uji kirim email melalui perintah aplikasi:

```bash
cd /var/www/sekolah/backend
php artisan mail:test alamat-yang-dapat-diakses@example.com
```

Jika konfigurasi `.env` berubah setelah cache dibuat, bersihkan dan buat ulang
cache konfigurasi:

```bash
php artisan config:clear
php artisan config:cache
```

Periksa endpoint kesehatan dan API publik dari komputer lokal:

```bash
curl -i https://api.sekolah.sch.id/up
curl -i https://api.sekolah.sch.id/api/v1/public/sekolah-profile
curl -I https://portal.sekolah.sch.id
```

Ketiganya seharusnya merespons HTTP 200. Selanjutnya, dari browser:

1. Buka `https://portal.sekolah.sch.id`.
2. Login dengan akun pimpinan pertama.
3. Pastikan kode verifikasi diterima dan verifikasi email berhasil.
4. Buka **Profil sekolah** dan isi identitas, alamat, logo, serta kontak.
5. Buat akun admin/bendahara, lalu uji login, input pembayaran, kuitansi,
   laporan, upload logo, dan unduh PDF.
6. Periksa tampilan cetak kuitansi dan laporan dari browser yang akan dipakai.

Sebelum digunakan dengan data sungguhan, tinjau ruang lingkup dan keterbatasan
aplikasi pada bagian **Cakupan** di [README.md](README.md), lalu uji alur kerja
sekolah dan kebijakan akses secara menyeluruh.

## 11. Update aplikasi

Sebelum update, ambil backup database (bagian berikutnya). Jalankan perintah
berikut dari VPS pada branch deployment `Syaiful`:

```bash
cd /var/www/sekolah
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
npm ci
npm run build
```

Jangan meneruskan update jika `git status --short` menunjukkan perubahan lokal
yang belum dipahami, jika `git pull` gagal, atau jika migrasi/build gagal.
Jangan menghapus atau menimpa `.env`, `APP_KEY`, berkas upload di
`backend/storage/app/public`, maupun isi database. Setelah update, ulangi
pemeriksaan endpoint, login, verifikasi email, dan fitur yang terdampak.

## 12. Backup dan pemulihan

Backup harus mencakup **database**, `.env` backend yang dirahasiakan, dan
berkas upload `backend/storage/app/public`. Simpan salinan di luar VPS (misalnya
object storage terenkripsi atau server backup terpisah), batasi aksesnya, dan
uji pemulihan secara berkala. Backup yang hanya tersimpan di VPS yang sama tidak
melindungi dari kerusakan atau kehilangan VPS.

Untuk backup manual database, MySQL akan meminta password:

```bash
sudo install -d -m 700 /var/backups/sekolah
mysqldump --single-transaction -h 127.0.0.1 -u spp -p spp \
  | gzip > "/var/backups/sekolah/spp-$(date +%F-%H%M).sql.gz"
```

Tambahkan berkas upload dan `.env` ke proses backup aman yang digunakan sekolah;
jangan membuat arsip backup di `public/` atau direktori frontend.

Contoh pemulihan ke database kosong setelah membuat database dan user:

```bash
gunzip -c /var/backups/sekolah/NAMA-FILE.sql.gz | mysql -h 127.0.0.1 -u spp -p spp
```

Pemulihan menimpa keadaan database tujuan. Pastikan database dan targetnya
benar, serta ambil backup keadaan sekarang sebelum menjalankannya. Pulihkan
berkas upload dan `.env` yang cocok dengan database tersebut, lalu jalankan
`php artisan config:cache` dari direktori backend. Jangan mengubah `APP_KEY`
jika memulihkan data yang sudah ada.

## 13. Troubleshooting

| Gejala | Pemeriksaan awal |
| --- | --- |
| Frontend tidak bisa memanggil API | Pastikan `VITE_API_URL` mengarah ke `/api/v1` pada domain HTTPS yang benar, lalu build ulang. Periksa DNS, sertifikat, dan error Console/Network di browser. |
| HTTP 502 pada API | Periksa `sudo systemctl status php8.3-fpm`, keberadaan socket `/run/php/php8.3-fpm.sock`, dan log Nginx. |
| HTTP 500 pada API | Periksa `backend/storage/logs/laravel.log`, koneksi database, `.env`, dan izin tulis `storage`/`bootstrap/cache`. Pastikan `APP_DEBUG=false`. |
| HTTP 404 untuk URL frontend setelah refresh | Pastikan blok Nginx frontend memakai `try_files $uri $uri/ /index.html;`. |
| Email verifikasi tidak sampai | Jalankan `php artisan mail:test ...`, pastikan `MAIL_MAILER=smtp`, kredensial SMTP, port/TLS, alamat pengirim, dan konfigurasi cache benar. Periksa folder spam serta kebijakan jaringan penyedia VPS. |
| Upload gagal atau terlalu besar | Cocokkan `client_max_body_size` Nginx dengan batas upload PHP dan cek izin `backend/storage/app/public`. |
| CSS/JS masih versi lama setelah deploy | Pastikan `npm run build` berhasil, root Nginx menunjuk `frontend/dist`, lalu lakukan hard refresh browser. |

Perintah pemeriksaan log:

```bash
sudo tail -n 100 /var/log/nginx/sekolah-api-error.log
sudo tail -n 100 /var/log/nginx/sekolah-web-error.log
sudo tail -n 100 /var/www/sekolah/backend/storage/logs/laravel.log
```

Jangan membagikan log, `.env`, token API, password, atau backup database ke
ruang publik. Sensor data sensitif sebelum meminta bantuan.

## 14. Alternatif: shared hosting cPanel

Shared hosting dapat digunakan bila mendukung **PHP 8.3**, ekstensi PHP yang
dibutuhkan Laravel, Composer 2 atau unggah `vendor` yang dibangun di Linux,
MySQL, HTTPS, serta direktori API dengan document root ke folder `public`
Laravel. Tidak semua paket cPanel memenuhi persyaratan ini; tanyakan ke
penyedia hosting sebelum membeli.

1. Buat database dan pengguna MySQL di cPanel; beri akses pengguna ke database.
2. Buat subdomain API dan atur document root-nya ke
   `backend/public`, **bukan** ke root `backend/`.
3. Upload kode backend di luar `public_html` bila memungkinkan. Pasang
   dependensi di server:

   ```bash
   cd ~/portal/backend
   composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
   ```

   Jika Composer tidak tersedia, bangun `vendor` di lingkungan Linux yang
   sesuai PHP produksi; jangan gunakan `vendor` dari Windows.
4. Buat `.env` produksi di backend, atur URL HTTPS, MySQL, SMTP, dan
   `EMAIL_VERIFICATION_EXPOSE_CODE=false`. Jalankan `key:generate` hanya pada
   instalasi baru, lalu `migrate --force`, `storage:link`, dan cache konfigurasi
   melalui Terminal/SSH cPanel.
5. Build frontend dengan Node.js yang sesuai:

   ```bash
   cd frontend
   ```

   Atur `VITE_API_URL` ke domain API, lalu jalankan `npm ci` dan
   `npm run build`. Upload **isi** `frontend/dist/` ke document root subdomain
   frontend.
6. Jika frontend menggunakan Apache, buat `.htaccess` pada document root
   frontend agar route SPA kembali ke `index.html`:

   ```apache
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule ^ index.html [L]
   </IfModule>
   ```

7. Aktifkan HTTPS untuk kedua subdomain melalui fitur SSL cPanel, buat akun
   pimpinan pertama, uji SMTP, lalu ikuti daftar verifikasi pada bagian 10.

Jangan meletakkan `.env`, source backend, atau backup di dalam document root
publik. Jika penyedia tidak mengizinkan document root API diarahkan ke
`backend/public`, atau PHP/Composer tidak memenuhi kebutuhan, gunakan VPS
(bagian 1–13) daripada memublikasikan direktori backend.
