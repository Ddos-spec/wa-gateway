# 🚀 WA Gateway - Quick Reference

## 📥 Installation

### Opsi 1: One-Click Install (PALING MUDAH!)
```bash
git clone <your-repo-url>
cd wa-gateway
chmod +x install.sh
./install.sh
```

### Opsi 2: Docker
```bash
chmod +x setup.sh
./setup.sh
```

## 🎮 Management Commands

### Start/Stop Services

**Start All:**
```bash
./start-services.sh
```

**Stop All:**
```bash
./stop-services.sh
```

**Restart:**
```bash
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

## 📋 View Logs

```bash
# All logs
tail -f logs/*.log

# Frontend only
tail -f logs/frontend.log

# Backend only
tail -f logs/backend.log

# Gateway only
tail -f logs/gateway.log
```

## 🔍 Check Status

```bash
# Check running processes
ps aux | grep node

# Check ports
sudo lsof -i :5000
sudo lsof -i :5001

# Check Docker
docker ps
```

## 🗄️ Database

### Manual Migration
```bash
PGPASSWORD=a0bd3b3c1d54b7833014 psql -h postgres_scrapdatan8n -U postgres -d wa_gateaway -f database_init.sql
```

### Connect to Database
```bash
PGPASSWORD=a0bd3b3c1d54b7833014 psql -h postgres_scrapdatan8n -U postgres -d wa_gateaway
```

### Check Tables
```sql
\dt
SELECT * FROM sessions;
SELECT * FROM webhooks;
```

## 🌐 Access URLs

- **Frontend Dashboard:** `http://your-ip:5000`
- **API Gateway:** `http://your-ip:5001`
- **Health Check:** `http://your-ip:5001/`

## 🔐 Default Credentials

- Username: `admin`
- Password: `admin123`

## 🔄 Update Application

```bash
# Pull latest code
git pull origin main

# Rebuild & restart
./stop-services.sh
npx tsc
./start-services.sh

# Atau dengan Docker
docker-compose down
docker build -t wa-gateway:latest .
docker-compose up -d
```

## 🐛 Common Issues

### Port Already in Use
```bash
sudo lsof -i :5000
sudo lsof -i :5001
sudo kill -9 <PID>
```

### Services Won't Start
```bash
# Check logs
tail -f logs/*.log

# Kill all node processes
pkill node

# Start again
./start-services.sh
```

### Database Connection Error
```bash
# Test connection
PGPASSWORD=a0bd3b3c1d54b7833014 psql -h postgres_scrapdatan8n -U postgres -d wa_gateaway -c "SELECT 1"
```

## 📝 File Structure

```
/app
├── dist/                  # Compiled TypeScript
├── backend/              # Backend API
│   └── server.js
├── frontend/             # Static files
│   ├── dashboard.html
│   ├── detail.html
│   └── assets/
├── logs/                 # Application logs
├── install.sh           # One-click installer
├── setup.sh             # Docker setup
├── start-services.sh    # Start all services
├── stop-services.sh     # Stop all services
└── database_init.sql    # Database migration
```

## 🔗 API Endpoints

### Sessions
- `GET /session` - List all sessions
- `POST /session/start` - Create session
- `DELETE /session/:name` - Delete session
- `GET /session/:name/status` - Get status

### Webhooks
- `GET /api/webhooks/:session` - List webhooks
- `POST /api/webhooks/:session` - Add webhook
- `PUT /api/webhooks/:session/:id` - Update webhook
- `PATCH /api/webhooks/:session/:id/toggle` - Toggle on/off
- `DELETE /api/webhooks/:session/:id` - Delete webhook

### Messages
- `POST /message/send-text` - Send text
- `POST /message/send-image` - Send image
- `POST /message/send-document` - Send document

## 💡 Tips

1. **Backup database** secara berkala
2. **Monitor logs** untuk detect issues
3. **Update regularly** untuk security patches
4. **Use nginx** untuk SSL dan domain
5. **Set up monitoring** dengan pm2 atau supervisor

## 📞 Emergency Commands

```bash
# Kill all node processes
sudo pkill -9 node

# Restart everything
./install.sh

# Check system resources
htop
df -h
free -h
```

---

**🎉 Happy Deploying!**
