# ── Build: client ──────────────────────────────────────────────
FROM node:20-alpine AS client-build
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY scripts/ ../scripts/
COPY client/ ./
RUN npm run build

# ── Build: server ──────────────────────────────────────────────
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# ── Production deps (native modules compiled for target) ────────
FROM node:20-alpine AS server-deps
RUN apk add --no-cache python3 make g++
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

# ── Production ─────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app/server
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY --from=server-build /app/server/dist ./dist
COPY server/package.json ./package.json
COPY --from=client-build /app/client/dist ../client/dist
RUN mkdir -p data
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
