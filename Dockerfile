# ── Install: shared workspace dependencies ───────────────────────
# One root lockfile is the single source of truth for both workspaces.
# Copying only the package.json files (not source) keeps this layer
# cached across source-only changes.
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci

# ── Build: client ──────────────────────────────────────────────
FROM deps AS client-build
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ARG VITE_APPLE_SERVICE_ID
ENV VITE_APPLE_SERVICE_ID=$VITE_APPLE_SERVICE_ID
COPY scripts/ ./scripts/
COPY client/ client/
RUN npm run build --workspace=client

# ── Build: server ──────────────────────────────────────────────
FROM deps AS server-build
COPY server/ server/
RUN npm run build --workspace=server

# ── Production deps (native modules compiled for target, server only) ──
FROM node:20-alpine AS server-deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --workspace=server --omit=dev

# ── Production ─────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app/server
COPY --from=server-deps /app/node_modules ./node_modules
COPY --from=server-build /app/server/dist ./dist
COPY server/package.json ./package.json
COPY --from=client-build /app/client/dist ../client/dist
RUN mkdir -p data
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
