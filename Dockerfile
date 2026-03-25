# ── Stage 1: compile TypeScript → dist/ ──────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npm run build

# ── Stage 2: production runtime ───────────────────────────────────────────────
FROM node:22-slim AS production
WORKDIR /app

# Native build tools for better-sqlite3
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Install production deps (triggers better-sqlite3 native recompile)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist/

# Volume mount point for SQLite (Fly mounts /data via fly.toml)
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DATA_DIR=/data

EXPOSE 3000
CMD ["node", "dist/server.js"]
