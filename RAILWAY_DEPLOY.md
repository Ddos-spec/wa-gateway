# 🚀 WA Gateway - Railway Deployment

## Quick Deploy ke Railway

### 📋 Prerequisites
- Akun GitHub
- Akun Railway
- PostgreSQL database (sudah ada di VPS yang sama)

---

## 🎯 Langkah Deploy

### 1️⃣ Push ke GitHub

Push repository ini ke GitHub Anda:
```bash
git init
git add .
git commit -m "Initial commit - WA Gateway"
git remote add origin https://github.com/Ddos-spec/wa-gateway.git
git branch -M main
git push -u origin main
```

### 2️⃣ Setup di Railway

1. **Login ke Railway**: https://railway.app
2. **New Project** → **Deploy from GitHub repo**
3. **Select Repository**: `Ddos-spec/wa-gateway`
4. **Branch**: `main`
5. **Build Path**: `/` (default)

Railway akan otomatis detect Nixpacks dan build!

### 3️⃣ Set Environment Variables

Di Railway Dashboard → Variables, tambahkan:

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
FRONTEND_URL=
ALLOWED_ORIGINS=
WEBHOOK_BASE_URL=
```

### 4️⃣ Deploy!

Klik **Deploy** dan tunggu build selesai!

---

## 📝 Konfigurasi File

Semua file sudah di-setup untuk Railway:

### ✅ `nixpacks.toml`
```toml
[phases.setup]
nixPkgs = ['nodejs-20_x', 'pnpm']

[phases.install]
cmds = [
  'pnpm install --frozen-lockfile',
  'cd backend && npm install && cd ..'
]

[phases.build]
cmds = ['npx tsc']

[start]
cmd = 'node frontend-server.js & cd backend && node server.js & node dist/index.js'
```

### ✅ `.node-version`
```
20
```

### ✅ `railway.json`
```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install && cd backend && npm install && cd .. && npx tsc"
  },
  "deploy": {
    "startCommand": "node frontend-server.js & cd backend && node server.js & node dist/index.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## 🔧 Settings Railway

### Build Configuration
- **Build Command**: Auto-detected dari `nixpacks.toml`
- **Start Command**: Auto-detected dari `nixpacks.toml`
- **Root Directory**: `/`

### Deploy Configuration
- **Branch**: `main`
- **Auto Deploy**: ✅ Enabled
- **Build Provider**: Nixpacks

---

## 🌐 Setelah Deploy

### Generate Domain
1. Settings → Networking
2. Generate Domain
3. Copy URL (misal: `wa-gateway-production.up.railway.app`)

### Update Frontend URL
Tambahkan domain Railway ke environment variables:
```env
FRONTEND_URL=https://wa-gateway-production.up.railway.app
```

### Akses Aplikasi
- **Dashboard**: `https://wa-gateway-production.up.railway.app`
- **API**: `https://wa-gateway-production.up.railway.app/api`

### Default Login
- Username: `admin`
- Password: `admin123`

---

## 📊 Monitoring

### View Logs
Di Railway Dashboard:
1. Klik project Anda
2. Tab **Deployments**
3. Klik deployment terakhir
4. View logs real-time

### Metrics
- CPU Usage
- Memory Usage
- Network Traffic
- Build Times

---

## 🔄 Auto Deploy

Setiap push ke GitHub `main` branch akan trigger auto-deploy!

```bash
git add .
git commit -m "Update features"
git push origin main
```

Railway akan otomatis:
1. Pull latest code
2. Build dengan Nixpacks
3. Run tests (jika ada)
4. Deploy new version
5. Zero-downtime deployment

---

## 🐛 Troubleshooting

### Build Failed
- Check logs di Railway dashboard
- Pastikan semua dependencies tercantum di `package.json`
- Verify Node version (20+)

### Database Connection Error
- Pastikan DATABASE_URL benar
- Check PostgreSQL service running di VPS
- Test connection dari Railway ke VPS

### Port Issues
Railway auto-assign PORT, pastikan aplikasi listen ke `process.env.PORT`

---

## 💡 Tips

1. **Use Railway CLI** untuk development:
   ```bash
   npm i -g @railway/cli
   railway login
   railway link
   railway run npm run dev
   ```

2. **Environment Variables**: Gunakan Railway secrets untuk sensitive data

3. **Database Backups**: Setup automated backups untuk PostgreSQL

4. **Custom Domain**: 
   - Settings → Networking → Custom Domain
   - Add CNAME record di DNS provider

5. **Monitoring**: Setup alerts untuk downtime detection

---

## 🎉 Done!

WA Gateway Anda sudah live di Railway dengan:
- ✅ Node.js 20+
- ✅ Auto-deploy dari GitHub
- ✅ Zero-downtime updates
- ✅ Real-time logs
- ✅ Automatic SSL
- ✅ CDN & Edge network

Selamat menggunakan! 🚀
