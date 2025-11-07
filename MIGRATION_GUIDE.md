# Migrasi WA Gateway ke Arsitektur SaaS

Dokumen ini menjelaskan proses migrasi WA Gateway ke arsitektur SaaS yang optimal menggunakan pendekatan hybrid.

## Arsitektur Baru

```
[Internet] → [Vercel: Frontend] → [API Proxy] → [Dedicated Server: Backend + WA Sessions] → [Neon: Database]
```

### Komponen:
1. **Frontend (Vercel)**: Dashboard, UI, dan otentikasi
2. **Backend (Dedicated Server)**: API endpoints, WA sessions, WebSocket
3. **Database (Neon)**: PostgreSQL untuk user, sessions, messages

## Langkah-langkah Migrasi

### A. Deploy Backend (Dedicated Server)

1. **Pilih Platform:**
   - DigitalOcean App Platform
   - Render.com
   - Railway
   - VPS sendiri

2. **Konfigurasi Environment Variables:**
   ```
   DATABASE_URL=your_neon_db_connection_string
   JWT_SECRET=your_jwt_secret
   PORT=5001
   NODE_ENV=production
   FRONTEND_URL=https://your-frontend-domain.vercel.app
   ALLOWED_ORIGINS=https://your-frontend-domain.vercel.app
   ```

3. **Deployment Commands:**
   ```bash
   npm install
   npm run build
   npm start
   ```

4. **Pastikan backend bisa diakses publik** (gunakan domain atau IP publik)

### B. Deploy Frontend (Vercel)

1. **Pilih Platform:** Vercel

2. **Konfigurasi Environment Variables di Vercel:**
   - `NEXT_PUBLIC_API_URL`: `https://your-backend-domain.com/api`
   - `NEXT_PUBLIC_WS_URL`: `wss://your-backend-domain.com`

3. **Vercel.json Configuration:**
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "frontend/**",
         "use": "@vercel/static"
       }
     ],
     "routes": [
       {
         "src": "/(.*)",
         "dest": "/frontend/$1"
       }
     ]
   }
   ```

### C. Konfigurasi Database (Neon)

1. **Create Neon Project:**
   - Buat project baru di Neon
   - Dapatkan connection string

2. **Migrasi Skema:**
   - Jalankan `create_full_schema.sql` di Neon database

3. **Tambahkan admin user:**
   ```sql
   INSERT INTO "public"."config" ("id", "username", "password_hash", "updated_at") 
   VALUES (1, 'admin', '$2a$10$vDtCxgJ3ORp3NRRqzC727u3nyt6W39e9p4Z/GTi5ac844eNOdC36G', CURRENT_TIMESTAMP);
   ```

## Konfigurasi Proxy

Frontend akan mengakses backend melalui domain backend, bukan localhost:

- `/api/auth/*` → Backend Server
- `/api/sessions/*` → Backend Server
- WebSocket → Backend Server

## Testing Migration

1. **Pastikan backend berjalan:**
   - Akses `https://your-backend-domain.com/health` → Harus return status OK

2. **Pastikan frontend bisa mengakses backend:**
   - Login harus berhasil
   - API calls harus berjalan
   - WebSocket connections harus aktif

3. **Uji session WA:**
   - Buat session baru
   - Pastikan QR code muncul
   - Test koneksi dan pengiriman pesan

## Troubleshooting

### Common Issues:

1. **CORS Error:**
   - Pastikan `ALLOWED_ORIGINS` di backend mencakup domain frontend

2. **WebSocket Not Connecting:**
   - Pastikan backend bisa diakses melalui WSS (untuk production)

3. **API Call Failure:**
   - Periksa apakah `NEXT_PUBLIC_API_URL` di frontend mengarah ke backend yang benar

## Keamanan

1. **Gunakan HTTPS untuk semua komunikasi**
2. **Pastikan JWT_SECRET kuat dan rahasia**
3. **Gunakan rate limiting untuk mencegah abuse**
4. **Audit log untuk aktivitas penting**

## Skalabilitas

1. **Untuk load tinggi:**
   - Pertimbangkan load balancer
   - Gunakan Redis untuk session sharing
   - Gunakan cluster untuk WA sessions

2. **Untuk multi-region:**
   - Deploy backend ke region yang dekat dengan target pengguna
   - Gunakan CDN untuk assets

## Monitoring

1. **Gunakan logging yang komprehensif**
2. **Set up monitoring untuk WA sessions**
3. **Alert untuk session disconnect**

## Backup & Recovery

1. **Backup database secara rutin**
2. **Simpan session credentials dengan aman**
3. **Punya prosedur disaster recovery**

---
Dengan arsitektur hybrid ini, Anda mendapatkan kecepatan dan skalabilitas frontend dari Vercel dengan kemampuan koneksi persisten dari backend dedicated server, menjadikan WA Gateway SaaS Anda menjadi sangat handal.