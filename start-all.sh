#!/bin/sh
set -e

echo "🚀 Starting WA Gateway Services..."

# Trap to ensure all background processes are killed on exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT

# Start frontend server
echo "▶️  Starting Frontend Server (port 5000)..."
node frontend-server.js &
FRONTEND_PID=$!
echo "✅ Frontend started (PID: $FRONTEND_PID)"

# Wait a bit
sleep 2

# Start backend API
echo "▶️  Starting Backend API (port 5000)..."
cd backend
node server.js &
BACKEND_PID=$!
cd ..
echo "✅ Backend API started (PID: $BACKEND_PID)"

# Wait a bit
sleep 2

# Start WA Gateway
echo "▶️  Starting WA Gateway (port 5001)..."
node dist/index.js &
GATEWAY_PID=$!
echo "✅ WA Gateway started (PID: $GATEWAY_PID)"

echo ""
echo "🎉 All services started successfully!"
echo "   Frontend: http://localhost:5000"
echo "   API: http://localhost:5001"
echo ""

# Wait for all background processes
wait
