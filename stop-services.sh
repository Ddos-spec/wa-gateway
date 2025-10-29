#!/bin/bash

# Stop all WA Gateway services

echo "Stopping WA Gateway Services..."
echo ""

pkill -f "node frontend-server.js" && echo "✓ Frontend stopped" || echo "✗ Frontend not running"
pkill -f "node backend/server.js" && echo "✓ Backend API stopped" || echo "✗ Backend API not running"
pkill -f "node dist/index.js" && echo "✓ WA Gateway stopped" || echo "✗ WA Gateway not running"

echo ""
echo "✅ All services stopped!"
echo ""