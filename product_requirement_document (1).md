# Product Requirement Document (PRD)
## Aplikasi Pembayaran SPP & Biaya Sekolah Berbasis Web (SaaS / Commercial Ready)

---

## 1. Pendahuluan

### 1.1 Latar Belakang
Pengelolaan pembayaran SPP (Sumbangan Pembinaan Pendidikan) dan biaya operasional sekolah (seperti Uang Pembangunan, Uang Perpisahan, Uang Kegiatan, Seragam, dan Pendaftaran) yang masih dilakukan secara manual memiliki risiko ketidaksesuaian data, pencatatan tunggakan yang lambat, serta kesulitan pimpinan dalam memantau rekapitulasi keuangan secara *real-time*.

Aplikasi SPP Sekolah berbasis Web hadir sebagai solusi digitalisasi untuk memfasilitasi transaksi pembayaran oleh Admin/Kasir Keuangan, pengelolaan fleksibel atas komponen biaya oleh Pimpinan, serta penyediaan laporan keuangan secara transparan dan akurat. 

Untuk mendukung komersialisasi produk secara luas (*multi-tenant* / *white-label SaaS*), sistem dilengkapi dengan fitur **Manajemen Identitas & Branding Sekolah**. Pimpinan/Pemilik Lisensi dapat melakukan kustomisasi Nama Sekolah, Logo, Alamat, Kontak, hingga Header Kuitansi secara mandiri.

### 1.2 Tujuan Sistem
- **Komersialisasi & Branding Mandiri (White-Label):** Memungkinkan pimpinan mengunggah logo, mengatur nama sekolah, dan kustomisasi kuitansi sehingga aplikasi siap dijual ke berbagai instansi sekolah.
- **Fleksibilitas Pengaturan Tarif:** Memungkinkan Pimpinan menetapkan nominal SPP per rentang bulan (Semester Ganjil: Juli–Desember, Semester Genap: Januari–Juni) dan biaya non-SPP sesuai tingkat kelas/angkatan.
- **Efisiensi Operasional:** Mempermudah Admin Keuangan dalam melakukan entri transaksi pembayaran dan mencetak bukti pembayaran resmi berlogo sekolah.
- **Transparansi & Akuntabilitas:** Menyediakan laporan rekapitulasi pembayaran dan tunggakan yang dapat diakses Pimpinan kapan saja.

---

## 2. Pengguna Sistem & Hak Akses (User Roles & Permissions)

| Role | Deskripsi Hak Akses |
| :--- | :--- |
| **Pimpinan / Super Admin** | - **Mengatur Identitas Sekolah (Nama Sekolah, Logo, Alamat, Kontak, Header Kuitansi).**<br>- Menentukan & mengubah nominal SPP per periode bulan (Juli–Desember / Januari–Juni).<br>- Menentukan & mengubah tarif biaya Non-SPP (Pembangunan, Kegiatan, Seragam, dll.).<br>- Mengakses *dashboard* statistik & rekapitulasi penerimaan keuangan.<br>- Melihat dan mengekspor seluruh Laporan Keuangan (Excel/PDF). |
| **Admin Keuangan** | - Mengelola data siswa per kelas (Kelas I – VI).<br>- Melakukan input transaksi pembayaran SPP dan Non-SPP.<br>- Mencetak bukti pembayaran / kuitansi berlogo dan beridentitas sekolah.<br>- Melihat histori transaksi pembayaran per siswa. |

---

## 3. Fitur Utama & Kebutuhan Fungsional (Functional Requirements)

### 3.1 Manajemen Identitas & Branding Sekolah (Putih Label / Komersialisasi)
- **Pengaturan Profil Sekolah (Khusus Pimpinan):**
  - Form entri Nama Sekolah, Nama Yayasan/Instansi, Alamat Lengkap, Nomor Telepon, Email, dan Website.
  - Upload Logo Sekolah (format PNG/JPG/WebP, maksimal 2MB) dengan opsi *crop/preview*.
  - Upload Tanda Tangan / Stempel Digital Pimpinan untuk pengesahan kuitansi otomatis (Opsional).
