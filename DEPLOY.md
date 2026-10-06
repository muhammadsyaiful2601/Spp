# Panduan Deploy ke VPS / Hosting

Panduan ini memasang aplikasi ke satu VPS Ubuntu 24.04 (contoh: 2 vCPU,
4 GB RAM) dengan domain sendiri, misalnya `portal.namasekolah.sch.id`
untuk frontend dan `api.namasekolah.sch.id` untuk backend.

## 1. Gambaran arsitektur

```
Browser ──HTTPS──▶ Nginx ──┬──▶ /var/www/spp-frontend/dist   (file statis React)
                            └──▶ /api ──▶ PHP-FPM ──▶ Laravel ──▶ MySQL 8
```

Backend Laravel melayani **hanya** `/api/*`; frontend React adalah file
statis hasil `npm run build`. Keduanya wajib HTTPS agar token Sanctum
tidak bocor.

## 2. Siapkan VPS

```bash
# Sebagai root di VPS baru (Ubuntu 24.04)
apt update && apt upgrade -y
apt install -y nginx mysql-server php8.3-fpm php8.3-mysql php8.3-mbstring \
  php8.3-xml php8.3-curl php8.3-zip php8.3-bcmath php8.3-intl php8.3-gd \
  unzip git curl nodejs npm certbot python3-certbot-nginx
```

Amankan MySQL dan buat database + user khusus aplikasi:

```bash
mysql_secure_installation
mysql -u root -p
```

```sql
CREATE DATABASE spp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'spp'@'localhost' IDENTIFIED BY 'GANTI-DENGAN-PASSWORD-KUAT';
GRANT ALL PRIVILEGES ON spp.* TO 'spp'@'localhost';
FLUSH PRIVILEGES;
```

## 3. Deploy backend (Laravel)

```bash
mkdir -p /var/www && cd /var/www
git clone https://github.com/muhammadsyaiful2601/Spp.git sekolah
cd sekolah/backend

# Composer di server (jangan copy folder vendor dari Windows)
curl -sS https://getcomposer.org/installer | php
php composer.phar install --no-dev --optimize-autoloader --no-interaction

cp .env.example .env
php artisan key:generate
```

Edit `.env` produksi (nilai contoh — sesuaikan):

```ini
APP_NAME="Portal Keuangan Sekolah"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.namasekolah.sch.id
FRONTEND_URL=https://portal.namasekolah.sch.id

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=spp
DB_USERNAME=spp
DB_PASSWORD=GANTI-DENGAN-PASSWORD-KUAT
```

# WAJIB false di server publik (lihat penjelasan di .env.example).
EMAIL_VERIFICATION_EXPOSE_CODE=false
```

Lanjutkan instalasi:

```bash
php artisan migrate --force
php artisan db:seed --force        # hanya akun admin & pimpinan (local/testing)
php artisan storage:link
php artisan config:cache
php artisan route:cache
php artisan view:cache

# JANGAN jalankan DummyHistorySeeder di produksi — data uji 8.000+ baris.
# Hanya untuk server staging/uji bila perlu:
# php artisan db:seed --class=DummyHistorySeeder --force

chown -R www-data:www-data /var/www/sekolah/backend
chmod -R 775 storage bootstrap/cache
```

> **Urutan penting:** isi kredensial SMTP **sebelum** `config:cache`.
> Laravel berhenti membaca `.env` setelah config di-cache; perubahan
> sesudahnya diam-diam tidak berlaku sampai `php artisan config:cache`
> dijalankan ulang. Lihat contoh per penyedia (Brevo/Gmail/cPanel) di
> `.env.example`. Uji kirim email dengan:
> `php artisan mail:test alamat@email-anda`.

## 4. Deploy frontend (React)

Di VPS (atau build di CI lalu upload isi `dist/`):

```bash
cd /var/www/sekolah/frontend
npm ci
```

Buat `.env.production` (dipakai saat build):

```ini
VITE_API_URL=https://api.namasekolah.sch.id/api/v1
```

```bash
npm run build
```

Hasilnya di `frontend/dist/` — inilah yang disajikan Nginx sebagai file
statis. Setiap ganti `VITE_*` harus build ulang.

## 5. Konfigurasi Nginx + HTTPS

`/etc/nginx/sites-available/spp`:

```nginx
# Backend API
server {
    listen 80;
    server_name api.namasekolah.sch.id;
    root /var/www/sekolah/backend/public;

    index index.php;
    charset utf-8;

    # Blokir file sensitif Laravel
    location ~ /\.(?!well-known).* { deny all; }

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    }

    access_log /var/log/nginx/spp-api-access.log;
    error_log /var/log/nginx/spp-api-error.log;
}

