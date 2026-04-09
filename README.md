# dropby

dropby helps people spend more real time together — low-friction enough for a spontaneous visit, structured enough for a planned one.

## Dev setup

Requires **Node 20** (matches the Dockerfile). If you use nvm:

```
nvm use
npm install
npm run dev
```

Client runs at http://localhost:5173, server at http://localhost:3000. The client proxies `/api` to the server automatically.

If you hit native-module errors (e.g. `NODE_MODULE_VERSION` mismatch), clean and reinstall:

```
nvm use
rm -rf node_modules client/node_modules server/node_modules
npm install
```

Copy `.env.example` to `.env` and fill in any values you need locally. Most features work without any API keys in development.

## Stack

- **Client:** React + Vite + Tailwind (`/client`)
- **Server:** Node + Express + TypeScript + SQLite via better-sqlite3 (`/server`)
- **Native:** Capacitor wrapping the Vite build for iOS and Android
- **Hosting:** Fly.io (Frankfurt)

## Deploy

```
fly deploy
```

That's it. `VITE_GOOGLE_CLIENT_ID` is committed to `fly.toml` under `[build.args]`. `NODE_ENV=production` is set there too under `[env]`. Everything else is stored as a Fly secret.

On a new machine, you just need:

```
fly auth login
fly deploy
```

## Production secrets

Set once with `fly secrets set`, then never needed locally again:

| Secret | Purpose |
|--------|---------|
| `JWT_SECRET` | Token signing — generate with `openssl rand -hex 32` |
| `RESEND_API_KEY` | Transactional email |
| `APPLE_SERVICE_ID` | Apple Sign In (web) |
| `APNS_KEY_ID` | iOS push notifications |
| `APNS_TEAM_ID` | iOS push notifications |
| `APNS_PRIVATE_KEY` | iOS push notifications (contents of .p8 file, newlines as `\n`) |
| `FCM_PROJECT_ID` | Android push notifications |
| `FCM_CLIENT_EMAIL` | Android push notifications |
| `FCM_PRIVATE_KEY` | Android push notifications |
| `FCM_PRIVATE_KEY_ID` | Android push notifications |
| `ADMIN_EMAILS` | Comma-separated emails with access to `/admin` |
| `APP_URL` | Base URL for email links (e.g. `https://drop-by.fly.dev`) |

## APNs sandbox

When testing push notifications on a real device with a dev build (not TestFlight):

```
fly secrets set APNS_SANDBOX=true
```

Unset before releasing to TestFlight or production:

```
fly secrets unset APNS_SANDBOX
```