- **Pengaturan Kop & Layout Kuitansi:**
  - Pilihan template cetak kuitansi (Ringkas, Standar, Termal/Struk 80mm).
  - Integrasi logo dan nama sekolah secara otomatis pada header aplikasi, cetak kuitansi, dan file laporan PDF.

### 3.2 Manajemen Pengaturan Tarif SPP & Biaya (Khusus Pimpinan)
- **Pengaturan Periode SPP Bulanan:**
  - Pimpinan dapat mengatur tarif SPP per semester/rentang bulan:
    - Periode I: Juli – Desember (Semester Ganjil)
    - Periode II: Januari – Juni (Semester Genap)
  - Pimpinan dapat menentukan nominal default per tingkat kelas (Kelas I s/d VI) serta mengubahnya secara terpisah bila ada kebijakan khusus.
- **Pengaturan Tarif Biaya Non-SPP:**
  - Pimpinan dapat mengaktifkan/menonaktifkan dan menetapkan nominal biaya untuk pos:
    1. Uang Kegiatan
    2. Uang Pembangunan
    3. Uang Perpisahan
    4. Uang Seragam / SPP Tambahan
    5. Uang Pendaftaran / Perlengkapan
    6. Pos Lain-Lain
  - Penentuan tipe pembayaran (Sekali bayar, Tahunan, atau Cicilan).

### 3.3 Manajemen Master Data Siswa & Kelas (Admin)
- Pengelompokan data siswa berdasarkan tingkat kelas (Kelas I, II, III, IV, V, VI).
- Pencarian siswa berdasarkan NISN, Nama, atau Tingkat Kelas.

### 3.4 Transaksi & Pembayaran (Admin)
- **Modul Pembayaran SPP:**
  - Tampilan checklist 12 bulan (Juli s/d Juni) per siswa.
  - Penandaan status (*Belum Bayar* / *Lunas*) secara otomatis sesuai tarif yang berlaku pada bulan tersebut.
  - Pilihan pembayaran langsung satu bulan atau sekaligus beberapa bulan.
- **Modul Pembayaran Non-SPP:**
  - Input pembayaran berdasarkan pos biaya yang diaktifkan Pimpinan.
  - Dukungan untuk pembayaran lunas maupun skema cicilan (bila dikonfigurasi).
- **Cetak Kuitansi / Bukti Bayar:**
  - Output kuitansi fisik (cetak langsung) atau file PDF yang menampilkan Logo & Profil Sekolah secara dinamis.

### 3.5 Laporan & Dashboard (Pimpinan & Admin)
- **Dashboard Ringkasan:** Visualisasi total pemasukan bulanan, rekap tunggakan, dan perbandingan per kelas.
- **Laporan Realisasi Pembayaran SPP & Non-SPP:** Filter berdasarkan Tahun Ajaran, Periode Bulan, dan Tingkat Kelas.
- **Fitur Ekspor Data:** Laporan dapat diunduh dalam format PDF dan Excel (`.xlsx`) dengan Kop Sekolah resmi.

---

## 4. Spesifikasi Arsitektur Teknikal

### 4.1 Tech Stack
- **Backend Framework:** Laravel (REST API)
- **Backend Authentication:** Laravel Sanctum
- **Storage Driver:** Laravel Storage / AWS S3 (untuk penyimpanan file logo & stempel)
- **Frontend Framework:** React (Single Page Application - SPA)
- **State Management & Data Fetching:** Axios / TanStack Query (React Query)
- **Styling UI:** Tailwind CSS
- **Database:** MySQL / MariaDB

### 4.2 Arsitektur Sistem
```text
[ React Frontend App ] <==== REST API (JSON / Bearer Token / Multipart Form) ====> [ Laravel Backend API ] <==== SQL ====> [ MySQL Database ]
                                                                                   |
                                                                                   +===> [ Storage: Logo & Media ]
```

---

## 5. Perancangan Skema Database (Database Schema)

