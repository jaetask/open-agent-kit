# session-expiry

## Input

[session-expiry.json](session-expiry.json)

## Output

### Steps

1. sign in with "expect-setup-secret" → HTTP 200, cookie HttpOnly; SameSite=Strict; Path=/
2. GET /api/session (session, no header) → HTTP 200: {"signedIn":true}
3. 29 days pass
4. GET /api/session (session, no header) → HTTP 200: {"signedIn":true}
5. 2 days pass
6. GET /api/session (session, no header) → HTTP 200: {"signedIn":false}
7. POST /api/calls (session, header) → HTTP 401: {"error":"Sign in first."}
8. sign in with "expect-setup-secret" → HTTP 200, cookie HttpOnly; SameSite=Strict; Path=/
9. DELETE /api/sessions (session, header) → HTTP 200: {"signedIn":false}
10. GET /api/session (session, no header) → HTTP 200: {"signedIn":false}

### Change events seen

None.

### Notes

None.
