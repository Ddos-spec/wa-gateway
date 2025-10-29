# 🚀 WA Gateway - Panduan Deploy di VPS

## Opsi 1: Docker Deployment (RECOMMENDED)

### Prerequisites
- Docker terinstall di VPS
- Git terinstall
- Akses SSH ke VPS

### Langkah-langkah Deploy:

#### 1. Clone Repository
```bash
cd /home/your-user
git clone https://github.com/your-username/wa-gateway.git
cd wa-gateway
```

#### 2. Jalankan Setup Script
```bash
chmod +x setup.sh
./setup.sh
```

Script ini akan otomatis:
- ✅ Check Docker installation
- ✅ Setup database migration
- ✅ Build Docker image
- ✅ Start container
- ✅ Setup semua services

#### 3. Cek Status
```bash
docker ps
docker logs -f wa-gateway
```

#### 4. Akses Aplikasi
- Frontend: `http://your-vps-ip:5000`
- API Gateway: `http://your-vps-ip:5001`

---

## Opsi 2: Manual Deployment (Tanpa Docker)

Jika VPS Anda tidak ada Docker atau ingin deploy manual:

### Langkah 1: Install Node.js & Dependencies
```bash
# Install Node.js 18+ (jika belum)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm
```

### Langkah 2: Clone & Setup
```bash
cd /home/your-user
git clone https://github.com/your-username/wa-gateway.git
cd wa-gateway
```

### Langkah 3: Jalankan Deploy Script
```bash
chmod +x deploy.sh
./deploy.sh
```

Deploy script akan:
- Install semua dependencies
- Build TypeScript
- Run database migration
- Start semua services

---

## 📋 Management Scripts

Setelah deploy, gunakan script-script ini untuk manage aplikasi:

### Start Services
```bash
./start-services.sh
```

### Stop Services
```bash
./stop-services.sh
```

### View Logs
```bash
# Frontend logs
tail -f logs/frontend.log

# Backend API logs
tail -f logs/backend.log

# WA Gateway logs
tail -f logs/gateway.log

# Atau untuk Docker
docker logs -f wa-gateway
```

### Restart Services

**Manual:**
```bash
./stop-services.sh
./start-services.sh
```

**Docker:**
```bash
docker-compose restart
```

---

## 🔧 Konfigurasi Environment

Edit file `.env` jika perlu mengubah konfigurasi:

```bash
nano .env
```

Variabel penting:
```env
DATABASE_URL=postgres://postgres:a0bd3b3c1d54b7833014@postgres_scrapdatan8n:5432/wa_gateaway?sslmode=disable
JWT_SECRET=wa-gateway-super-secret-key-2025
PORT=5001
```

**⚠️ PENTING:** Restart services setelah mengubah `.env`

---

## 🗄️ Database Migration

Database migration sudah otomatis dijalankan oleh script. Jika perlu manual:

```bash
PGPASSWORD=a0bd3b3c1d54b7833014 psql -h postgres_scrapdatan8n -U postgres -d wa_gateaway -f database_init.sql
```

---

## 🔐 Default Login

Setelah deploy, login ke dashboard:

- URL: `http://your-vps-ip:5000`
- Username: `admin`
- Password: `admin123`

**⚠️ PENTING:** Ganti password setelah login pertama!

---

## 🌐 Setup Domain & SSL (Optional)

### Dengan Nginx

1. Install Nginx:
```bash
sudo apt update
sudo apt install nginx
```

2. Create config:
```bash
sudo nano /etc/nginx/sites-available/wa-gateway
```

Paste config ini:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API Gateway
    location /api/ {
        proxy_pass http://localhost:5001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/wa-gateway /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

4. Install SSL dengan Certbot:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## 🐛 Troubleshooting

### Port sudah digunakan
```bash
# Check process menggunakan port
sudo lsof -i :5000
sudo lsof -i :5001

# Kill process
sudo kill -9 PID
```

### Service tidak start
```bash
# Check logs
tail -f logs/*.log

# Manual start each service
node frontend-server.js
cd backend && node server.js
node dist/index.js
```

### Database connection error
```bash
# Test connection
PGPASSWORD=a0bd3b3c1d54b7833014 psql -h postgres_scrapdatan8n -U postgres -d wa_gateaway -c "SELECT 1"
```

### Rebuild setelah update code
```bash
# Manual
npx tsc
./stop-services.sh
./start-services.sh

# Docker
docker-compose down
docker build -t wa-gateway:latest .
docker-compose up -d
```

---

## 📊 Monitoring

### Check Process Status
```bash
ps aux | grep node
```

### Check Resource Usage
```bash
htop
```

### Check Disk Space
```bash
df -h
```

---

## 🔄 Update Aplikasi

Jika ada update dari repository:

### Manual:
```bash
cd /home/your-user/wa-gateway
git pull origin main
./deploy.sh
```

### Docker:
```bash
cd /home/your-user/wa-gateway
git pull origin main
docker-compose down
docker build -t wa-gateway:latest .
docker-compose up -d
```

---

## 📞 Support

Jika ada masalah:
1. Check logs di `logs/` directory
2. Pastikan semua services running
3. Verify database connection
4. Check port availability

---

## 🎉 Selesai!

Aplikasi WA Gateway Anda sudah siap digunakan untuk integrasi dengan n8n atau aplikasi lainnya!
