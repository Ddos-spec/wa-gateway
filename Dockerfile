# --- Tahap 1: Base Image ---
FROM node:20-alpine

# Install dependensi sistem yang diperlukan untuk native modules (jika ada)
# python3, make, g++, git sering dibutuhkan oleh library seperti sharp atau curve25519
RUN apk add --no-cache python3 make g++ git vips-dev font-noto

# Set working directory
WORKDIR /app

# --- Tahap 2: Dependencies ---
# Copy package.json saja dulu untuk memanfaatkan layer caching Docker
COPY package.json ./

# Install dependencies (gunakan --production jika ingin lebih hemat, tapi terkadang devDeps dibutuhkan untuk build script)
# Kita gunakan 'npm install' standar untuk memastikan kompatibilitas maksimal
RUN npm install

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
