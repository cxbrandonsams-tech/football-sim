# ── Stage 1: Compile TypeScript ───────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npx tsc

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:22-slim AS production
WORKDIR /app

# Build tools required by better-sqlite3 native module compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist/

RUN mkdir -p /data
ENV DATA_DIR=/data
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "dist/server.js"]