# Frontend SPA
server {
    listen 80;
    server_name portal.namasekolah.sch.id;
    root /var/www/sekolah/frontend/dist;
    index index.html;

    # SPA fallback: semua route kembali ke index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Aset berversi (hash) boleh di-cache lama
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    access_log /var/log/nginx/spp-web-access.log;
    error_log /var/log/nginx/spp-web-error.log;
}
```

Aktifkan + HTTPS gratis (Let's Encrypt):

```bash
ln -s /etc/nginx/sites-available/spp /etc/nginx/sites-enabled/spp
nginx -t && systemctl reload nginx

certbot --nginx -d api.namasekolah.sch.id -d portal.namasekolah.sch.id
# Certbot otomatis menambah blok 443 + redirect HTTP→HTTPS + renewal cron.
```

## 6. Verifikasi pasca-deploy

```bash
# 1. API hidup dan branding publik terbaca
curl -s https://api.namasekolah.sch.id/api/v1/public/sekolah-profile | head -c 300

# 2. Frontend termuat
curl -o /dev/null -w "%{http_code}\n" https://portal.namasekolah.sch.id
# harus: 200
```

Lalu dari browser: login akun pimpinan → Profil sekolah → isi nama,
alamat, logo → unduh PDF laporan dan pastikan kop + tanda tangan tampil.

Ganti kredensial bawaan (`pimpinan`/`admin` = `password`) **segera**
lewat menu Akun saya, dan verifikasi email akun agar gate keamanan aktif.

## 7. Perawatan rutin

```bash
# Update kode
cd /var/www/sekolah && git pull origin Syaiful
cd backend && php composer.phar install --no-dev --optimize-autoloader --no-interaction
php artisan migrate --force
php artisan config:cache && php artisan route:cache && php artisan view:cache
cd ../frontend && npm ci && npm run build

# Backup database (cron harian disarankan)
mysqldump -u spp -p spp | gzip > /root/backup-spp-$(date +%F).sql.gz

# Lihat log bila ada masalah
tail -f /var/www/sekolah/backend/storage/logs/laravel.log
```

## 8. Alternatif shared hosting (cPanel tanpa root)

1. Buat database + user MySQL dari cPanel → catat kredensialnya.
2. Di komputer lokal: `cd frontend && npm run build`; zip isi `dist/`.
3. Zip folder `backend` **tanpa** `.env`; folder `vendor` ikut di-zip
   **atau** jalankan `composer install` via terminal cPanel bila ada.
4. Upload backend ke `~/portal-api` (sejajar `public_html`, bukan di
   dalamnya); upload isi `dist/` ke `public_html/` (atau subdomain).
5. Arahkan document root subdomain API ke `~/portal-api/public`
   (menu Domains), atau symlink bila host mengizinkan.
6. Buat `.env` produksi seperti bagian 3, lalu via terminal cPanel:
   `php artisan key:generate`, `migrate --force`, `storage:link`,
   `config:cache`.
7. Aplikasi ini tidak butuh cron/antrean (notifikasi dikirim sinkron),
   jadi batasan shared hosting umumnya tidak menghalangi.

> Shared hosting bervariasi; bila host memblokir fungsi/artisan tertentu,
> VPS kecil (bagian 1–7) adalah jalur yang disarankan dan didukung penuh.
