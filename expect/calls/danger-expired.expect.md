# danger-expired

## Input

[danger-expired.json](danger-expired.json)

## Output

### Steps

1. invoke c1 notes.add-note {"text":"milk"} as p1 → succeeded: {"id":"n1","owner":"p1","text":"milk"}; card note v1; changes [{"kind":"created","subject":"note","id":"n1"}]
2. invoke c2 notes.delete-note {"id":"n1"} as p1 → held until 2026-01-02T00:00:00.000Z
3. decide c2 expired → expired: expired: Nobody decided in time. Nothing was changed.

### Calls

| call | state | transitions |
| --- | --- | --- |
| c1 | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |
| c2 | expired | START → validating · VALID → authorising · ALLOW → gating · HOLD → held · EXPIRE → expired |

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
