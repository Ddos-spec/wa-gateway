# WA Gateway - Deployment Guide

## Quick Start

Panduan ini akan membantu Anda setup dan menjalankan WA Gateway dengan PostgreSQL dan Redis.

## Prerequisites

- Node.js (v18 atau lebih baru)
- PostgreSQL database (sudah running)
- Redis server (sudah running)
- File `.env` sudah dikonfigurasi

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Setup Database

Database schema akan otomatis dibuat saat pertama kali server dijalankan. Tabel-tabel yang akan dibuat:
- `admins` - Admin users
- `users` - Regular users
- `wa_folders` - Folder untuk organize WhatsApp numbers
- `wa_numbers` - WhatsApp session numbers
- `chat_logs` - Chat message logs

## Step 3: Create Admin User

Setelah server running dan database terkoneksi, buat admin user pertama:

```bash
node scripts/create-admin.js admin@example.com password123
```

Ganti `admin@example.com` dan `password123` dengan email dan password yang Anda inginkan.

## Step 4: Start Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

Server akan berjalan di port yang ditentukan di `.env` (default: 6000).

## Login Methods

WA Gateway mendukung 2 cara login:

### 1. Legacy Admin Login (Tanpa Email)
- Kosongkan field email
- Masukkan password dari `ADMIN_DASHBOARD_PASSWORD` di `.env`
- Berguna untuk quick access tanpa database

### 2. Database Login (Dengan Email)
- Masukkan email admin/user yang sudah dibuat
- Masukkan password yang sesuai
- Lebih secure dan support multiple users

## Endpoints

Setelah login berhasil:

### Admin Dashboard
```
https://your-domain.com/admin/dashboard.html
```

### API Documentation
```
https://your-domain.com/api_documentation.html
```

### Health Check
```
GET /api/v2/sessions
```

## Troubleshooting

### Connection Timeout ke PostgreSQL
- Pastikan PostgreSQL server running
- Cek firewall tidak block port 5432
- Verify credentials di `.env` benar
- Test koneksi: `npm run test:db`

### Connection Timeout ke Redis
- Pastikan Redis server running
- Cek firewall tidak block port 6379
- Verify REDIS_PASSWORD di `.env` benar

### Login 404 Error
- Pastikan server sudah running
- Clear browser cache
- Check console untuk error messages

### Session Error
- Pastikan Redis terkoneksi (session disimpan di Redis)
- Check `SESSION_SECRET` di `.env` sudah diset
- Restart server setelah mengubah `.env`

## Environment Variables

Pastikan `.env` file berisi minimal:

```env
# Security
ADMIN_DASHBOARD_PASSWORD=your_admin_password
SESSION_SECRET=your_session_secret_key
TOKEN_ENCRYPTION_KEY=your_encryption_key

# Server
PORT=6000
PUBLIC_URL=https://your-domain.com/

# PostgreSQL
DB_HOST=your_db_host
DB_PORT=5432
DB_NAME=wagateway
DB_USER=postgres
DB_PASSWORD=your_db_password

# Redis
REDIS_HOST=your_redis_host
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0
```

## Production Checklist

- [ ] .env file configured with production values
- [ ] PostgreSQL accessible from app server
- [ ] Redis accessible from app server
- [ ] Admin user created
- [ ] Firewall rules configured
- [ ] HTTPS configured (recommended)
- [ ] Process manager setup (PM2 recommended)

## PM2 Setup (Recommended)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Support

Jika ada masalah, check:
1. Server logs untuk error messages
2. Database connection dengan `npm run test:db`
3. `.env` configuration
4. PostgreSQL dan Redis status

Happy WhatsApp Gateway! 🚀
