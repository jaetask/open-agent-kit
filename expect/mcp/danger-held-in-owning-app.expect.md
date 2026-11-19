# danger-held-in-owning-app

## Input

[danger-held-in-owning-app.json](danger-held-in-owning-app.json)

## Output

### Steps

1. full calls notes__add-note {"text":"milk"} as c1

→ succeeded: {"id":"n1","owner":"p1","text":"milk"} (isError: false; text: "succeeded: {\"id\":\"n1\",\"owner\":\"p1\",\"text\":\"milk\"}")

2. full calls notes__delete-note {"id":"n1"} as c2

→ held (isError: false; text: "held for a Decision until 2026-01-02T00:00:00.000Z")

### Calls in the App

| call | connection | state | transitions |
| --- | --- | --- | --- |
| c1 | full | succeeded | START → validating · VALID → authorising · ALLOW → gating · PASS → running · DONE → succeeded |
| c2 | full | held | START → validating · VALID → authorising · ALLOW → gating · HOLD → held |

### Notes

| id | owner | text |
| --- | --- | --- |
| n1 | p1 | milk |
