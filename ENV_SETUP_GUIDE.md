# 🔐 Environment Variables - Setup Guide

## ❌ **MASALAH YANG DITEMUKAN:**

Environment variables sebelumnya ada yang salah:
1. `WA_GATEWAY_URL=http://localhost:5001` ❌ (localhost tidak bisa di production!)
2. `FRONTEND_URL=` ❌ (kosong)
3. `ALLOWED_ORIGINS=` ❌ (kosong, CORS akan gagal)
4. Missing `BACKEND_PORT` untuk backend API

---

## ✅ **ENVIRONMENT VARIABLES YANG BENAR:**

### **Copy-Paste ini ke Easypanel → Variables Tab:**

```env
DATABASE_URL=postgres://postgres:a0bd3b3c1d54b7833014@postgres_scrapdatan8n:5432/wa_gateaway?sslmode=disable

JWT_SECRET=wa-gateway-super-secret-key-2025

JWT_EXPIRES_IN=7d

NODE_ENV=PRODUCTION

PORT=5001

BACKEND_PORT=3001

FRONTEND_PORT=5000

DB_USER=postgres

DB_PASSWORD=a0bd3b3c1d54b7833014

DB_HOST=postgres_scrapdatan8n

DB_PORT=5432

DB_NAME=wa_gateaway

WA_GATEWAY_URL=https://postgres-wa-gateaway.qk6yxt.easypanel.host

FRONTEND_URL=https://postgres-wa-gateaway.qk6yxt.easypanel.host

ALLOWED_ORIGINS=https://postgres-wa-gateaway.qk6yxt.easypanel.host,http://localhost:5000,http://127.0.0.1:5000

WEBHOOK_BASE_URL=

KEY=
```

---

## 📋 **Penjelasan Setiap Variable:**

### **Database:**
```
DATABASE_URL     - Connection string lengkap untuk PostgreSQL
DB_USER          - Username database
DB_PASSWORD      - Password database  
DB_HOST          - Host database (internal VPS: postgres_scrapdatan8n)
DB_PORT          - Port database (5432)
DB_NAME          - Nama database (wa_gateaway)
```

### **Authentication:**
```
JWT_SECRET       - Secret key untuk JWT token
JWT_EXPIRES_IN   - Durasi expire token (7d = 7 hari)
```

### **Ports:**
```
PORT             - Port untuk WA Gateway (5001)
BACKEND_PORT     - Port untuk Backend API (3001)
FRONTEND_PORT    - Port untuk Frontend (5000)
```

### **URLs (PENTING!):**
```
WA_GATEWAY_URL   - URL production WA Gateway
                   ✅ https://postgres-wa-gateaway.qk6yxt.easypanel.host
                   ❌ JANGAN: http://localhost:5001

FRONTEND_URL     - URL production Frontend
                   ✅ https://postgres-wa-gateaway.qk6yxt.easypanel.host
                   ❌ JANGAN kosong atau localhost
```

### **CORS:**
```
ALLOWED_ORIGINS  - Domain yang diizinkan untuk CORS
                   Format: domain1,domain2,domain3
                   HARUS ada domain production!
```

---

## 🎯 **Struktur Port & Service:**

```
┌─────────────────────────────────────────┐
│  Frontend (Port 5000)                   │
│  https://your-domain/                   │
└─────────────────────────────────────────┘
           │
           ├─────> Backend API (Port 3001)
           │       /api/auth, /api/webhooks
           │
           └─────> WA Gateway (Port 5001)
                   /session, /message
```

---

## 🔄 **Update Environment di Platform:**

### **Easypanel:**
1. Dashboard → Select Project
2. Tab **"Environment"** atau **"Variables"**
3. Klik **"Raw Editor"** atau **"Bulk Edit"**
4. Paste semua environment variables di atas
5. **SAVE!**
6. **Redeploy** aplikasi

### **Railway:**
1. Dashboard → Select Project
2. Tab **"Variables"**
3. Klik **"RAW Editor"**
4. Paste semua environment variables
5. **Deploy** otomatis trigger

---

## ⚠️ **PENTING:**

### **Ganti Domain Jika Berbeda:**

Jika domain Anda BUKAN `postgres-wa-gateaway.qk6yxt.easypanel.host`, ganti semua occurrence:

**Cari:**
```
postgres-wa-gateaway.qk6yxt.easypanel.host
```

**Ganti dengan domain Anda:**
```
your-actual-domain.com
```

Di variables:
- `WA_GATEWAY_URL`
- `FRONTEND_URL`
- `ALLOWED_ORIGINS`

---

## ✅ **Verifikasi Environment:**

Setelah set environment, test:

### **1. Check Logs:**
Di dashboard, lihat logs. Harusnya muncul:
```
🌐 Frontend server running on port 5000
🚀 WA Gateway Dashboard API running on port 3001
Server is running on http://localhost:5001
```

### **2. Test Endpoints:**

**Frontend:**
```
https://postgres-wa-gateaway.qk6yxt.easypanel.host/
```
Response: HTML dashboard

**Backend API:**
```
https://postgres-wa-gateaway.qk6yxt.easypanel.host:3001/api/auth/login
```
Response: POST endpoint (test dengan login)

**WA Gateway:**
```
https://postgres-wa-gateaway.qk6yxt.easypanel.host:5001/
```
Response: API info

---

## 🐛 **Troubleshooting:**

### **Error: CORS blocked**
✅ Fix: Tambahkan domain ke `ALLOWED_ORIGINS`

### **Error: Cannot connect to backend**
✅ Fix: Pastikan `BACKEND_PORT=3001` ada

### **Error: Database connection**
✅ Fix: Verify `DATABASE_URL` dan `DB_HOST` (pakai internal host)

### **Error: Frontend 404**
✅ Fix: Verify domain routing ke port 5000

---

## 📦 **File yang Sudah Diupdate:**

1. ✅ `.env.production` - Template lengkap
2. ✅ `backend/.env` - Production URLs
3. ✅ `frontend/assets/js/config.js` - Auto-detect URLs & ports

---

## 🎉 **Setelah Setup:**

1. ✅ Push ke GitHub
2. ✅ Set environment variables di platform
3. ✅ Redeploy
4. ✅ Test akses frontend
5. ✅ Login dengan admin/admin123

**Environment sekarang 100% BENAR untuk production!** 🚀
