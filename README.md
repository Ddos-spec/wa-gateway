# WA Gateway - Siap Production

WhatsApp Gateway dengan fitur lengkap untuk integrasi dengan n8n atau aplikasi lainnya.

## ✨ Fitur Utama

- ✅ Multiple Sessions (Unlimited)
- ✅ Multiple Webhooks per Session
- ✅ Webhook On/Off Toggle
- ✅ QR Code Login
- ✅ REST API lengkap
- ✅ Dashboard Web UI
- ✅ Auto-format Phone Numbers
- ✅ PostgreSQL Database
- ✅ Ready for Docker Deployment

## 🚀 Quick Start

### Docker Deployment (Recommended)

1. Clone repository ini
2. Jalankan setup:
```bash
chmod +x setup.sh
./setup.sh
```

3. Akses aplikasi:
- Frontend: http://your-domain:5000
- API: http://your-domain:5001

### Manual Deployment

1. Install dependencies:
```bash
pnpm install
cd backend && npm install
cd ..
```

2. Setup environment variables (lihat .env.example)

3. Build & Start:
```bash
pnpm run build
node dist/index.js &
cd backend && node server.js &
node frontend-server.js
```

## 📚 Build Path untuk VPS

**Build Path:** `/`

**Build Command:**
```bash
pnpm install && cd backend && npm install && cd .. && npx tsc
```

**Start Command:**
```bash
node frontend-server.js & cd backend && node server.js & node dist/index.js
```

## 🔧 Environment Variables

Lihat file `.env.example` untuk konfigurasi lengkap. Variabel penting:

```env
DATABASE_URL=postgres://user:pass@host:port/dbname
JWT_SECRET=your-secret-key
PORT=5001
```

## 📡 API Endpoints

### Session Management
- `GET /session` - List all sessions
- `POST /session/start` - Create new session
- `GET /session/:name/status` - Get session status
- `DELETE /session/:name` - Delete session

### Webhooks
- `GET /api/webhooks/:sessionName` - Get all webhooks
- `POST /api/webhooks/:sessionName` - Add webhook
- `PUT /api/webhooks/:sessionName/:id` - Update webhook
- `PATCH /api/webhooks/:sessionName/:id/toggle` - Toggle webhook on/off
- `DELETE /api/webhooks/:sessionName/:id` - Delete webhook

### Messages
- `POST /message/send-text` - Send text message
- `POST /message/send-image` - Send image
- `POST /message/send-document` - Send document

## 🔐 Default Login

Username: `admin`  
Password: `admin123`

**Pastikan ganti password setelah login pertama!**

## 📦 Database Migration

Database migration otomatis dijalankan saat setup. Untuk manual migration:

```bash
PGPASSWORD=your_password psql -h host -U user -d dbname -f database_init.sql
```

## 🐛 Troubleshooting

### Service tidak start
```bash
docker logs wa-gateway
```

### Port sudah digunakan
Edit `docker-compose.yml` dan ubah port mapping.

### Database connection error
Pastikan PostgreSQL service berjalan dan kredensial benar di `.env`.

## 📞 Support

Untuk masalah atau pertanyaan, buka issue di repository ini.

## 📄 License

ISC License
