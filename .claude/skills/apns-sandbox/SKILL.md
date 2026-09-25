---
name: apns-sandbox
description: Switch the server between the APNs sandbox and production hosts. Use when testing iOS push notifications on a real device with a dev build, and before shipping to TestFlight or production.
---

# APNs sandbox (iOS push notifications on dev builds)

When testing push notifications on a real device with a dev build (not TestFlight), set:

```
fly secrets set APNS_SANDBOX=true
```

Unset before TestFlight or production:

```
fly secrets unset APNS_SANDBOX
```

In production (`NODE_ENV=production`), the server uses the production APNs host automatically unless `APNS_SANDBOX=true` is explicitly set.
