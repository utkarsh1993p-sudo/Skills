# ─── Stage 1: Build React frontend ───────────────────────────────────────────
FROM node:20-slim AS frontend-build
WORKDIR /build
COPY jarvis/frontend/package*.json ./
RUN npm ci
COPY jarvis/frontend/ ./
RUN npm run build

# ─── Stage 2: Production server ───────────────────────────────────────────────
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
# Skip Chromium auto-download — WhatsApp uses system Chromium if present
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY jarvis/backend/package*.json ./
RUN npm ci --omit=dev

COPY jarvis/backend/ ./
COPY --from=frontend-build /build/dist ./frontend/dist

RUN mkdir -p data

EXPOSE 3001
CMD ["node", "src/server.js"]
