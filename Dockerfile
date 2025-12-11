# --- Stage 1: Builder (install native deps & compile modules seperti sharp) ---
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ git vips-dev
WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY . .

# --- Stage 2: Runtime (image ringan hanya dengan runtime libs) ---
FROM node:20-alpine AS runner

RUN apk add --no-cache vips font-noto
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY . .

RUN mkdir -p sessions auth_info_baileys media

EXPOSE 3000
ENV NODE_ENV=production

CMD ["npm", "start"]
