# dropby — Claude Instructions

## What dropby is

dropby helps people spend more real time together. The app's job is to remove the friction between "I'd love to see you" and actually meeting up — spontaneously or planned. **Success means people are using the app less because they're out seeing each other more.**

Two connected problems it solves:

1. **Spontaneous visits have died** in most cultures. The coordination overhead — WhatsApp threads, voice messages, back-and-forth — kills the impulse before it becomes a meetup.
2. **Friend-time doesn't get calendared.** Traditional calendar apps aren't used for coordinating with friends. Plans often just don't happen.

dropby sits between these: low-friction enough for the spontaneous case, structured enough for the planned case.

## The door metaphor

"Opening your door" is the core framing — it signals availability without the weight of a formal invitation. The home is the anchor.

- Prefer **"door"** over "availability", **"visible to"** over "invited", **"on their way"** over "notified"
- The home context is primary but doesn't exclude other settings — a bar, a park, a concert. Those are natural divergences from the frame, not contradictions.
- Protect words that carry unwanted connotations. "Invite" implies a formal ask. "Schedule" implies work. Avoid them where the softer framing fits.

## Copy principles

- Short, warm, direct — no marketing language, no feature descriptions dressed up as benefits
- Conversational first person: "I'm on my way 🏃" not "Notify host of arrival"
- Never use words that make the app feel like a calendar, a group chat, or a social network
- **dropby** is always lowercase, including at the start of sentences

## What dropby is not

- Not a social network (no feeds, likes, follower counts)
- Not a group chat replacement
- Not a traditional calendar app
- Not exclusively spontaneous — planning is equally valid, just lower-friction than existing tools

## About the person I'm working with

Strengths: product thinking, UX, copy, and frontend (React/Tailwind). This is where you can move fast and expect pushback on ideas.

Go slow and explain clearly for: infrastructure, DevOps, and platform setup — things like push notification pipelines, APNs/FCM configuration, app store submission, DNS, email delivery setup, SSL, environment variables, and deployment configuration. For these topics:

- Don't assume familiarity with the tools or consoles involved
- Say which service/console to open and where to find the setting
- Flag when a mistake here is hard to reverse or has cost/security implications
- Prefer one step at a time over a wall of instructions

## Working together

- If something looks like a deliberate product decision, try to understand the intent before questioning it
- Never fabricate or bluff about what code does. If you're unsure whether a change had an effect, read the file to verify before claiming success.
- **But do push back** if something seems internally inconsistent, unclear to users, or in tension with the principles above — that's more useful than silently accepting it
- Never reframe a design decision as a bug without checking first
- Localization: when editing UI copy, always update **all 6 locale files** (en-US, de, es, fr, it, pt, sv)
- iOS input zoom: never use `text-xs` or `text-sm` on `<input>` or `<textarea>` elements — iOS zooms on font-size < 16px. Use `text-base` or larger, or set font-size via inline style if needed.

## Spec

`/spec-full.md` is the source of truth for what the product **does**. Keep it in sync with every change:

- If a screen, flow, data model field, or behaviour changes, update the spec in the same commit
- The spec describes only implemented, live behaviour — not intentions or future work

## TODO

`/TODO.md` tracks what is **not yet done**: deferred features, known gaps, infrastructure tasks.

- If something is removed or deferred during a change, move it to TODO.md (not the spec)
- If a TODO item gets built, remove it from TODO.md and add it to the spec

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

## APNs sandbox (iOS push notifications on dev builds)

When testing push notifications on a real device with a dev build (not TestFlight), set:

```
fly secrets set APNS_SANDBOX=true
```

Unset before TestFlight or production:

```
fly secrets unset APNS_SANDBOX
```

In production (`NODE_ENV=production`), the server uses the production APNs host automatically unless `APNS_SANDBOX=true` is explicitly set.

## Shell

Use `zsh -c "..."` for shell commands (picks up nvm and Node 20).

## Brand

The product name is always **dropby** — all lowercase, including at the start of sentences.

## Stack

- Client: React + Vite + Tailwind (`/client`) — dev at http://localhost:5173
- Server: Node + Express + TypeScript + better-sqlite3 (`/server`) — dev at http://localhost:3000
- Native: Capacitor (iOS/Android)
- Dev: `npm run dev` from root starts both