```sql
-- 1. Tabel Profil Sekolah (White-label Configuration)
CREATE TABLE sekolah_profile (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nama_sekolah VARCHAR(255) NOT NULL,
    nama_yayasan VARCHAR(255) NULL,
    alamat TEXT NOT NULL,
    telepon VARCHAR(50) NULL,
    email VARCHAR(100) NULL,
    website VARCHAR(100) NULL,
    logo_path VARCHAR(255) NULL, -- Path gambar logo
    stempel_path VARCHAR(255) NULL, -- Path gambar stempel/ttd pimpinan
    catatan_kuitansi TEXT NULL, -- Pesan di bawah kuitansi (contoh: "Terima Kasih")
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Tabel Users
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('pimpinan', 'admin') NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);

-- 3. Tabel Tahun Ajaran
CREATE TABLE tahun_ajaran (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nama VARCHAR(50) NOT NULL, -- contoh: '2026/2027'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);

-- 4. Tabel Tingkat Kelas
CREATE TABLE tingkat_kelas (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nama_tingkat VARCHAR(50) NOT NULL -- 'Kelas I', 'Kelas II', dst.
);

-- 5. Tabel Siswa
CREATE TABLE siswa (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nisn VARCHAR(20) UNIQUE NOT NULL,
    nama_lengkap VARCHAR(255) NOT NULL,
    tingkat_kelas_id BIGINT NOT NULL,
    FOREIGN KEY (tingkat_kelas_id) REFERENCES tingkat_kelas(id)
);

-- 6. Tabel Pengaturan Periode SPP (Dynamic Pricing oleh Pimpinan)
CREATE TABLE spp_periode_master (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tahun_ajaran_id BIGINT NOT NULL,
    tingkat_kelas_id BIGINT NOT NULL,
    nama_periode VARCHAR(100) NOT NULL, -- 'Semester Ganjil', 'Semester Genap'
    bulan_mulai INT NOT NULL, -- 7 (Juli) / 1 (Januari)
    bulan_selesai INT NOT NULL, -- 12 (Desember) / 6 (Juni)
    nominal_per_bulan DECIMAL(12, 2) NOT NULL,
    FOREIGN KEY (tahun_ajaran_id) REFERENCES tahun_ajaran(id),
    FOREIGN KEY (tingkat_kelas_id) REFERENCES tingkat_kelas(id)
);

-- 7. Tabel Pos Pembayaran Non-SPP
CREATE TABLE pos_pembayaran (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nama_pos VARCHAR(100) NOT NULL, -- 'Uang Pembangunan', 'Uang Perpisahan', dll.
    tipe ENUM('sekali_bayar', 'tahunan', 'cicilan') DEFAULT 'sekali_bayar'
);

-- 8. Tabel Tarif Pos Pembayaran Non-SPP (Dynamic Pricing oleh Pimpinan)
CREATE TABLE tarif_pos_pembayaran (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    pos_pembayaran_id BIGINT NOT NULL,
    tahun_ajaran_id BIGINT NOT NULL,
    tingkat_kelas_id BIGINT NOT NULL,
    nominal DECIMAL(12, 2) NOT NULL,
    FOREIGN KEY (pos_pembayaran_id) REFERENCES pos_pembayaran(id),
    FOREIGN KEY (tahun_ajaran_id) REFERENCES tahun_ajaran(id),
    FOREIGN KEY (tingkat_kelas_id) REFERENCES tingkat_kelas(id)
);

-- 9. Tabel Tagihan SPP Siswa (Generated per Siswa per Bulan)
CREATE TABLE tagihan_spp_siswa (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    siswa_id BIGINT NOT NULL,
    tahun_ajaran_id BIGINT NOT NULL,
    bulan INT NOT NULL, -- 1 s/d 12
    tahun INT NOT NULL, -- YYYY
    nominal DECIMAL(12, 2) NOT NULL,
    status_bayar ENUM('belum_bayar', 'lunas') DEFAULT 'belum_bayar',
    tgl_bayar DATETIME NULL,
    FOREIGN KEY (siswa_id) REFERENCES siswa(id),
    FOREIGN KEY (tahun_ajaran_id) REFERENCES tahun_ajaran(id)
);

-- 10. Tabel Transaksi Pembayaran
CREATE TABLE transaksi_pembayaran (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    no_transaksi VARCHAR(100) UNIQUE NOT NULL,
    siswa_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL, -- Admin yang memproses
    jenis_pembayaran ENUM('spp', 'non_spp') NOT NULL,
    ref_id BIGINT NOT NULL, -- FK ke tagihan_spp_siswa ATAU tarif_pos_pembayaran
    jumlah_bayar DECIMAL(12, 2) NOT NULL,
    tgl_bayar DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (siswa_id) REFERENCES siswa(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

---

## 6. Desain REST API Contracts (Endpoints)

### 6.1 Public & Authentication API
- `GET /api/v1/public/sekolah-profile` — Mengambil data nama & logo sekolah (untuk header/landing page).
- `POST /api/v1/auth/login` — Autentikasi user.
- `POST /api/v1/auth/logout`

### 6.2 Modul Pengaturan Identitas Sekolah (Branding API - Khusus Pimpinan)
- `GET /api/v1/pimpinan/sekolah-profile` — Detail profil sekolah lengkap.
- `POST /api/v1/pimpinan/sekolah-profile` — Mengubah nama, alamat, telepon, dan catatan kuitansi.
- `POST /api/v1/pimpinan/sekolah-profile/upload-logo` — Upload/update logo sekolah (`multipart/form-data`).
- `POST /api/v1/pimpinan/sekolah-profile/upload-favicon` — Upload/update favicon tab browser (`multipart/form-data`, field `favicon`, PNG/JPG/WebP/ICO, maksimal 512 KB).
- `DELETE /api/v1/pimpinan/sekolah-profile/favicon` — Menghapus favicon sekolah dan mengembalikan ikon bawaan aplikasi.

### 6.3 Modul Pimpinan (Pengaturan Biaya & Periode)
- `GET /api/v1/pimpinan/spp-periode` — Mengambil daftar aturan tarif SPP.
- `POST /api/v1/pimpinan/spp-periode` — Membuat / mengubah aturan periode SPP (Contoh: Juli-Desember & Jan-Juni).
- `GET /api/v1/pimpinan/tarif-non-spp` — Mengambil daftar tarif biaya non-SPP.
- `POST /api/v1/pimpinan/tarif-non-spp` — Menetapkan nominal biaya kegiatan, pembangunan, dll.

### 6.4 Modul Admin (Transaksi Pembayaran)
- `GET /api/v1/admin/siswa/{siswa_id}/tagihan` — Mengambil daftar seluruh tagihan SPP & Non-SPP siswa.
- `POST /api/v1/admin/pembayaran/spp` — Memproses transaksi pembayaran SPP.
- `POST /api/v1/admin/pembayaran/non-spp` — Memproses pembayaran Non-SPP.
- `GET /api/v1/admin/transaksi/{no_transaksi}/cetak-kuitansi` — Menggenerasi data/PDF kuitansi lengkap dengan Kop & Logo Sekolah.

### 6.5 Modul Laporan (Pimpinan & Admin)
- `GET /api/v1/reports/spp` — Laporan SPP.
- `GET /api/v1/reports/non-spp` — Laporan Non-SPP.
- `GET /api/v1/reports/dashboard-stats` — Ringkasan total penerimaan, total tunggakan, dll.

---

## 7. Batasan & Syarat Non-Fungsional (Non-Functional Requirements)

- **Branding Dynamism:** Seluruh komponen UI (Header, Title Tab, Kuitansi, PDF Report) mengambil data nama & logo sekolah dari backend secara otomatis (*dynamic branding*).
- **Keamanan File Upload:** Validasi ketat untuk file upload logo (hanya mimetype image: png, jpg, jpeg, webp; max size 2MB).
- **Keamanan API:** Menerapkan HTTPS, enkripsi password Bcrypt, dan validasi token pada setiap request API (Laravel Sanctum).
- **Performa:** Respon API maksimal 2 detik untuk pemrosesan laporan.
- **Komersialisasi Ready:** Siap di-deploy untuk berbagai klien sekolah tanpa perlu mengubah source code (*zero code alteration per client*).