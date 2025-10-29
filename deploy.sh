#!/bin/bash

# Script untuk deploy WA Gateway dengan Docker
# Jalankan script ini di VPS Anda

set -e

echo "======================================"
echo "  WA Gateway - Docker Deployment"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Langkah 1: Install Dependencies${NC}"
echo "Menginstall pnpm dan dependencies..."
cd /app
npm install -g pnpm
pnpm install
cd backend && npm install && cd ..

echo ""
echo -e "${BLUE}Langkah 2: Build TypeScript${NC}"
echo "Compiling TypeScript..."
npx tsc

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build berhasil!${NC}"
else
    echo -e "${RED}✗ Build gagal!${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Langkah 3: Setup Database${NC}"
echo "Menjalankan database migration..."

# Check if database_init.sql exists
if [ -f "database_init.sql" ]; then
    echo "Running database_init.sql..."
    PGPASSWORD=a0bd3b3c1d54b7833014 psql -h postgres_scrapdatan8n -U postgres -d wa_gateaway -f database_init.sql 2>/dev/null || {
        echo -e "${YELLOW}Note: Database migration mungkin sudah dijalankan atau perlu manual${NC}"
    }
fi

echo ""
echo -e "${BLUE}Langkah 4: Start Services${NC}"

# Kill existing processes
echo "Stopping existing services..."
pkill -f "node frontend-server.js" 2>/dev/null || true
pkill -f "node backend/server.js" 2>/dev/null || true
pkill -f "node dist/index.js" 2>/dev/null || true

sleep 2

# Start services
echo "Starting frontend server..."
nohup node frontend-server.js > logs/frontend.log 2>&1 &
echo -e "${GREEN}✓ Frontend started (port 5000)${NC}"

echo "Starting backend API..."
cd backend
nohup node server.js > ../logs/backend.log 2>&1 &
cd ..
echo -e "${GREEN}✓ Backend API started (port 5000)${NC}"

echo "Starting WA Gateway..."
nohup node dist/index.js > logs/gateway.log 2>&1 &
echo -e "${GREEN}✓ WA Gateway started (port 5001)${NC}"

sleep 3

echo ""
echo "======================================"
echo -e "${GREEN}  Deployment Selesai!${NC}"
echo "======================================"
echo ""
echo "Aplikasi berjalan di:"
echo -e "  ${GREEN}Frontend:${NC} http://localhost:5000"
echo -e "  ${GREEN}API Gateway:${NC} http://localhost:5001"
echo ""
echo "Untuk melihat logs:"
echo "  tail -f logs/frontend.log"
echo "  tail -f logs/backend.log"
echo "  tail -f logs/gateway.log"
echo ""
echo "Untuk stop semua services:"
echo "  pkill -f 'node frontend-server.js'"
echo "  pkill -f 'node backend/server.js'"
echo "  pkill -f 'node dist/index.js'"
echo ""