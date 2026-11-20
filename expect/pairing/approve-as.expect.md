# approve-as

## Input

[approve-as.json](approve-as.json)

## Output

### Steps

1. tasks runs notes 1.0.0
2. POST /pair as "coding agent" → HTTP 200: pair 1, with a claim secret
3. POST /pair as "dashboard" → HTTP 200: pair 2, with a claim secret
4. tasks' page: POST /api/connections/<connection 1>/approve {"principal":"coder","effects":["read","write"]} → {"id":"<connection 1>","host":"coding agent","principal":{"id":"coder"},"effects":["read","write"],"state":"connected"}
5. tasks' page: POST /api/connections/<connection 2>/approve {"effects":["read"]} → {"id":"<connection 2>","host":"dashboard","principal":{"id":"owner"},"effects":["read"],"state":"connected"}
6. tasks' page: POST /api/connections/<connection 2>/approve {"effects":["everything"]} → {"error":"effects is a list of read, write and danger"}
7. tasks' page: GET /api/connections → [{"id":"<connection 1>","host":"coding agent","principal":{"id":"coder"},"effects":["read","write"],"state":"connected"},{"id":"<connection 2>","host":"dashboard","principal":{"id":"owner"},"effects":["read"],"state":"connected"}]
8. claim pair 1 with its secret → HTTP 200: a token

### Log

tasks: coding agent asks to pair. Approve it on this App's page.
tasks: dashboard asks to pair. Approve it on this App's page.

### tasks: notes

None.
