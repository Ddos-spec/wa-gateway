#!/bin/bash

set -e

echo "================================================"
echo "   WA Gateway Setup Script"
echo "================================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0;0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker tidak terinstall.${NC}"
    echo "Silakan install Docker terlebih dahulu: https://docs.docker.com/get-docker/"
    exit 1
fi

echo -e "${GREEN}✓ Docker terdeteksi${NC}"

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Warning: docker-compose tidak terdeteksi, menggunakan 'docker compose'${NC}"
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

echo ""
echo "================================================"
echo "   Langkah 1: Setup Database"
echo "================================================"
echo ""

echo "Menjalankan migrasi database..."

# Run migrations
if [ -f "migration_webhooks.sql" ]; then
    echo "Menjalankan migration_webhooks.sql..."
    PGPASSWORD=a0bd3b3c1d54b7833014 psql -h postgres_scrapdatan8n -U postgres -d wa_gateaway -f migration_webhooks.sql 2>/dev/null || {
        echo -e "${YELLOW}Note: Migrasi mungkin sudah dijalankan sebelumnya atau perlu dijalankan manual${NC}"
    }
fi

if [ -f "backend/migration.sql" ]; then
    echo "Menjalankan backend/migration.sql..."
    PGPASSWORD=a0bd3b3c1d54b7833014 psql -h postgres_scrapdatan8n -U postgres -d wa_gateaway -f backend/migration.sql 2>/dev/null || {
        echo -e "${YELLOW}Note: Migrasi mungkin sudah dijalankan sebelumnya atau perlu dijalankan manual${NC}"
    }
fi

echo -e "${GREEN}✓ Database setup selesai${NC}"

echo ""
echo "================================================"
echo "   Langkah 2: Build Docker Image"
echo "================================================"
echo ""

echo "Building Docker image..."
docker build -t wa-gateway:latest .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Docker image berhasil dibuild${NC}"
else
    echo -e "${RED}Error: Gagal build Docker image${NC}"
    exit 1
fi

echo ""
echo "================================================"
echo "   Langkah 3: Start Container"
echo "================================================"
echo ""

echo "Starting WA Gateway container..."
$DOCKER_COMPOSE up -d

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Container berhasil dijalankan${NC}"
else
    echo -e "${RED}Error: Gagal menjalankan container${NC}"
    exit 1
fi

echo ""
echo "================================================"
echo "   Setup Selesai!"
echo "================================================"
echo ""
echo -e "${GREEN}WA Gateway berhasil diinstall!${NC}"
echo ""
echo "Akses aplikasi di:"
echo "  - Frontend: http://localhost:5000"
echo "  - API Gateway: http://localhost:5001"
echo ""
echo "Untuk melihat logs:"
echo "  docker logs -f wa-gateway"
echo ""
echo "Untuk stop:"
echo "  $DOCKER_COMPOSE down"
echo ""
echo "Untuk restart:"
echo "  $DOCKER_COMPOSE restart"
echo ""