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

# Create a reliable start script
RUN echo "#!/bin/sh" > /app/start.sh && \
    echo "set -e" >> /app/start.sh && \
    echo "echo '--- Starting services ---'" >> /app/start.sh && \
    echo "node /app/frontend-server.js &" >> /app/start.sh && \
    echo "node /app/backend/server.js &" >> /app/start.sh && \
    echo "node /app/dist/index.js &" >> /app/start.sh && \
    echo "echo '--- Services started, waiting for processes to exit ---'" >> /app/start.sh && \
    echo "wait -n" >> /app/start.sh

# Make the script executable
RUN chmod +x /app/start.sh

# Set the command to run the script
CMD ["/app/start.sh"]