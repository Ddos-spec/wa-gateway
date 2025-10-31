#!/bin/sh
set -e

echo "🚀 Starting WA Gateway Services..."

# Trap to ensure all background processes are killed on exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT

# Start WA Gateway first (main API server on port 5001)
echo "▶️  Starting WA Gateway API (port 5001)..."
node /app/dist/index.js &
GATEWAY_PID=$!
echo "✅ WA Gateway API started (PID: $GATEWAY_PID)"

# Wait a bit
sleep 5

# Start backend dashboard API (port 3001)
echo "▶️  Starting Backend Dashboard API (port 3001)..."
cd /app/backend
node server.js &
BACKEND_PID=$!
cd /app
echo "✅ Backend Dashboard API started (PID: $BACKEND_PID)"

# Wait a bit
sleep 5

# Start frontend server (port 5000) - this will proxy to other services
echo "▶️  Starting Frontend Server (port 5000)..."
node /app/frontend-server.js &
FRONTEND_PID=$!
echo "✅ Frontend started (PID: $FRONTEND_PID)"

echo ""
echo "🎉 All services started successfully!"
echo "   Frontend: http://localhost:5000"
echo "   Backend Dashboard API: http://localhost:3001"
echo "   WA Gateway API: http://localhost:5001"
echo ""

# Wait for all background processes
wait
