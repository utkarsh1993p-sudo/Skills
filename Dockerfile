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
# Skip Chromium download (both old and new puppeteer env var names)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY jarvis/backend/package*.json ./

# --omit=optional skips whatsapp-web.js (heavy Chromium dep) entirely
RUN npm ci --omit=dev --omit=optional

COPY jarvis/backend/ ./
COPY --from=frontend-build /build/dist ./frontend/dist

RUN mkdir -p data

EXPOSE 3001
CMD ["node", "src/server.js"]
