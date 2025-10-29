#!/bin/bash
# Build script untuk Railway/Nixpacks

set -e

echo "🚀 Starting build process..."

# Install root dependencies
echo "📦 Installing root dependencies..."
pnpm install --frozen-lockfile

# Install backend dependencies  
echo "📦 Installing backend dependencies..."
cd backend
npm install
cd ..

# Build TypeScript
echo "🔨 Building TypeScript..."
npx tsc

echo "✅ Build complete!"
