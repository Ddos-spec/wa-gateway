#!/bin/bash

# Quick start script untuk semua services
# Gunakan script ini setelah deploy pertama kali

set -e

echo "Starting WA Gateway Services..."
echo ""

# Create logs directory if not exists
mkdir -p logs

# Kill existing processes
echo "Stopping existing services..."
pkill -f "node frontend-server.js" 2>/dev/null || true
pkill -f "node backend/server.js" 2>/dev/null || true
pkill -f "node dist/index.js" 2>/dev/null || true

sleep 2

# Start services
echo "[1/3] Starting frontend server (port 5000)..."
nohup node frontend-server.js > logs/frontend.log 2>&1 &
echo "✓ Frontend started"

echo "[2/3] Starting backend API (port 5000)..."
cd backend
nohup node server.js > ../logs/backend.log 2>&1 &
cd ..
echo "✓ Backend API started"

echo "[3/3] Starting WA Gateway (port 5001)..."
nohup node dist/index.js > logs/gateway.log 2>&1 &
echo "✓ WA Gateway started"

sleep 2

echo ""
echo "✅ All services started successfully!"
echo ""
echo "Access:"
echo "  - Frontend: http://localhost:5000"
echo "  - API: http://localhost:5001"
echo ""
echo "View logs:"
echo "  tail -f logs/frontend.log"
echo "  tail -f logs/backend.log"
echo "  tail -f logs/gateway.log"
echo ""