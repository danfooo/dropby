# ── Install: shared workspace dependencies ───────────────────────
# One root lockfile is the single source of truth for both workspaces.
# Copying only the package.json files (not source) keeps this layer
# cached across source-only changes.
FROM node:24-alpine AS deps
RUN apk add --no-cache python3 make g++
# The root postinstall fetches Chromium for the end-to-end tests; no image needs it.
ENV SKIP_PLAYWRIGHT_INSTALL=1
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY shared/package.json shared/package.json
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
# The client reads the API contract's types from source (see client/vite.config.ts).
COPY shared/ shared/
COPY client/ client/
RUN npm run build --workspace=client

# ── Build: server ──────────────────────────────────────────────
FROM deps AS server-build
COPY shared/ shared/
COPY server/ server/
# server's prebuild compiles shared/ first
RUN npm run build --workspace=server

# ── Production deps (native modules compiled for target, server only) ──
FROM node:24-alpine AS server-deps
RUN apk add --no-cache python3 make g++
ENV SKIP_PLAYWRIGHT_INSTALL=1
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY shared/package.json shared/package.json
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --workspace=server --omit=dev

# ── Production ─────────────────────────────────────────────────
FROM node:24-alpine
WORKDIR /app/server
# Same layout as the workspace: node_modules/@dropby/shared is a link to /app/shared.
COPY --from=server-deps /app/node_modules /app/node_modules
COPY --from=server-build /app/shared/package.json /app/shared/package.json
COPY --from=server-build /app/shared/dist /app/shared/dist
COPY --from=server-build /app/server/dist ./dist
COPY server/package.json ./package.json
COPY --from=client-build /app/client/dist ../client/dist
RUN mkdir -p data
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
