# revoked-connection-history

## Input

[revoked-connection-history.json](revoked-connection-history.json)

## Output

### Steps

1. full calls notes__add-note {"text":"milk"} as c1

→ succeeded: {"id":"n1","owner":"p1","text":"milk"} (isError: false; text: "succeeded: {\"id\":\"n1\",\"owner\":\"p1\",\"text\":\"milk\"}")

2. full calls notes__list-notes {} as c2

→ succeeded: [{"id":"n1","owner":"p1","text":"milk"}] (isError: false; text: "succeeded: [{\"id\":\"n1\",\"owner\":\"p1\",\"text\":\"milk\"}]")

3. other calls notes__list-notes {} as c3

→ succeeded: [{"id":"n1","owner":"p1","text":"milk"}] (isError: false; text: "succeeded: [{\"id\":\"n1\",\"owner\":\"p1\",\"text\":\"milk\"}]")

4. the person revokes full

5. a request with the token of full

→ HTTP 401: {"error":"A valid Connection token is required."}

6. the Calls that came through full

| call | action | state |
| --- | --- | --- |
| c1 | notes.add-note | succeeded |
| c2 | notes.list-notes | succeeded |

7. the Calls that came through other

| call | action | state |
| --- | --- | --- |
| c3 | notes.list-notes | succeeded |

### Calls in the App

| call | connection | state | transitions |
| --- | --- | --- | --- |
| c1 | full | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |
| c2 | full | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |
| c3 | other | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
