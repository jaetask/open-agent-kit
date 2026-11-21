# 10. The page's routes need the cookie, a header and a same-origin Origin

## Context

The App's page calls `/api/...` from the browser with a cookie. Another site open in the same browser could try to send writes with that cookie.

## Decision

In `src/app/ui.ts` every route but the sign-in check needs the cookie. Every write also needs the `X-Kit-Request` header and, when the browser sends an Origin, an Origin equal to the App's own.

## Consequences

Every page built for an App must send `X-Kit-Request: 1` on each write, as `examples/notes/page/main.tsx` does. A new route goes through the same checks. A GET route must not change anything, because GET skips the header check.
