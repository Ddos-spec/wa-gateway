# --- Tahap 1: Base Image ---
FROM node:20-alpine

# Install dependensi sistem yang diperlukan untuk native modules (jika ada)
# python3, make, g++, git sering dibutuhkan oleh library seperti sharp atau curve25519
RUN apk add --no-cache python3 make g++ git vips-dev font-noto

# Set working directory
WORKDIR /app

# --- Tahap 2: Dependencies ---
# Copy package.json dan package-lock.json untuk memanfaatkan layer caching Docker
COPY package*.json ./

# Install dependencies memakai lockfile jika tersedia untuk konsistensi
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# --- Tahap 3: Source Code ---
# Copy seluruh kode aplikasi (yang tidak di-ignore .dockerignore)
COPY . .

# Pastikan folder penyimpanan ada
RUN mkdir -p sessions auth_info_baileys media

# --- Tahap 4: Konfigurasi Runtime ---
# Expose port default (aplikasi membaca process.env.PORT, tapi ini dokumentasi)
EXPOSE 3000

# Environment variable standard untuk production
ENV NODE_ENV=production

# Perintah eksekusi (menggunakan script start yang sudah kita optimasi tadi)
CMD ["npm", "start"]
