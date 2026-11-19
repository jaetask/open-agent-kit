# limits

## Input

[limits.json](limits.json)

## Output

### Steps

1. tasks runs notes 1.0.0
2. POST /pair as "host 1" → HTTP 200: pair 1, with a claim secret
3. POST /pair as "host 2" → HTTP 200: pair 2, with a claim secret
4. POST /pair as "host 3" → HTTP 200: pair 3, with a claim secret
5. POST /pair as "host 4" → HTTP 200: pair 4, with a claim secret
6. POST /pair as "host 5" → HTTP 200: pair 5, with a claim secret
7. POST /pair as "host 6" → HTTP 429: Too many pairing requests are waiting.
8. POST /pair as "<script>alert(1)</script>" → HTTP 400: A pairing request needs a host name and a list of Effects.
9. POST /pair as "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" → HTTP 400: A pairing request needs a host name and a list of Effects.
10. POST /pair as "" → HTTP 400: A pairing request needs a host name and a list of Effects.
11. tasks' page: GET /api/connections → [{"id":"<connection 1>","host":"host 1","principal":{"id":"owner"},"effects":["read"],"state":"pairing"},{"id":"<connection 2>","host":"host 2","principal":{"id":"owner"},"effects":["read"],"state":"pairing"},{"id":"<connection 3>","host":"host 3","principal":{"id":"owner"},"effects":["read"],"state":"pairing"},{"id":"<connection 4>","host":"host 4","principal":{"id":"owner"},"effects":["read"],"state":"pairing"},{"id":"<connection 5>","host":"host 5","principal":{"id":"owner"},"effects":["read"],"state":"pairing"}]
12. claim pair 1 with its secret → HTTP 202: {"state":"waiting"}
13. claim pair 1 with a wrong secret → HTTP 403: Refused.
14. 11 minutes pass
15. tasks' page: GET /api/connections → []
16. claim pair 1 with its secret → HTTP 403: Refused.
17. POST /pair as "host 7" → HTTP 200: pair 6, with a claim secret
18. tasks' page: POST /api/connections/<connection 6>/approve → {"id":"<connection 6>","host":"host 7","principal":{"id":"owner"},"effects":["read"],"state":"connected"}
19. claim pair 6 with its secret → HTTP 200: a token
20. claim pair 6 with its secret → HTTP 403: Refused.

### Log

tasks: host 1 asks to pair. Approve it on this App's page.
tasks: host 2 asks to pair. Approve it on this App's page.
tasks: host 3 asks to pair. Approve it on this App's page.
tasks: host 4 asks to pair. Approve it on this App's page.
tasks: host 5 asks to pair. Approve it on this App's page.
tasks: host 7 asks to pair. Approve it on this App's page.

### tasks: notes

None.
