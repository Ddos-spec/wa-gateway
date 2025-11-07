# WA Gateway - WhatsApp API Gateway

WhatsApp Gateway adalah platform untuk mengelola koneksi WhatsApp Business API dan mengirimkan pesan secara massal.

## Fitur

### Admin Features

- **Session Management**
  - Membuat session WhatsApp baru
  - Menampilkan QR code untuk scan
  - Melakukan phone pairing (8 digit code) untuk koneksi
  - Mengelola semua session (aktif/non-aktif)
  - Menghapus session
  - Menampilkan status koneksi semua session

- **User Management**
  - Membuat akun customer baru
  - Mengelola profil customer
  - Mengatur hak akses customer
  - Mengaktifkan/non-aktifkan akun customer

- **Webhook Configuration**
  - Mengatur webhook untuk setiap session
  - Menentukan event yang ingin ditangkap (pesan masuk, status perubahan, dll)
  - Menguji webhook yang telah dikonfigurasi

- **API Management**
  - Generate API key untuk session
  - Regenerate API key
  - Melihat log penggunaan API

- **Dashboard Admin**
  - Melihat semua session yang dibuat oleh semua customer
  - Melihat metrics keseluruhan
  - Melihat log aktivitas sistem
  - Melihat notifikasi sistem penting

- **Customer Management**
  - Melihat daftar semua customer
  - Mengatur paket langganan customer
  - Melihat status pembayaran customer
  - Mengirim notifikasi ke customer

### Customer Features

- **Dashboard Customer**
  - Melihat ringkasan pesan terkirim hari ini
  - Melihat status session mereka saja
  - Melihat notifikasi khusus untuk mereka

- **Session Management (Terbatas)**
  - Hanya bisa melihat session yang mereka miliki sendiri
  - Tidak bisa membuat session baru (harus melalui admin)
  - Tidak bisa melakukan QR scan atau phone pairing

- **Pesan & Riwayat**
  - Melihat log pesan yang dikirim dari session mereka
  - Melihat statistik pengiriman pesan
  - Melihat pesan masuk (jika ada webhook)

- **Profil**
  - Mengedit informasi profil pribadi
  - Mengubah password
  - Melihat API key milik mereka (hanya untuk session mereka)

- **Laporan Sederhana**
  - Melihat jumlah pesan terkirim harian/mingguan/bulanan
  - Melihat statistik dasar pengiriman

## Teknologi

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js dengan Express
- **Database**: PostgreSQL
- **Deployment**: Vercel (frontend), Node.js runtime (backend)
- **Database Hosting**: Neon (atau PostgreSQL hosting lainnya)

## Instalasi Lokal

1. Clone repository ini
2. Install dependensi:
   ```bash
   cd backend
   npm install
   ```
3. Buat file `.env` di folder backend berdasarkan `.env.example`
4. Konfigurasi database connection string di `.env`
5. Jalankan backend:
   ```bash
   npm start
   ```

## Deployment ke Vercel

1. Fork atau clone repository ini
2. Buat project baru di Vercel
3. Pilih framework: `Other` atau `Node.js`
4. Konfigurasi environment variables di Vercel dashboard:
   - `DATABASE_URL`: Connection string ke database PostgreSQL (misalnya Neon)
   - `JWT_SECRET`: Secret key untuk JWT
   - `WA_GATEWAY_URL`: URL server WhatsApp Gateway
   - `FRONTEND_URL`: URL deployment Vercel
   - `BACKEND_PORT`: Port untuk backend (default: 3001)
   - `FRONTEND_PORT`: Port untuk frontend (default: 5000) 
   - `ALLOWED_ORIGINS`: Origins yang diizinkan (contoh: https://your-project.vercel.app,http://localhost:3000)

5. Deploy

## Konfigurasi Database

Saat pertama kali deploy, Anda perlu:

1. Buat database PostgreSQL (disarankan menggunakan [Neon](https://neon.tech/))
2. Membuat skema database menggunakan file `create_full_schema.sql`
3. Menambahkan user admin ke tabel `config`:
   ```sql
   INSERT INTO "public"."config" ("id", "username", "password_hash", "updated_at") 
   VALUES (1, 'admin', '$2a$10$vDtCxgJ3ORp3NRRqzC727u3nyt6W39e9p4Z/GTi5ac844eNOdC36G', CURRENT_TIMESTAMP);
   ```

### Konfigurasi Neon Database

1. Buat proyek baru di [Neon Console](https://console.neon.tech/)
2. Dapatkan connection string dari tab "Connection Details"
3. Atur environment variable `DATABASE_URL` di Vercel dengan connection string dari Neon
4. Tambahkan skema dengan menjalankan file `create_full_schema.sql` di SQL editor Neon

## Pembatasan Hak Akses

- **Customer** tidak bisa mengakses fitur webhook atau phone pairing
- **Customer** hanya bisa melihat session yang mereka miliki
- **Customer** tidak bisa mengelola akun customer lain
- **Admin** bisa melihat dan mengelola semua session, bukan hanya miliknya sendiri
- **Admin** bisa mengatur hak akses customer

## Cara Menggunakan

1. Akses URL deployment untuk membuka dashboard
2. Login sebagai admin untuk mengelola sessions
3. Customer dapat login ke customer dashboard dengan akun yang dibuat admin
4. Gunakan API endpoints untuk integrasi dengan aplikasi lain

## Struktur Project

```
├── backend/          # Server backend Node.js
│   ├── config/       # Konfigurasi database
│   ├── middleware/   # Middleware Express
│   ├── routes/       # API routes
│   └── server.js     # Server utama
├── frontend/         # File-file frontend
│   ├── api/          # API helper
│   ├── assets/       # CSS, JS, dan gambar
│   └── *.html        # Halaman-halaman
├── create_full_schema.sql # Skema database
└── vercel.json       # Konfigurasi Vercel
```

## Environment Variables

Di file `.env` (atau di Vercel dashboard):

```env
# Database
DB_HOST=your-db-host
DB_PORT=5432
DB_NAME=your-db-name
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DATABASE_URL=postgresql://user:password@host:port/dbname

# API & Security
JWT_SECRET=your-jwt-secret-key
WA_GATEWAY_URL=http://localhost:5001
FRONTEND_URL=https://your-project.vercel.app
BACKEND_URL=https://your-project.vercel.app/api

# Server Ports
BACKEND_PORT=3001
FRONTEND_PORT=5000

# CORS
ALLOWED_ORIGINS=https://your-project.vercel.app,http://localhost:3000,http://localhost:3001
```

## API Endpoints

- `POST /api/auth/login` - Login untuk admin dan customer
- `POST /api/auth/register` - Registrasi customer baru
- `GET /api/auth/verify` - Verifikasi token
- `GET /api/sessions` - Dapatkan daftar session
- `POST /api/sessions` - Buat session baru
- `GET /api/notifications` - Dapatkan notifikasi
- `POST /api/test-notification` - Uji notifikasi WebSocket

## Cara Kontribusi

1. Fork repository ini
2. Buat branch fitur baru (`git checkout -b fitur-hebat`)
3. Commit perubahan (`git commit -m 'Tambah fitur hebat'`)
4. Push ke branch (`git push origin fitur-hebat`)
5. Buka Pull Request

## Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).