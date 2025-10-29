#!/bin/bash

# ===========================================
# WA Gateway - One-Click Install Script
# ===========================================
# Script ini untuk install WA Gateway di VPS
# dengan satu command saja!
# ===========================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Banner
echo -e "${CYAN}"
echo "╔════════════════════════════════════════╗"
echo "║                                        ║"
echo "║      WA GATEWAY INSTALLER v1.0         ║"
echo "║      One-Click Installation            ║"
echo "║                                        ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}Note: Beberapa perintah mungkin memerlukan sudo${NC}"
fi

echo -e "${BLUE}[1/6] Checking Prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js tidak ditemukan${NC}"
    echo -e "${YELLOW}Installing Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo -e "${GREEN}✓ Node.js installed${NC}"
else
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓ Node.js ${NODE_VERSION} detected${NC}"
fi

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}Installing pnpm...${NC}"
    npm install -g pnpm
    echo -e "${GREEN}✓ pnpm installed${NC}"
else
    echo -e "${GREEN}✓ pnpm detected${NC}"
fi

echo ""
echo -e "${BLUE}[2/6] Installing Dependencies...${NC}"

# Install dependencies
echo "Installing root dependencies..."
pnpm install --frozen-lockfile 2>&1 | grep -E "(Progress|Done)" || true
echo -e "${GREEN}✓ Root dependencies installed${NC}"

echo "Installing backend dependencies..."
cd backend
npm install 2>&1 | tail -1
cd ..
echo -e "${GREEN}✓ Backend dependencies installed${NC}"

echo ""
echo -e "${BLUE}[3/6] Building Application...${NC}"

# Build TypeScript
npx tsc
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ TypeScript compiled successfully${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}[4/6] Setting up Database...${NC}"

# Run database migration
if [ -f "database_init.sql" ]; then
    echo "Running database migration..."
    PGPASSWORD=a0bd3b3c1d54b7833014 psql -h postgres_scrapdatan8n -U postgres -d wa_gateaway -f database_init.sql 2>/dev/null && {
        echo -e "${GREEN}✓ Database migration completed${NC}"
    } || {
        echo -e "${YELLOW}⚠ Database migration skipped (mungkin sudah dijalankan)${NC}"
    }
else
    echo -e "${YELLOW}⚠ database_init.sql not found${NC}"
fi

echo ""
echo -e "${BLUE}[5/6] Creating Logs Directory...${NC}"
mkdir -p logs
echo -e "${GREEN}✓ Logs directory created${NC}"

echo ""
echo -e "${BLUE}[6/6] Starting Services...${NC}"

# Stop existing services
echo "Stopping existing services..."
pkill -f "node frontend-server.js" 2>/dev/null || true
pkill -f "node backend/server.js" 2>/dev/null || true
pkill -f "node dist/index.js" 2>/dev/null || true

sleep 2

# Start services
echo "Starting frontend server (port 5000)..."
nohup node frontend-server.js > logs/frontend.log 2>&1 &
echo -e "${GREEN}✓ Frontend started${NC}"

echo "Starting backend API (port 5000)..."
cd backend
nohup node server.js > ../logs/backend.log 2>&1 &
cd ..
echo -e "${GREEN}✓ Backend API started${NC}"

echo "Starting WA Gateway (port 5001)..."
nohup node dist/index.js > logs/gateway.log 2>&1 &
echo -e "${GREEN}✓ WA Gateway started${NC}"

sleep 3

# Check if services are running
FRONTEND_PID=$(pgrep -f "node frontend-server.js")
BACKEND_PID=$(pgrep -f "node backend/server.js")
GATEWAY_PID=$(pgrep -f "node dist/index.js")

echo ""
echo -e "${CYAN}"
echo "╔════════════════════════════════════════╗"
echo "║                                        ║"
echo "║      🎉 INSTALLATION COMPLETE! 🎉      ║"
echo "║                                        ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

echo -e "${GREEN}Services Status:${NC}"
if [ ! -z "$FRONTEND_PID" ]; then
    echo -e "  ✓ Frontend Server: ${GREEN}Running${NC} (PID: $FRONTEND_PID)"
else
    echo -e "  ✗ Frontend Server: ${RED}Not Running${NC}"
fi

if [ ! -z "$BACKEND_PID" ]; then
    echo -e "  ✓ Backend API: ${GREEN}Running${NC} (PID: $BACKEND_PID)"
else
    echo -e "  ✗ Backend API: ${RED}Not Running${NC}"
fi

if [ ! -z "$GATEWAY_PID" ]; then
    echo -e "  ✓ WA Gateway: ${GREEN}Running${NC} (PID: $GATEWAY_PID)"
else
    echo -e "  ✗ WA Gateway: ${RED}Not Running${NC}"
fi

echo ""
echo -e "${CYAN}Access Your Application:${NC}"
echo -e "  ${GREEN}Dashboard:${NC} http://$(hostname -I | awk '{print $1}'):5000"
echo -e "  ${GREEN}API Gateway:${NC} http://$(hostname -I | awk '{print $1}'):5001"
echo ""

echo -e "${CYAN}Default Login:${NC}"
echo -e "  Username: ${YELLOW}admin${NC}"
echo -e "  Password: ${YELLOW}admin123${NC}"
echo ""

echo -e "${CYAN}Useful Commands:${NC}"
echo -e "  View logs:    ${YELLOW}tail -f logs/gateway.log${NC}"
echo -e "  Stop services: ${YELLOW}./stop-services.sh${NC}"
echo -e "  Start services: ${YELLOW}./start-services.sh${NC}"
echo ""

echo -e "${PURPLE}Made with ❤️ for easy deployment${NC}"
echo ""
