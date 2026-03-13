# Drop By — Claude Instructions

## Spec

`/spec-full.md` is the source of truth for the product. Keep it in sync with every change:
- If a screen, flow, data model field, or behaviour changes, update the spec in the same commit
- If something is deferred or removed, move it to the "Known Gaps / Deferred" section rather than deleting it

## Commits

Commit after every change, without being asked. Push immediately too unless it requires a build/deploy (e.g. `fly deploy`), in which case ask first.

- Prefer specific file staging over `git add -A`
- Always co-author: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

## Deploy

Deploy command:
```
fly deploy --build-arg VITE_GOOGLE_CLIENT_ID=750398451662-qnfcr5cab59n6fq86dj54ibnsu69mj15.apps.googleusercontent.com
```

Always ask before deploying — it requires confirmation.

## Shell

Use `zsh -c "..."` for shell commands (picks up nvm and Node 20).

## Stack

- Client: React + Vite + Tailwind (`/client`) — dev at http://localhost:5173
- Server: Node + Express + TypeScript + better-sqlite3 (`/server`) — dev at http://localhost:3000
- Native: Capacitor (iOS/Android)
- Dev: `npm run dev` from root starts both
