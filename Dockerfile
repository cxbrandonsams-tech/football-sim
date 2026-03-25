# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:22-slim AS frontend
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ── Stage 2: Compile TypeScript backend ───────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npx tsc

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:22-slim AS production
WORKDIR /app

# Build tools required by better-sqlite3 native bindings
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install production dependencies (rebuilds native modules for this platform)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JS and built frontend
COPY --from=builder /app/dist ./dist/
COPY --from=frontend /app/web/dist ./web/dist/

# SQLite data lives on a mounted volume
RUN mkdir -p /data
ENV DATA_DIR=/data
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "dist/server.js"]
