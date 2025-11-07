# WA Gateway - Siap Produksi

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

## 🚀 Quick Start & Deployment

### Opsi 1: Docker Deployment (Recommended)
1.  Clone repository ini.
2.  Jalankan setup:
    ```bash
    chmod +x setup.sh
    ./setup.sh
    ```
3.  Akses aplikasi:
    -   Frontend: `http://your-domain:5000`
    -   API: `http://your-domain:5001`

### Opsi 2: Manual Deployment
1.  Install dependencies:
    ```bash
    pnpm install
    ```
2.  Setup environment variables (lihat bagian Environment Variables di bawah).
3.  Build & Start:
    ```bash
    pnpm run build
    pnpm start
    ```

### Opsi 3: One-Click Install Script
Skrip ini akan mengurus semua dependensi dan memulai layanan.
```bash
git clone <your-repo-url>
cd wa-gateway
chmod +x install.sh
./install.sh
```

## 🎮 Management Commands

### Start/Stop Services (Non-Docker)
```bash
# Start All
./start-services.sh

# Stop All
./stop-services.sh

# Restart
./stop-services.sh && ./start-services.sh
```

### Docker Commands
```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# Restart
docker-compose restart

# Logs
docker logs -f wa-gateway
```

## 🔧 Environment Variables

# URL & Port Configuration
NODE_ENV=PRODUCTION
WA_GATEWAY_URL=https://postgres-wa-gateaway.qk6yxt.easypanel.host
FRONTEND_URL=https://postgres-wa-gateaway.qk6yxt.easypanel.host
ALLOWED_ORIGINS=https://postgres-wa-gateaway.qk6yxt.easypanel.host
PORT=5001
BACKEND_PORT=3001
FRONTEND_PORT=5000

# Database Connection
DATABASE_URL=postgres://postgres:a0bd3b3c1d54b7833014@postgres_scrapdatan8n:5432/wa_gateaway?sslmode=disable
DB_USER=postgres
DB_PASSWORD=a0bd3b3c1d54b7833014
DB_HOST=postgres_scrapdatan8n
DB_PORT=5432
DB_NAME=wa_gateaway

# Security
JWT_SECRET=e932b72464b58e7a0a6a029c7b9667c29e18b02927e163b2f96e4ac74d7c0f1e
JWT_EXPIRES_IN=7d

# Optional
WEBHOOK_BASE_URL=https://postgres-wa-gateaway.qk6yxt.easypanel.host
KEY=

**PENTING**: Ganti `your-domain.com` dengan domain produksi Anda yang sebenarnya.

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

## 🗄️ Database

### Manual Migration
Database migration otomatis dijalankan saat setup. Untuk manual migration:
```bash
PGPASSWORD=your_password psql -h host -U user -d dbname -f migration.sql
```

### Struktur Database
CREATE TABLE "public"."config" ( 
  "id" INTEGER NOT NULL DEFAULT 1 ,
  "username" VARCHAR(50) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "updated_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "config_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."sessions" ( 
  "id" SERIAL,
  "session_name" VARCHAR(100) NOT NULL,
  "status" VARCHAR(20) NULL DEFAULT 'offline'::character varying ,
  "wa_number" VARCHAR(20) NULL,
  "profile_name" VARCHAR(100) NULL,
  "webhook_url" TEXT NULL,
  "webhook_events" JSONB NULL DEFAULT '{"audio": false, "group": false, "image": false, "video": false, "from_me": true, "document": false, "individual": true, "update_status": true}'::jsonb ,
  "api_key" VARCHAR(64) NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  "updated_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  "user_id" INTEGER NULL,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_session_name_key" UNIQUE ("session_name")
);
CREATE TABLE "public"."session_logs" ( 
  "id" SERIAL,
  "session_id" INTEGER NULL,
  "action" VARCHAR(50) NULL,
  "details" JSONB NULL,
  "timestamp" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "session_logs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."webhooks" ( 
  "id" SERIAL,
  "session_id" INTEGER NOT NULL,
  "webhook_url" TEXT NOT NULL,
  "webhook_events" JSONB NULL DEFAULT '{"audio": false, "group": false, "image": false, "video": false, "from_me": true, "sticker": false, "document": false, "individual": true, "update_status": true}'::jsonb ,
  "is_active" BOOLEAN NULL DEFAULT true ,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  "updated_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."notifications" ( 
  "id" SERIAL,
  "user_id" INTEGER NULL,
  "type" VARCHAR(50) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "message" TEXT NOT NULL,
  "read_status" BOOLEAN NULL DEFAULT false ,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  "updated_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."users" ( 
  "id" SERIAL,
  "username" VARCHAR(100) NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "full_name" VARCHAR(255) NULL,
  "phone" VARCHAR(20) NULL,
  "role" VARCHAR(20) NULL DEFAULT 'customer'::character varying ,
  "status" VARCHAR(20) NULL DEFAULT 'active'::character varying ,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  "updated_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_username_key" UNIQUE ("username"),
  CONSTRAINT "users_email_key" UNIQUE ("email")
);
CREATE TABLE "public"."subscriptions" ( 
  "id" SERIAL,
  "user_id" INTEGER NULL,
  "plan_id" INTEGER NULL,
  "status" VARCHAR(20) NULL DEFAULT 'active'::character varying ,
  "starts_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  "expires_at" TIMESTAMP NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."plans" ( 
  "id" SERIAL,
  "name" VARCHAR(100) NOT NULL,
  "price" NUMERIC NOT NULL,
  "max_sessions" INTEGER NOT NULL,
  "features" JSONB NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."message_logs" ( 
  "id" SERIAL,
  "session_name" VARCHAR(255) NOT NULL,
  "from_number" VARCHAR(20) NULL,
  "to_number" VARCHAR(20) NULL,
  "message_type" VARCHAR(50) NULL,
  "message_content" TEXT NULL,
  "status" VARCHAR(20) NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "public"."api_usage_logs" ( 
  "id" SERIAL,
  "user_id" INTEGER NULL,
  "endpoint" VARCHAR(255) NOT NULL,
  "method" VARCHAR(10) NOT NULL,
  "response_time" INTEGER NULL,
  "status_code" INTEGER NULL,
  "created_at" TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ,
  CONSTRAINT "api_usage_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_sessions_status" 
ON "public"."sessions" (
  "status" ASC
);
CREATE INDEX "idx_sessions_session_name" 
ON "public"."sessions" (
  "session_name" ASC
);
CREATE INDEX "idx_sessions_created_at" 
ON "public"."sessions" (
  "created_at" DESC
);
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."session_logs" ADD CONSTRAINT "session_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."api_usage_logs" ADD CONSTRAINT "api_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


## 🔐 Default Login

-   **Username**: `admin`
-   **Password**: `admin123`

**Pastikan ganti password setelah login pertama!**

## 🐛 Troubleshooting

### Service tidak start
```bash
docker logs wa-gateway
```
Atau untuk non-docker:
```bash
tail -f server.log dev_server.log frontend_server.log
```

### Port sudah digunakan
Edit `docker-compose.yml` dan ubah port mapping, atau hentikan proses yang menggunakan port tersebut.
```bash
sudo lsof -i :5000
sudo kill -9 <PID>
```

### Database connection error
Pastikan PostgreSQL service berjalan dan kredensial benar di file `.env`.

proksi domain saat ini 
frontend
http://postgres_wa_gateaway:5000/
/api/
http://postgres_wa_gateaway:3001/
/gateway/
http://postgres_wa_gateaway:5001/