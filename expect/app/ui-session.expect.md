# ui-session

## Input

[ui-session.json](ui-session.json)

## Output

### Steps

1. POST /api/calls (no session, header) → HTTP 401: {"error":"Sign in first."}
2. GET /events (no session, no header) → HTTP 401: Sign in first.
3. sign in with "not-the-secret" → HTTP 401
4. sign in with "expect-setup-secret" → HTTP 200, cookie HttpOnly; SameSite=Strict; Path=/
5. POST /api/calls (session, no header) → HTTP 403: {"error":"missing X-Kit-Request header"}
6. POST /api/calls (session, header, origin https://evil.example) → HTTP 403: {"error":"cross-origin request"}
7. GET /api/session (session, no header) → HTTP 200: {"signedIn":true}
8. the page calls notes.add-note as u1 → succeeded
9. DELETE /api/session (session, header) → HTTP 200: {"signedIn":false}
10. POST /api/calls (session, header) → HTTP 401: {"error":"Sign in first."}

### Change events seen

created note n1 (u1, caller ui)

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
