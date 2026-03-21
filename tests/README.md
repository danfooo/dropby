# dropby Tests

## Prerequisites

- **Node 20** via nvm (`nvm use 20` or set as default)
- **Playwright browsers** installed: `npx playwright install`

## Starting the dev server in test mode

Tests require both the client and server running with `NODE_ENV=test` so that the test-only endpoints (`/api/test/*`) are available.

```sh
NODE_ENV=test npm run dev:server   # terminal 1
npm run dev:client                  # terminal 2
```

Or with a single command using concurrently:

```sh
NODE_ENV=test npm run dev
```

> The `/api/test/*` endpoints (reset, verification-link, make-friends, status) only exist when `NODE_ENV=test`. They are never compiled into the production build.

## Running tests

**All tests:**
```sh
npm test
```

**Single spec file:**
```sh
npx playwright test tests/specs/auth.spec.ts
```

**Headed mode (visible browser):**
```sh
npx playwright test --headed
```

**View the HTML report after a run:**
```sh
npx playwright show-report
```

## Test user accounts

Tests use fixed `@dropby.test` email addresses (`alice@dropby.test`, `bob@dropby.test`, `carol@dropby.test`). Each spec calls `resetTestUsers()` in `beforeEach` or `beforeAll`, which deletes all `@dropby.test` users (and their cascade-deleted data) before setting up fresh state.

Tests clean up after themselves via the reset call — no manual DB cleanup is needed.

## Test helpers

| File | Purpose |
|---|---|
| `tests/helpers/users.ts` | Shared user fixtures (ALICE, BOB, CAROL) |
| `tests/helpers/auth.ts` | `registerUser`, `verifyEmail`, `loginUser`, `setupUser` |
| `tests/helpers/server.ts` | `resetTestUsers`, `getVerificationLink`, `getUserStatus`, `makeFriends` |
