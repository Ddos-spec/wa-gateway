# WA Gateway - Setup Guide

## Quick Start dengan Docker

### Prerequisites
- Docker terinstall
- PostgreSQL database sudah tersedia (kredensial sudah dikonfigurasi)

### Instalasi

1. Clone repository:
```bash
git clone <your-repo-url>
cd wa-gateway
```

2. Jalankan setup script:
```bash
chmod +x setup.sh
./setup.sh
```

3. Akses aplikasi:
- Frontend Dashboard: `http://localhost:5000`
- API Gateway: `http://localhost:5001`

### Build Path untuk Deployment

Jika menggunakan platform deployment seperti Railway, Render, atau sejenisnya:

**Build Command:**
```bash
pnpm install && cd backend && npm install && cd .. && pnpm run build
```

**Start Command:**
```bash
cd backend && node server.js & cd /app && node dist/index.js
```

**Build Path:** `/`

### Environment Variables

Pastikan environment variables berikut sudah diset:

```env
DATABASE_URL=postgres://postgres:a0bd3b3c1d54b7833014@postgres_scrapdatan8n:5432/wa_gateaway?sslmode=disable
JWT_SECRET=wa-gateway-super-secret-key-2025
JWT_EXPIRES_IN=7d
NODE_ENV=PRODUCTION
PORT=5001
DB_USER=postgres
DB_PASSWORD=a0bd3b3c1d54b7833014
DB_HOST=postgres_scrapdatan8n
DB_PORT=5432
DB_NAME=wa_gateaway
WA_GATEWAY_URL=http://localhost:5001
```

### Database Migration

Jika perlu menjalankan migrasi manual:

```bash
PGPASSWORD=a0bd3b3c1d54b7833014 psql -h postgres_scrapdatan8n -U postgres -d wa_gateaway -f migration_webhooks.sql
```

### Commands

**Start:**
```bash
docker-compose up -d
```

**Stop:**
```bash
docker-compose down
```

**Logs:**
```bash
docker logs -f wa-gateway
```

**Restart:**
```bash
docker-compose restart
```

### Features

- ✅ Multiple webhooks per session
- ✅ Webhook on/off toggle
- ✅ QR Code login
- ✅ Phone number pairing
- ✅ Unlimited sessions
- ✅ RESTful API
- ✅ Auto-format phone numbers (0812-3456-789)

### API Endpoints

Semua endpoint API tersedia di: `http://localhost:5001`

Dokumentasi API lengkap tersedia setelah aplikasi berjalan.

### Troubleshooting

**Container tidak start:**
```bash
docker logs wa-gateway
```

**Database connection error:**
Pastikan PostgreSQL service berjalan dan kredensial benar.

**Port sudah digunakan:**
Ubah port di `docker-compose.yml`