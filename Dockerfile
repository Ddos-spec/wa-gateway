FROM node:20-alpine

# Install dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    bash

# Tell Puppeteer to skip installing Chrome (we'll use Chromium)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml ./
COPY backend/package*.json ./backend/

# Install pnpm
RUN npm install -g pnpm

# Install root dependencies
RUN pnpm install

# Install backend dependencies
WORKDIR /app/backend
RUN npm install

# Copy application files
WORKDIR /app
COPY . .

# Build TypeScript
RUN pnpm run build

# Create necessary directories
RUN mkdir -p /app/media /app/wa_sessions

# Expose ports
EXPOSE 5001 5000

# Create start script
RUN echo '#!/bin/bash\n\
set -e\n\
echo "Starting WA Gateway..."\n\
# Start frontend server\n\
cd /app && node frontend-server.js &\n\
# Start backend dashboard API\n\
cd /app/backend && node server.js &\n\
# Start main WA Gateway\n\
cd /app && node dist/index.js' > /app/start.sh && chmod +x /app/start.sh

CMD ["/app/start.sh"]