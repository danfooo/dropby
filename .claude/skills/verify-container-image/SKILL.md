---
name: verify-container-image
description: Build and run the production image locally to verify a change before deploying. Use when a change touches the Dockerfile, native modules (e.g. better-sqlite3), or anything that behaves differently in the Alpine/musl production environment than on macOS. This machine uses Apple's `container` CLI, not Docker.
---

# Local image verification (Apple `container`, not Docker)

This machine doesn't have Docker installed. Instead it uses Apple's [`container`](https://github.com/apple/container) CLI — a native macOS tool (Apple silicon only, macOS 15+) that builds and runs standard `Dockerfile`s using Apple's own lightweight VM virtualization instead of a Docker Desktop-style VM. Installed via Homebrew (`brew install container`, the plain formula — not a cask), not Apple's signed `.pkg` installer, but it's the same upstream open-source project either way.

The `Dockerfile` itself is a standard OCI/Docker-format file — nothing about it is Apple- or `container`-specific. `fly deploy` still builds it the normal way, on Fly's own remote builder infrastructure; `container` is only used here for local pre-deploy verification.

One-time setup:

```
brew install container
container system start
container system kernel set --recommended   # downloads the default Linux kernel the VMs boot
```

To verify a change that touches the `Dockerfile`, native modules (e.g. `better-sqlite3`), or anything else that behaves differently in the actual Alpine/musl production environment than on macOS:

```
container build -f Dockerfile --build-arg VITE_GOOGLE_CLIENT_ID="<value from fly.toml>" -t dropby-local .
container run -d --name dropby-local -p 3100:3000 -e JWT_SECRET=<any-value> -e NODE_ENV=production dropby-local:latest
container exec dropby-local wget -qO- http://localhost:3000/api/friends   # sanity check from inside the container
container stop dropby-local && container rm dropby-local
```

Known rough edge: `container run -p host:container` publishes the port, but connecting from the host (`curl localhost:3100`) can reset the connection — an immaturity in this early-stage tool's networking, not an application bug. `container exec <name> wget ...` (hitting the app from inside the container) is the reliable way to check it's actually serving correctly.

Cleanup: `container image rm <name>` after testing to avoid accumulating build layers (a full image build is roughly 1–2 GB).

## Verifying the production serving path without a container

For changes to Express routing or static serving — where the container's value is the Alpine environment, not the routing — building the client and running the server in production mode locally is faster and exercises the same code:

```
cd client && npx vite build
cd server && NODE_ENV=production PORT=3123 DATA_DIR=./data-check JWT_SECRET=anything npx tsx src/index.ts
```

Then check `/`, a client route, and any server-rendered path. The dev servers never run this block (`isDev` skips it), so Playwright cannot cover it.
